type CloudSave = {
  stateB64: string;
  preview: string;
  savedAt: number;
  checkpointVersion: number;
  dateStr: string;
};

type DriveFile = { id: string; name?: string };

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const TOKEN_API = "https://oauth2.googleapis.com/token";
const SAVE_FOLDER_NAME = "Master Games Arcade Saves";
const APP_PROPERTY_KEY = "mga_save_key";
const MAX_UPLOAD_BYTES = 10_000_000;

let cachedAccessToken = "";
let accessTokenExpiresAt = 0;
let tokenRefresh: Promise<string> | null = null;

function config() {
  const clientId = process.env["GOOGLE_DRIVE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_DRIVE_CLIENT_SECRET"];
  const refreshToken = process.env["GOOGLE_DRIVE_REFRESH_TOKEN"];
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google Drive não configurado. Defina GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET e GOOGLE_DRIVE_REFRESH_TOKEN no ambiente do servidor.",
    );
  }
  return { clientId, clientSecret, refreshToken };
}

export function isGoogleDriveSavesConfigured(): boolean {
  return Boolean(
    process.env["GOOGLE_DRIVE_CLIENT_ID"] &&
    process.env["GOOGLE_DRIVE_CLIENT_SECRET"] &&
    process.env["GOOGLE_DRIVE_REFRESH_TOKEN"],
  );
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt - 60_000) return cachedAccessToken;
  if (tokenRefresh) return tokenRefresh;
  tokenRefresh = (async () => {
    const { clientId, clientSecret, refreshToken } = config();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const response = await fetch(TOKEN_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = (await response.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
    } | null;
    if (!response.ok || !payload?.access_token) {
      cachedAccessToken = "";
      accessTokenExpiresAt = 0;
      throw new Error(`Google OAuth token refresh failed (${response.status}).`);
    }
    cachedAccessToken = payload.access_token;
    accessTokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000;
    return cachedAccessToken;
  })();
  try {
    return await tokenRefresh;
  } finally {
    tokenRefresh = null;
  }
}

async function driveRequest(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

async function driveJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Não repassamos detalhes da API (ou tokens) ao cliente final.
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
  const filePath = existingFile ? `/files/${encodeURIComponent(existingFile.id)}` : "/files";
  const start = await driveRequest(
    `${DRIVE_UPLOAD_API}${filePath}?uploadType=resumable&fields=id,name`,
    {
      method: existingFile ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/json",
        "X-Upload-Content-Length": String(new TextEncoder().encode(encodedContent).byteLength),
      },
      body: JSON.stringify(metadata),
    },
  );
  if (!start.ok) throw new Error(`Google Drive upload initialization failed (${start.status}).`);
  const uploadUrl = start.headers.get("location");
  if (!uploadUrl || new URL(uploadUrl).origin !== "https://www.googleapis.com") {
    throw new Error("Google Drive did not return a valid resumable upload URL.");
  }
  const complete = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: encodedContent,
  });
  if (!complete.ok) throw new Error(`Google Drive save upload failed (${complete.status}).`);
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
