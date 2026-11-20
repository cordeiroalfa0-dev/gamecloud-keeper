type CloudSave = {
  stateB64: string;
  preview: string;
  savedAt: number;
  checkpointVersion: number;
  dateStr: string;
};

type DriveFile = { id: string; name?: string };
type DriveSavesMode = "disabled" | "configured" | "misconfigured";
type DriveTransport = "gateway" | "oauth";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SAVE_FOLDER_NAME = "Master Games Arcade Saves";
const APP_PROPERTY_KEY = "mga_save_key";
const USER_PROPERTY_KEY = "mga_user_key";
const MAX_UPLOAD_BYTES = 10_000_000;

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function gatewayCredentials() {
  return {
    apiKey: process.env["LOVABLE_API_KEY"],
    connectionKey: process.env["GOOGLE_DRIVE_API_KEY"],
  };
}

function oauthCredentials() {
  return {
    clientId: process.env["GOOGLE_DRIVE_CLIENT_ID"],
    clientSecret: process.env["GOOGLE_DRIVE_CLIENT_SECRET"],
    refreshToken: process.env["GOOGLE_DRIVE_REFRESH_TOKEN"],
  };
}

function gatewayReady() {
  const { apiKey, connectionKey } = gatewayCredentials();
  return Boolean(apiKey && connectionKey);
}

function oauthReady() {
  const { clientId, clientSecret, refreshToken } = oauthCredentials();
  return Boolean(clientId && clientSecret && refreshToken);
}

// Ordem de preferência: a conexão do Google Drive ligada ao projeto (gateway)
// primeiro; o OAuth direto continua funcionando como alternativa.
function activeTransport(): DriveTransport | null {
  if (gatewayReady()) return "gateway";
  if (oauthReady()) return "oauth";
  return null;
}

export function getGoogleDriveSavesMode(): DriveSavesMode {
  if (activeTransport()) return "configured";
  const present =
    Object.values(gatewayCredentials()).filter(Boolean).length +
    Object.values(oauthCredentials()).filter(Boolean).length;
  return present > 0 ? "misconfigured" : "disabled";
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.value;
  }

  const { clientId, clientSecret, refreshToken } = oauthCredentials();
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

function applyTransportHeaders(headers: Headers, transport: DriveTransport): void {
  if (transport === "gateway") {
    const { apiKey, connectionKey } = gatewayCredentials();
    if (!apiKey || !connectionKey) {
      throw new Error("A conexão do Google Drive está incompleta no servidor.");
    }
    headers.set("Authorization", `Bearer ${apiKey}`);
    headers.set("X-Connection-Api-Key", connectionKey);
    return;
  }
  // OAuth direto: o token é resolvido pelo chamador antes de chegar aqui.
}

async function driveRequest(
  transport: DriveTransport,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  // "/upload/..." usa o endpoint de upload; o prefixo é removido porque a base
  // já aponta para ele.
  const isUpload = path.startsWith("/upload/");
  const suffix = isUpload ? path.slice("/upload".length) : path;
  const base =
    transport === "gateway"
      ? isUpload
        ? `${GATEWAY_BASE}/upload/drive/v3`
        : `${GATEWAY_BASE}/drive/v3`
      : isUpload
        ? DRIVE_UPLOAD_API
        : DRIVE_API;
  const headers = new Headers(init.headers);
  if (transport === "oauth") {
    headers.set("Authorization", `Bearer ${await getAccessToken()}`);
  } else {
    applyTransportHeaders(headers, transport);
  }
  return fetch(`${base}${suffix}`, { ...init, headers });
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

async function getSaveFolderId(transport: DriveTransport): Promise<string> {
  const query = new URLSearchParams({
    q: `name = '${escapeDriveQuery(SAVE_FOLDER_NAME)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    pageSize: "1",
    fields: "files(id,name)",
  });
  const list = await driveJson<{ files?: DriveFile[] }>(
    await driveRequest(transport, `/files?${query.toString()}`),
  );
  if (list.files?.[0]?.id) return list.files[0].id;

  const created = await driveJson<DriveFile>(
    await driveRequest(transport, "/files?fields=id,name", {
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

async function findSaveFile(
  transport: DriveTransport,
  folderId: string,
  saveKey: string,
): Promise<DriveFile | null> {
  const query = new URLSearchParams({
    q: `'${escapeDriveQuery(folderId)}' in parents and appProperties has { key='${APP_PROPERTY_KEY}' and value='${saveKey}' } and trashed = false`,
    pageSize: "1",
    fields: "files(id,name)",
  });
  const result = await driveJson<{ files?: DriveFile[] }>(
    await driveRequest(transport, `/files?${query.toString()}`),
  );
  return result.files?.[0] ?? null;
}

async function uploadSave(
  transport: DriveTransport,
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
    appProperties: { [APP_PROPERTY_KEY]: saveKey, [USER_PROPERTY_KEY]: userKey },
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

  const filePath = existingFile
    ? `/upload/files/${encodeURIComponent(existingFile.id)}?uploadType=multipart&fields=id,name`
    : "/upload/files?uploadType=multipart&fields=id,name";
  const response = await driveRequest(transport, filePath, {
    method: existingFile ? "PATCH" : "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(totalLength),
    },
    body,
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error(`Google Drive save upload failed [${response.status}]: ${errorBody}`);
    throw new Error(`Google Drive save upload failed (${response.status}).`);
  }
}

async function downloadSave(
  transport: DriveTransport,
  fileId: string,
): Promise<CloudSave | null> {
  const response = await driveRequest(transport, `/files/${encodeURIComponent(fileId)}?alt=media`);
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

export async function readGoogleDriveSave(
  uid: string,
  rom: string,
  core: string,
): Promise<CloudSave | null> {
  const transport = activeTransport();
  if (!transport) return null;
  const folderId = await getSaveFolderId(transport);
  const saveKey = await hash(`${uid}\u0000${rom}\u0000${core}`);
  const file = await findSaveFile(transport, folderId, saveKey);
  if (!file) return null;
  return downloadSave(transport, file.id);
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
  const transport = activeTransport();
  if (!transport) return { stored: false, save };
  const folderId = await getSaveFolderId(transport);
  const userKey = await hash(uid);
  const saveKey = await hash(`${uid}\u0000${rom}\u0000${core}`);
  const existingFile = await findSaveFile(transport, folderId, saveKey);
  if (existingFile) {
    const remote = await downloadSave(transport, existingFile.id);
    if (
      remote &&
      (remote.savedAt > save.savedAt ||
        (remote.savedAt === save.savedAt && remote.checkpointVersion > save.checkpointVersion))
    ) {
      return { stored: false, save: remote };
    }
  }
  await uploadSave(transport, folderId, existingFile, saveKey, userKey, save);
  return { stored: true, save };
}

export async function deleteGoogleDriveSave(uid: string, rom: string, core: string): Promise<void> {
  const transport = activeTransport();
  if (!transport) return;
  const folderId = await getSaveFolderId(transport);
  const saveKey = await hash(`${uid}\u0000${rom}\u0000${core}`);
  const file = await findSaveFile(transport, folderId, saveKey);
  if (!file) return;
  const response = await driveRequest(transport, `/files/${encodeURIComponent(file.id)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Google Drive save deletion failed (${response.status}).`);
  }
}
