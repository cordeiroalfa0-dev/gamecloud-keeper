import { createFileRoute } from "@tanstack/react-router";

import { createSessionCookie, isSameOriginRequest } from "../../../lib/auth";

// Recebe o token do login Google (Lovable Cloud), valida no servidor e cria
// o cookie de sessão usado pelo player para sincronizar saves.
async function createSession({ request }: { request: Request }) {
  if (!isSameOriginRequest(request)) {
    return new Response(JSON.stringify({ ok: false }), { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { access_token?: string } | null;
  const token = body?.access_token;
  if (!token) return new Response(JSON.stringify({ ok: false }), { status: 400 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return new Response(JSON.stringify({ ok: false }), { status: 401 });

  const u = data.user;
  const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
  const cookie = await createSessionCookie({
    uid: u.id,
    email: u.email ?? "",
    name: meta["full_name"] || meta["name"] || "",
    picture: meta["avatar_url"] || meta["picture"] || "",
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}

export const Route = createFileRoute("/api/auth/session")({
  server: { handlers: { POST: createSession } },
});
