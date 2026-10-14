import { createFileRoute } from "@tanstack/react-router";

// TVs e celulares no mesmo Wi-Fi saem pela internet com o mesmo IP público.
// A TV avisa "estou aqui" e o celular lista as TVs com o mesmo IP (só o hash é salvo).
async function netHash(request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const data = new TextEncoder().encode(`mga-tv:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/public/tv-presence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { room?: string; label?: string };
        const room = String(body.room || "").toUpperCase();
        if (!/^MGA-[A-Z0-9]{4}$/.test(room)) return json({ ok: false }, 400);
        const label = String(body.label || "TV").slice(0, 40);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("tv_presence")
          .upsert({ room, label, net_hash: await netHash(request), last_seen: new Date().toISOString() });
        return json({ ok: true });
      },
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const since = new Date(Date.now() - 90_000).toISOString();
        const { data } = await supabaseAdmin
          .from("tv_presence")
          .select("room,label,last_seen")
          .eq("net_hash", await netHash(request))
          .gte("last_seen", since)
          .order("last_seen", { ascending: false })
          .limit(10);
        return json({ ok: true, tvs: data ?? [] });
      },
    },
  },
});
