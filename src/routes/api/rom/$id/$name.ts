import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers":
    "Accept-Ranges, Content-Length, Content-Range, Content-Type, Content-Disposition",
};

async function proxyDrive(request: Request, id: string, name: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return new Response(JSON.stringify({ ok: false, error: "ID da ROM inválido." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  if (!/\.(zip|7z|chd)$/i.test(name) || /[\r\n]/.test(name)) {
    return new Response(JSON.stringify({ ok: false, error: "Nome de ROM inválido." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const source = `https://drive.usercontent.google.com/download?export=download&id=${encodeURIComponent(id)}&confirm=t`;
  const headers: Record<string, string> = {
    "User-Agent": "MasterGamesArcade-Web/1.1",
    Accept: "*/*",
  };
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  try {
    const upstream = await fetch(source, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      redirect: "follow",
      headers,
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `Google Drive respondeu ${upstream.status}.` }),
        {
          status: upstream.status || 502,
          headers: { "Content-Type": "application/json", ...CORS },
        },
      );
    }

    const out = new Headers(CORS);
    out.set("Content-Type", upstream.headers.get("content-type") || "application/zip");
    out.set("Content-Disposition", `inline; filename="${name.replace(/["\\\r\n]/g, "_")}"`);
    out.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
    const len = upstream.headers.get("content-length");
    if (len) out.set("Content-Length", len);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) out.set("Content-Range", contentRange);

    if (request.method === "HEAD") {
      return new Response(null, { status: upstream.status, headers: out });
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: (error as Error)?.message || "Falha ao baixar a ROM.",
      }),
      { status: 502, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
}

export const Route = createFileRoute("/api/rom/$id/$name")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      HEAD: ({ request, params }) => proxyDrive(request, params.id, params.name),
      GET: ({ request, params }) => proxyDrive(request, params.id, params.name),
    },
  },
});
