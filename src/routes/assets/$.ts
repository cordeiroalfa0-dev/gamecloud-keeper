import { createFileRoute } from "@tanstack/react-router";
import { proxySystemFile } from "@/lib/system-assets.server";

export const Route = createFileRoute("/assets/$")({
  server: {
    handlers: {
      HEAD: ({ request, params }) => proxySystemFile(request, `assets/${params._splat ?? ""}`),
      GET: ({ request, params }) => proxySystemFile(request, `assets/${params._splat ?? ""}`),
    },
  },
});
