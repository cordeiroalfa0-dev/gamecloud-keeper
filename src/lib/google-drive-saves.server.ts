type CloudSave = {
  stateB64: string;
  preview: string;
  savedAt: number;
  checkpointVersion: number;
  dateStr: string;
};

type DriveFile = { id: string; name?: string };
type DriveSavesMode = "disabled" | "configured" | "misconfigured";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SAVE_FOLDER_NAME = "Master Games Arcade Saves";
const APP_PROPERTY_KEY = "mga_save_key";
const MAX_UPLOAD_BYTES = 10_000_000;

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function configuredCredentials() {
  return {
    clientId: process.env["GOOGLE_DRIVE_CLIENT_ID"],
    clientSecret: process.env["GOOGLE_DRIVE_CLIENT_SECRET"],
    refreshToken: process.env["GOOGLE_DRIVE_REFRESH_TOKEN"],
  };
}

export function getGoogleDriveSavesMode(): DriveSavesMode {
  const credentials = configuredCredentials();
  const present = Object.values(credentials).filter(Boolean).length;
  if (present === 0) return "disabled";
  return present === 3 ? "configured" : "misconfigured";
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.value;
  }

  const { clientId, clientSecret, refreshToken } = configuredCredentials();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("A configuração OAuth do Google Drive está incompleta.");
  }

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`Google OAuth token refresh failed [${response.status}]: ${body}`);
    throw new Error(`Google OAuth token refresh failed (${response.status}).`);
  }

  const token = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!token.access_token) throw new Error("Google OAuth did not return an access token.");
  cachedAccessToken = {
    value: token.access_token,
    expiresAt: now + Math.max(60, Number(token.expires_in) || 3600) * 1000,
  };
  return token.access_token;
}

async function driveRequest(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await getAccessToken()}`);
  return fetch(url, { ...init, headers });
}

async function driveJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`Google Drive API request failed [${response.status}]: ${body}`);
    throw new Error(`Google Drive API request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getSaveFolderId(): Promise<string> {
  const query = new URLSearchParams({
    q: `name = '${escapeDriveQuery(SAVE_FOLDER_NAME)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    pageSize: "1",
    fields: "files(id,name)",
  });
  const list = await driveJson<{ files?: DriveFile[] }>(
    await driveRequest(`${DRIVE_API}/files?${query.toString()}`),
  );
  if (list.files?.[0]?.id) return list.files[0].id;

  const created = await driveJson<DriveFile>(
    await driveRequest(`${DRIVE_API}/files?fields=id,name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: SAVE_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      }),
    }),
  );
  if (!created.id) throw new Error("Google Drive did not return a folder ID.");
  return created.id;
}

async function findSaveFile(folderId: string, saveKey: string): Promise<DriveFile | null> {
  const query = new URLSearchParams({
    q: `'${escapeDriveQuery(folderId)}' in parents and appProperties has { key='${APP_PROPERTY_KEY}' and value='${saveKey}' } and trashed = false`,
    pageSize: "1",
    fields: "files(id,name)",
  });
  const result = await driveJson<{ files?: DriveFile[] }>(
    await driveRequest(`${DRIVE_API}/files?${query.toString()}`),
  );
  return result.files?.[0] ?? null;
}

async function uploadSave(
  folderId: string,
  existingFile: DriveFile | null,
  saveKey: string,
  userKey: string,
  save: CloudSave,
): Promise<void> {
  const encodedContent = JSON.stringify(save);
  if (new TextEncoder().encode(encodedContent).byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Save file exceeds the configured Drive upload limit.");
  }

  const metadata = {
    name: `${saveKey}.mga-save.json`,
    mimeType: "application/json",
    ...(existingFile ? {} : { parents: [folderId] }),
    appProperties: { [APP_PROPERTY_KEY]: saveKey, mga_user_key: userKey },
  };

  const boundary = `mga_${crypto.randomUUID().replace(/-/g, "")}`;
  const encoder = new TextEncoder();
  const parts = [
    encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    ),
    encoder.encode(`--${boundary}\r\nContent-Type: application/json\r\n\r\n`),
    encoder.encode(encodedContent),
    encoder.encode(`\r\n--${boundary}--`),
  ];
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }

  const filePath = existingFile ? `/files/${encodeURIComponent(existingFile.id)}` : "/files";
  const response = await driveRequest(
    `${DRIVE_UPLOAD_API}${filePath}?uploadType=multipart&fields=id,name`,
    {
      method: existingFile ? "PATCH" : "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(totalLength),
      },
      body,
    },
  );
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error(`Google Drive save upload failed [${response.status}]: ${errorBody}`);
    throw new Error(`Google Drive save upload failed (${response.status}).`);
  }
}

export async function readGoogleDriveSave(
  uid: string,
  rom: string,
  core: string,
): Promise<CloudSave | null> {
  const folderId = await getSaveFolderId();
  const saveKey = await hash(`${uid}\u0000${rom}\u0000${core}`);
  const file = await findSaveFile(folderId, saveKey);
  if (!file) return null;

  const response = await driveRequest(
    `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`,
  );
  if (!response.ok) throw new Error(`Google Drive save download failed (${response.status}).`);
  const save = (await response.json().catch(() => null)) as Partial<CloudSave> | null;
  if (!save || typeof save.stateB64 !== "string") {
    throw new Error("Invalid save document stored in Google Drive.");
  }
  return {
    stateB64: save.stateB64,
    preview: typeof save.preview === "string" ? save.preview : "",
    savedAt: Number(save.savedAt) || 0,
    checkpointVersion: Number(save.checkpointVersion) || 0,
    dateStr: typeof save.dateStr === "string" ? save.dateStr : "",
  };
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function writeGoogleDriveSave(
  uid: string,
  rom: string,
  core: string,
  save: CloudSave,
): Promise<{ stored: boolean; save: CloudSave }> {
  const folderId = await getSaveFolderId();
  const userKey = await hash(uid);
  const saveKey = await hash(`${uid}\u0000${rom}\u0000${core}`);
  const existingFile = await findSaveFile(folderId, saveKey);
  if (existingFile) {
    const remote = await readGoogleDriveSave(uid, rom, core);
    if (
      remote &&
      (remote.savedAt > save.savedAt ||
        (remote.savedAt === save.savedAt && remote.checkpointVersion > save.checkpointVersion))
    ) {
      return { stored: false, save: remote };
    }
  }
  await uploadSave(folderId, existingFile, saveKey, userKey, save);
  return { stored: true, save };
}

export async function deleteGoogleDriveSave(uid: string, rom: string, core: string): Promise<void> {
  const folderId = await getSaveFolderId();
  const saveKey = await hash(`${uid}\u0000${rom}\u0000${core}`);
  const file = await findSaveFile(folderId, saveKey);
  if (!file) return;
  const response = await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Google Drive save deletion failed (${response.status}).`);
  }
}
