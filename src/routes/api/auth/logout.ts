import { createFileRoute } from "@tanstack/react-router";

import { clearSessionCookie } from "../../../lib/auth";

async function logout() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie() },
  });
}

export const Route = createFileRoute("/api/auth/logout")({
  server: { handlers: { POST: logout } },
});
