// Sessão simples via cookie assinado (Web Crypto API — funciona em runtime
// Node e Edge, sem depender de "node:crypto"). O login em si é feito só
// com a conta do Google (veja routes/api/auth/google*.ts).

const COOKIE_NAME = "mga_session";
const STATE_COOKIE_NAME = "mga_oauth_state";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function getSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error(
      "JWT_SECRET não configurado. Vá em Settings → Environment Variables no projeto da " +
        "Vercel, crie JWT_SECRET com qualquer texto aleatório longo e faça um novo deploy.",
    );
  }
  return secret;
}

type SessionPayload = { uid: string; email: string; name: string; picture: string; exp: number };

async function hmacSign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

export async function createSessionCookie(user: {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
}): Promise<string> {
  const payload: SessionPayload = {
    uid: user.uid,
    email: user.email,
    name: user.name || "",
    picture: user.picture || "",
    exp: Date.now() + MAX_AGE_SECONDS * 1000,
  };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSign(body);
  // O player usa um access token Bearer validado pelo Supabase; este cookie
  // fica restrito ao fluxo legado e não precisa ser enviado como terceiro.
  return `${COOKIE_NAME}=${body}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function readSession(request: Request): Promise<SessionPayload | null> {
  try {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    if (!match) return null;
    const [body, sig] = match[1]!.split(".");
    if (!body || !sig) return null;
    const expected = await hmacSign(body);
    if (expected !== sig) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Rejeitar origens externas nas rotas mutáveis evita aceitar requisições CSRF.
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

// --- Proteção CSRF do fluxo OAuth (parâmetro "state") ---

export function createOAuthStateCookie(): { cookie: string; state: string } {
  const state = crypto.randomUUID();
  const cookie = `${STATE_COOKIE_NAME}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
  return { cookie, state };
}

export function readOAuthStateCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${STATE_COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

export function clearOAuthStateCookie(): string {
  return `${STATE_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
