import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { GameLibrary } from "@/components/GameLibrary";
import { RemoteController } from "@/components/RemoteController";
import { lovable } from "@/integrations/lovable";
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
  const [guestEmail, setGuestEmail] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("mga-guest-email") ?? "";
  });
  const [emailDraft, setEmailDraft] = useState(guestEmail);

  const enterWithEmail = () => {
    const normalizedEmail = emailDraft.trim().toLowerCase();
    if (!normalizedEmail) return;
    window.localStorage.setItem("mga-guest-email", normalizedEmail);
    setGuestEmail(normalizedEmail);
  };

  const [googlePending, setGooglePending] = useState(false);
  const enterWithGoogle = async () => {
    if (googlePending) return;
    setGooglePending(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/?launcher=1`,
      });
      if (result.error) {
        alert("Não foi possível abrir o login do Google. Tente novamente.");
        setGooglePending(false);
      }
      // Quando redireciona, a página sai daqui; o retorno é tratado no Index.
    } catch {
      alert("Não foi possível abrir o login do Google. Tente novamente.");
      setGooglePending(false);
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
    <div className="flex items-center gap-2 rounded-full border border-cyan-500/45 bg-black/85 py-1 pl-1 pr-2 font-mono text-[11px] text-cyan-200 shadow-[0_4px_14px_rgba(0,0,0,.75)]">
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
        className="rounded border border-cyan-500/60 bg-black/70 px-1.5 py-0.5 text-cyan-200 shadow-[0_2px_8px_rgba(0,0,0,.7)] hover:bg-cyan-400/15"
      >
        Sair
      </button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-end gap-1 rounded-2xl border border-cyan-500/45 bg-black/85 px-2 py-1 font-mono text-[11px] text-cyan-200 shadow-[0_4px_14px_rgba(0,0,0,.75)]">
      {guestEmail ? (
        <span className="max-w-[180px] truncate" title={guestEmail}>
          {guestEmail}
        </span>
      ) : (
        <span>Entre com qualquer e-mail</span>
      )}
      <input
        type="email"
        name="email"
        value={emailDraft}
        onChange={(event) => setEmailDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") enterWithEmail();
        }}
        placeholder="seu@email.com"
        aria-label="Seu e-mail"
        autoComplete="email"
        className="w-40 rounded border border-cyan-500/40 bg-black/70 px-2 py-1 text-cyan-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300"
      />
      <button
        type="button"
        onClick={enterWithEmail}
        className="rounded border border-cyan-500/60 bg-black/70 px-1.5 py-1 text-cyan-200 shadow-[0_2px_8px_rgba(0,0,0,.7)] hover:bg-cyan-400/15"
      >
        Entrar
      </button>
      <button
        type="button"
        onClick={enterWithGoogle}
        disabled={googlePending}
        className="flex items-center gap-1 rounded border border-cyan-300/70 bg-cyan-400/15 px-1.5 py-1 font-bold text-cyan-100 shadow-[0_2px_8px_rgba(0,0,0,.7)] hover:bg-cyan-400/30 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M12 5.04c1.62 0 3.06.56 4.2 1.64l3.12-3.12C17.46 1.8 14.96.72 12 .72 7.44.72 3.56 3.42 1.7 7.32l3.66 2.84C6.24 7.26 8.88 5.04 12 5.04z"
          />
          <path
            fill="#4285F4"
            d="M23.28 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.34c-.27 1.48-1.11 2.73-2.36 3.57l3.6 2.79c2.11-1.95 3.7-4.83 3.7-8.55z"
          />
          <path
            fill="#FBBC05"
            d="M5.36 14.29a7.2 7.2 0 0 1 0-4.58L1.7 6.87a11.28 11.28 0 0 0 0 10.26l3.66-2.84z"
          />
          <path
            fill="#34A853"
            d="M12 23.28c3.04 0 5.6-1 7.46-2.72l-3.6-2.79c-1 .68-2.29 1.08-3.86 1.08-3.12 0-5.76-2.22-6.64-5.12l-3.66 2.84c1.86 3.9 5.74 6.71 10.3 6.71z"
          />
        </svg>
        {googlePending ? "Abrindo…" : "Entrar com Google"}
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
