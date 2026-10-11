import { createFileRoute } from "@tanstack/react-router";
import { RemoteController } from "@/components/RemoteController";

export const Route = createFileRoute("/controller")({
  head: () => ({
    meta: [
      { title: "MGA Controle — Controle Remoto" },
      { name: "theme-color", content: "#101820" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [{ rel: "manifest", href: "/remote-manifest.webmanifest" }],
  }),
  component: RemoteController,
});
