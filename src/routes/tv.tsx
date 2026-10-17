import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/tv")({
  head: () => ({
    meta: [
      { title: "Master Games Arcade — Modo TV" },
      { name: "description", content: "Abra o Master Games Arcade na TV e use o celular como controle." },
      { property: "og:title", content: "Master Games Arcade — Modo TV" },
      { property: "og:description", content: "Abra o Master Games Arcade na TV e use o celular como controle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ href: "/?launcher=1&tv=1" });
  },
});
