import { createFileRoute } from "@tanstack/react-router";
import { proxySystemFile } from "@/lib/system-assets.server";

export const Route = createFileRoute("/fonts/$")({
  server: {
    handlers: {
      HEAD: ({ request, params }) => proxySystemFile(request, `fonts/${params._splat ?? ""}`),
      GET: ({ request, params }) => proxySystemFile(request, `fonts/${params._splat ?? ""}`),
    },
  },
});
