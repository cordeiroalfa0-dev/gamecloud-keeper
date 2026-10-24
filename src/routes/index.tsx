import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { GameLibrary } from "@/components/GameLibrary";
import { RemoteController } from "@/components/RemoteController";
import { supabase } from "@/integrations/supabase/client";

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
    links: [{ rel: "manifest", href: "/app-manifest.webmanifest" }],
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
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [user, setUser] = useState<MgaUser | null>(null);
  const [cloudAccessToken, setCloudAccessToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [oauthReturnPending, setOAuthReturnPending] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, "").replace(/^\?/, ""));
    return (
      params.has("code") ||
      params.has("access_token") ||
      params.has("error") ||
      params.has("error_description") ||
      fragment.has("access_token") ||
      fragment.has("refresh_token") ||
      fragment.has("error") ||
      fragment.has("error_description")
    );
  });

  // Rede de segurança: nunca deixa a tela presa em "Carregando...".
  useEffect(() => {
    if (isController) return;
    if (new URLSearchParams(window.location.search).get("launcher") !== "1") return;
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, [isController]);

  useEffect(() => {
    // A intro é a porta de entrada; o launcher só abre depois de pressionar Start.
    if (isController) return;
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "").replace(/^\?/, ""),
    );
    const authCode = params.get("code");
    const accessToken = hashParams.get("access_token") ?? params.get("access_token");
    const refreshToken = hashParams.get("refresh_token") ?? params.get("refresh_token");
    const oauthError =
      params.get("error_description") ||
      params.get("error") ||
      hashParams.get("error_description") ||
      hashParams.get("error");
    const isOAuthReturn = Boolean(
      authCode ||
      accessToken ||
      refreshToken ||
      oauthError ||
      params.has("code") ||
      params.has("error") ||
      params.has("error_description") ||
      hashParams.has("error") ||
      hashParams.has("error_description"),
    );
    if (params.get("launcher") !== "1" && !isOAuthReturn) {
      window.location.replace("/intro.html");
      return;
    }
    if (isOAuthReturn) {
      // Capturamos os dados OAuth acima e os removemos da barra antes de fazer chamadas de rede.
      const cleanParams = new URLSearchParams(params);
      for (const key of [
        "code",
        "state",
        "error",
        "error_description",
        "error_uri",
        "access_token",
        "refresh_token",
        "token_type",
        "expires_in",
        "expires_at",
        "id_token",
        "provider_token",
        "provider_refresh_token",
      ]) {
        cleanParams.delete(key);
      }
      cleanParams.set("launcher", "1");
      const cleanQuery = cleanParams.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}`,
      );
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
        if (oauthError) {
          setGuest();
          alert("O Google não concluiu o login. Tente novamente.");
          return;
        }

        if (authCode) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
          if (error) throw error;
          if (data.session) {
            applySession(data.session);
            return;
          }
        }

        if (accessToken || refreshToken) {
          if (!accessToken || !refreshToken) {
            throw new Error("O retorno do Google não trouxe os dois tokens da sessão.");
          }
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          if (data.session) {
            applySession(data.session);
            return;
          }
        }

        const { data } = await getSessionWithTimeout();
        if (cancelled) return;
        if (data.session) {
          applySession(data.session);
          return;
        }
        if (versionAtStart !== authEventVersion) return;
        if (isOAuthReturn) {
          alert("O Google retornou ao app, mas a sessão não foi criada. Tente entrar novamente.");
        }
        setGuest();
      } catch (error) {
        console.warn("Não foi possível concluir a sessão do login Google.");
        if (isOAuthReturn) {
          alert(
            "O Google retornou ao app, mas não foi possível concluir o login. Tente novamente.",
          );
        }
        setGuest();
      } finally {
        if (isOAuthReturn && !cancelled) setOAuthReturnPending(false);
      }
    };
    refresh();
    return () => {
      cancelled = true;
      sub?.subscription.unsubscribe();
    };
  }, [isController]);

  if (isController) return <RemoteController />;

  if (authState === "checking" && (!ready || oauthReturnPending)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-sm text-cyan-400">
        Carregando...
      </div>
    );
  }

  return (
    <Launcher
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
  user,
  cloudAccessToken,
  onLogout,
}: {
  user: MgaUser | null;
  cloudAccessToken: string | null;
  onLogout: () => void;
}) {
  const [loginPending, setLoginPending] = useState(false);

  const signInWithGoogle = async (selectAccount = false) => {
    if (loginPending) return;
    setLoginPending(true);
    try {
      const { lovable } = await import("@/integrations/lovable");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/?launcher=1`,
        ...(selectAccount ? { extraParams: { prompt: "select_account" } } : {}),
      });
      if (result.error) {
        alert(`Não foi possível entrar com o Google: ${result.error.message}`);
        setLoginPending(false);
        return;
      }
      if (!result.redirected) setLoginPending(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Falha ao iniciar o login Google: ${message}`);
      setLoginPending(false);
    }
  };

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
        onClick={() => void signInWithGoogle()}
        disabled={loginPending}
        aria-live="polite"
        className="rounded border border-cyan-500/50 px-1.5 py-0.5 text-cyan-300 hover:bg-cyan-400/10"
      >
        {loginPending ? "Abrindo Google…" : "Acessar com Google"}
      </button>
      <button
        type="button"
        onClick={() => void signInWithGoogle(true)}
        disabled={loginPending}
        title="Escolher outra conta Google"
        className="rounded border border-cyan-500/30 px-1.5 py-0.5 text-cyan-400 hover:bg-cyan-400/10"
      >
        Outra conta
      </button>
    </div>
  );

  // A biblioteca de jogos (cards, busca, favoritos, recentes) roda
  // inteiramente neste projeto agora — veja src/components/GameLibrary.tsx.
  // Ela só usa o bridge local (public/mame-web.js) para abrir o jogo e
  // ler/gravar favoritos e recentes; não depende mais do bundle remoto
  // hospedado no repositório master-games-arcade-system.
  return <GameLibrary accountSlot={accountBadge} cloudAccessToken={cloudAccessToken} />;
}
