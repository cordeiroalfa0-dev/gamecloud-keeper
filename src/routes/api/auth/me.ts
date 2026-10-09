import { createFileRoute } from "@tanstack/react-router";

import { readSession } from "../../../lib/auth";

async function me({ request }: { request: Request }) {
  const session = await readSession(request);
  if (!session) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      ok: true,
      user: { email: session.email, name: session.name, picture: session.picture },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/auth/me")({
  server: { handlers: { GET: me } },
});
