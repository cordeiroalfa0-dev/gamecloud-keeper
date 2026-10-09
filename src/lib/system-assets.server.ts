// Os arquivos visuais (imagens, fontes, vídeo de abertura) ficam no repositório
// do sistema. Estas funções reproduzem os redirecionamentos que existiam na
// configuração antiga da Vercel.
const RAW =
  "https://raw.githubusercontent.com/cordeiroalfa0-dev/master-games-arcade-system/main/dist";
const CDN = "https://cdn.jsdelivr.net/gh/cordeiroalfa0-dev/master-games-arcade-system@main/dist";

export async function proxySystemFile(request: Request, relativePath: string) {
  const safe = relativePath.replace(/^\/+/, "");
  if (!safe || safe.includes("..")) return new Response("Not found", { status: 404 });

  const base = /\.(mp4|webm|ogg)$/i.test(safe) ? CDN : RAW;
  const range = request.headers.get("range");
  const upstream = await fetch(`${base}/${safe}`, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    redirect: "follow",
    headers: range ? { Range: range, Accept: "*/*" } : { Accept: "*/*" },
  });

  if (!upstream.ok) return new Response("Not found", { status: upstream.status });

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=3600");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  headers.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");

  if (request.method === "HEAD") return new Response(null, { status: upstream.status, headers });
  return new Response(upstream.body, { status: upstream.status, headers });
}
