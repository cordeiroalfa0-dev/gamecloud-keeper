import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { GameLibrary } from "@/components/GameLibrary";
import { RemoteController } from "@/components/RemoteController";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Master Games Arcade" },
      {
        name: "description",
        content:
          "Fliperama online com clássicos de arcade: escolha o jogo, jogue no navegador e continue de onde parou.",
      },
      { property: "og:title", content: "Master Games Arcade" },
      {
        property: "og:description",
        content: "Jogue clássicos de arcade direto no navegador e salve seu progresso.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type AuthState = "checking" | "guest" | "authed";
type MgaUser = { email: string; name?: string; picture?: string };
const AUTH_CHECK_TIMEOUT_MS = 5000;

async function getSessionWithTimeout() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("A verificação de sessão expirou.")),
          AUTH_CHECK_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function toMgaUser(user: { email?: string; user_metadata?: unknown }): MgaUser {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  const name = text(metadata["full_name"]) || text(metadata["name"]);
  const picture = text(metadata["avatar_url"]) || text(metadata["picture"]);
  return {
    email: user.email ?? "",
    ...(name ? { name } : {}),
    ...(picture ? { picture } : {}),
  };
}

function Index() {
  const isController =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("controller") === "1";
  const isTv =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tv") === "1";
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [user, setUser] = useState<MgaUser | null>(null);
  const [cloudAccessToken, setCloudAccessToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Rede de segurança: nunca deixa a tela presa em "Carregando...".
  useEffect(() => {
    if (isController) return;
    if (isTv) {
      setReady(true);
      return;
    }
    if (new URLSearchParams(window.location.search).get("launcher") !== "1") return;
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, [isController, isTv]);

  useEffect(() => {
    // A intro é a porta de entrada; o launcher só abre depois de pressionar Start.
    if (isController || isTv) return;
    if (new URLSearchParams(window.location.search).get("launcher") !== "1") {
      window.location.replace("/intro.html");
      return;
    }

    let cancelled = false;
    let authEventVersion = 0;
    const applySession = (session: {
      access_token: string;
      user: { email?: string; user_metadata?: unknown };
    }) => {
      if (cancelled) return;
      setCloudAccessToken(session.access_token);
      setUser(toMgaUser(session.user));
      setAuthState("authed");
    };
    const setGuest = () => {
      if (cancelled) return;
      setCloudAccessToken(null);
      setUser(null);
      setAuthState("guest");
    };
    let sub: { subscription: { unsubscribe: () => void } } | null = null;
    try {
      sub = supabase.auth.onAuthStateChange((event, session) => {
        authEventVersion++;
        if (session) {
          applySession(session);
        } else if (event === "SIGNED_OUT") {
          setGuest();
        }
      }).data;
    } catch (error) {
      console.error("Falha ao inicializar a autenticação; usando modo convidado.", error);
      setGuest();
    }
    const refresh = async () => {
      const versionAtStart = authEventVersion;
      try {
        const { data } = await getSessionWithTimeout();
        if (cancelled) return;
        if (data.session) {
          applySession(data.session);
          return;
        }
        if (versionAtStart !== authEventVersion) return;
        setGuest();
      } catch (error) {
        console.warn("Sessão indisponível; continuando como convidado.", error);
        setGuest();
      }
    };
    refresh();
    return () => {
      cancelled = true;
      sub?.subscription.unsubscribe();
    };
  }, [isController, isTv]);

  if (isController) return <RemoteController />;

  if (authState === "checking" && !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-sm text-cyan-400">
        Carregando...
      </div>
    );
  }

  return (
    <Launcher
      tvMode={isTv}
      user={user}
      cloudAccessToken={cloudAccessToken}
      onLogout={() => {
        setUser(null);
        setCloudAccessToken(null);
        setAuthState("guest");
      }}
    />
  );
}

function Launcher({
  tvMode,
  user,
  cloudAccessToken,
  onLogout,
}: {
  tvMode: boolean;
  user: MgaUser | null;
  cloudAccessToken: string | null;
  onLogout: () => void;
}) {
  const logout = async () => {
    try {
      await supabase.auth.signOut();
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // segue o logout local mesmo se a chamada falhar
    }
    onLogout();
  };

  const accountBadge = user ? (
    <div className="flex items-center gap-2 rounded-full border border-cyan-500/30 bg-black/50 py-1 pl-1 pr-2 font-mono text-[11px] text-cyan-300">
      {user?.picture && (
        <img
          src={user.picture}
          alt=""
          referrerPolicy="no-referrer"
          className="h-5 w-5 rounded-full"
        />
      )}
      <span className="max-w-[110px] truncate">{user?.name || user?.email}</span>
      <button
        type="button"
        onClick={logout}
        className="rounded border border-cyan-500/50 px-1.5 py-0.5 text-cyan-300 hover:bg-cyan-400/10"
      >
        Sair
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2 rounded-full border border-cyan-500/30 bg-black/50 px-2 py-1 font-mono text-[11px] text-cyan-300">
      <span>Modo convidado · saves locais</span>
      <button
        type="button"
        onClick={async () => {
          const result = await lovable.auth.signInWithOAuth("google", {
            redirect_uri: `${window.location.origin}/?launcher=1`,
          });
          if (result.error) alert("Não foi possível entrar com o Google.");
        }}
        className="rounded border border-cyan-500/50 px-1.5 py-0.5 text-cyan-300 hover:bg-cyan-400/10"
      >
        Login Google
      </button>
    </div>
  );

  // A biblioteca de jogos (cards, busca, favoritos, recentes) roda
  // inteiramente neste projeto agora — veja src/components/GameLibrary.tsx.
  // Ela só usa o bridge local (public/mame-web.js) para abrir o jogo e
  // ler/gravar favoritos e recentes; não depende mais do bundle remoto
  // hospedado no repositório master-games-arcade-system.
  return (
    <GameLibrary
      accountSlot={tvMode ? null : accountBadge}
      cloudAccessToken={cloudAccessToken}
      tvMode={tvMode}
    />
  );
}
