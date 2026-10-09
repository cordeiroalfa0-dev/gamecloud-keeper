import { createFileRoute, notFound } from "@tanstack/react-router";
import { proxySystemFile } from "@/lib/system-assets.server";

// O core FBNeo do EmulatorJS grava a BIOS usando a própria URL como caminho
// interno, por isso ela precisa ser servida na raiz com o nome exato
// (ex.: /neogeo.zip). O ID do arquivo vem do catálogo roms-manifest.json.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers":
    "Accept-Ranges, Content-Length, Content-Range, Content-Type, Content-Disposition",
};

const REMOTE_CATALOG =
  "https://raw.githubusercontent.com/cordeiroalfa0-dev/master-games-arcade-system/main/roms-manifest.json";

type CatalogFile = { name?: string; id?: string; skipDownload?: boolean };

async function loadCatalog(request: Request): Promise<CatalogFile[]> {
  const local = new URL("/roms-manifest.json", request.url).href;
  for (const url of [local, REMOTE_CATALOG]) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const data = (await res.json()) as { files?: CatalogFile[] };
      if (Array.isArray(data?.files) && data.files.length) return data.files;
    } catch {
      // tenta a próxima origem do catálogo
    }
  }
  return [];
}

async function serveBios(request: Request, fileName: string) {
  if (fileName === "favicon.png" || fileName === "intro_bg.mp4") {
    return proxySystemFile(request, fileName);
  }
  if (!/^[A-Za-z0-9_.-]+\.zip$/i.test(fileName)) throw notFound();

  const files = await loadCatalog(request);
  const wanted = fileName.toLowerCase();
  const match = files.find(
    (file) => String(file?.name || "").toLowerCase() === wanted && !file?.skipDownload,
  );
  if (!match?.id) throw notFound();

  const source = `https://drive.usercontent.google.com/download?export=download&id=${encodeURIComponent(String(match.id).trim())}&confirm=t`;
  const headers: Record<string, string> = {
    "User-Agent": "MasterGamesArcade-Web/1.1",
    Accept: "*/*",
  };
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  const upstream = await fetch(source, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    redirect: "follow",
    headers,
  });

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: `Google Drive respondeu ${upstream.status}.` }),
      { status: upstream.status || 502, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }

  const out = new Headers(CORS);
  out.set("Content-Type", upstream.headers.get("content-type") || "application/zip");
  out.set("Content-Disposition", `inline; filename="${fileName}"`);
  out.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
  const len = upstream.headers.get("content-length");
  if (len) out.set("Content-Length", len);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) out.set("Content-Range", contentRange);

  if (request.method === "HEAD")
    return new Response(null, { status: upstream.status, headers: out });
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const Route = createFileRoute("/$biosFile")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      HEAD: ({ request, params }) => serveBios(request, params.biosFile),
      GET: ({ request, params }) => serveBios(request, params.biosFile),
    },
  },
});
