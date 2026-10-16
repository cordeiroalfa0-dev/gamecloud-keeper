import { useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import "./RemoteController.css";

const buttonClass =
  "remote-controller-control select-none touch-none rounded-full border-2 font-mono font-black tracking-wide transition-[transform,filter,box-shadow] duration-100 shadow-[inset_0_1px_0_rgba(255,255,255,.28),inset_0_-7px_0_rgba(0,0,0,.22),0_7px_0_rgba(15,23,42,.8),0_12px_24px_rgba(2,6,23,.28)] active:translate-y-1 active:shadow-[inset_0_2px_5px_rgba(0,0,0,.3),0_2px_0_rgba(15,23,42,.8)] active:brightness-125";

type RemotePayload = { room: string; player: number; input: number; pressed: boolean };
type RemoteCommand = "toggle-pause" | "save-and-exit" | "toggle-game-fullscreen" | "launch-game";

type RemoteSession = { room: string; player: 1 | 2 };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const REMOTE_SESSION_KEY = "mga-remote-session-v1";
const REMOTE_INSTALLED_KEY = "mga-remote-app-installed-v1";
const REMOTE_CAST_MODE_KEY = "mga-remote-cast-mode-v1";
const REMOTE_INPUT = { CREDIT: 2, START: 3 } as const;
const MOMENTARY_INPUTS = new Set<number>([REMOTE_INPUT.CREDIT, REMOTE_INPUT.START]);
const MIN_MOMENTARY_PRESS_MS = 120;

const readRemoteSession = (): RemoteSession => {
  // Durante o SSR não existe window/sessionStorage: devolve a sessão vazia.
  if (typeof window === "undefined") return { room: "", player: 1 };
  const params = new URLSearchParams(window.location.search);
  const fromUrl = {
    room: (params.get("room") || "").toUpperCase(),
    player: params.get("player") === "2" ? 2 : 1,
  } as RemoteSession;
  if (fromUrl.room) {
    const serialized = JSON.stringify(fromUrl);
    try {
      window.sessionStorage.setItem(REMOTE_SESSION_KEY, serialized);
    } catch {
      // O armazenamento pode estar bloqueado no modo privado.
    }
    try {
      window.localStorage.setItem(REMOTE_SESSION_KEY, serialized);
    } catch {
      // O armazenamento local pode estar bloqueado no modo privado.
    }
    return fromUrl;
  }
  for (const getStorage of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const stored = JSON.parse(
        getStorage().getItem(REMOTE_SESSION_KEY) || "null",
      ) as Partial<RemoteSession>;
      if (typeof stored.room === "string" && stored.room) {
        return { room: stored.room.toUpperCase(), player: stored.player === 2 ? 2 : 1 };
      }
    } catch {
      // O armazenamento pode estar indisponível ou conter uma sessão inválida.
    }
  }
  return fromUrl;
};

const readRemoteCastMode = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has("controller")) {
    const castMode = params.get("cast") === "1";
    try {
      window.localStorage.setItem(REMOTE_CAST_MODE_KEY, castMode ? "1" : "0");
    } catch {
      // O armazenamento pode estar bloqueado no modo privado.
    }
    return castMode;
  }
  try {
    return window.localStorage.getItem(REMOTE_CAST_MODE_KEY) === "1";
  } catch {
    return false;
  }
};

export function RemoteController() {
  const [{ room, player }] = useState(readRemoteSession);
  const [castMode] = useState(readRemoteCastMode);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeInputs = useRef(new Set<number>());
  const inputPressedAt = useRef(new Map<number, number>());
  const inputReleaseTimers = useRef(new Map<number, number>());
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installationRequired, setInstallationRequired] = useState(false);
  const [installInfoOpen, setInstallInfoOpen] = useState(false);

  useEffect(() => {
    // REGRA DE OURO: o link do QR code nunca deve ficar exposto na experiência
    // do controle remoto. Os parâmetros já foram capturados em memória acima;
    // removê-los do histórico também evita que apareçam ao compartilhar a tela.
    window.history.replaceState(
      { ...window.history.state, mgaRemoteController: true },
      document.title,
      `${window.location.pathname}${window.location.hash}`,
    );

    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    let installedBefore = false;
    try {
      installedBefore = localStorage.getItem(REMOTE_INSTALLED_KEY) === "1";
    } catch {
      // O armazenamento pode estar bloqueado no modo privado.
    }
    const appInstalled = standalone || installedBefore;
    setInstalled(appInstalled);
    setInstallationRequired(!appInstalled);
    if (!appInstalled) setInstallInfoOpen(true);

    const onInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      try {
        localStorage.setItem(REMOTE_INSTALLED_KEY, "1");
      } catch {
        // O armazenamento pode estar bloqueado no modo privado.
      }
      setInstalled(true);
      setInstallInfoOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled, { once: true });
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const installRemoteApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") {
      try {
        localStorage.setItem(REMOTE_INSTALLED_KEY, "1");
      } catch {
        // O armazenamento pode estar bloqueado no modo privado.
      }
      setInstalled(true);
      setInstallInfoOpen(true);
    }
  };

  const continueAfterManualInstall = () => {
    try {
      localStorage.setItem(REMOTE_INSTALLED_KEY, "1");
    } catch {
      // O armazenamento pode estar bloqueado no modo privado.
    }
    setInstalled(true);
    setInstallInfoOpen(true);
  };

  const requestWakeLock = async () => {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      // Wake Lock pode ser bloqueado por economia de bateria ou pelo navegador.
    }
  };

  const requestLandscape = async () => {
    try {
      const lock = (
        screen.orientation as
          | (ScreenOrientation & {
              lock?: (orientation: string) => Promise<void>;
            })
          | undefined
      )?.lock;
      if (lock) {
        try {
          await lock.call(screen.orientation, "landscape-primary");
        } catch {
          await lock.call(screen.orientation, "landscape");
        }
      }
    } catch {
      // iOS e alguns navegadores bloqueiam o lock fora de um modo instalado.
    }
  };

  useEffect(() => {
    void requestLandscape();
    void requestWakeLock();
    const restoreWakeLock = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };
    window.addEventListener("visibilitychange", restoreWakeLock, { passive: true });
    return () => {
      window.removeEventListener("visibilitychange", restoreWakeLock);
      const wakeLock = wakeLockRef.current;
      if (wakeLock) void wakeLock.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!room) {
      setError("Código da sala ausente. Peça ao computador um novo código.");
      return;
    }
    const channel = supabase.channel(`mga-remote-${room}`, {
      config: { private: false, broadcast: { ack: false } },
    });
    channelRef.current = channel;
    let readyTimer: number | undefined;
    const announceReady = () =>
      void channel.send({
        type: "broadcast",
        event: "controller-ready",
        payload: { room, player },
      });
    channel
      .on("broadcast", { event: "room-ping" }, ({ payload }) => {
        if (payload?.room === room) {
          setConnected(true);
          const sentAt = Number(payload?.sentAt);
          if (sentAt > 0) setLatency(Math.max(0, Date.now() - sentAt));
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setError("");
          announceReady();
          // O computador pode abrir o jogo depois de o QR Code ser lido.
          // Repetir o handshake evita perder o primeiro anúncio nesse caso.
          readyTimer = window.setInterval(announceReady, 2500);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnected(false);
          setLatency(null);
          setError("Acesso negado à sala. Gere um novo link no computador e tente novamente.");
        }
      });
    return () => {
      if (readyTimer) window.clearInterval(readyTimer);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [room, player]);

  useEffect(() => {
    const releasePressed = () => {
      for (const timer of inputReleaseTimers.current.values()) window.clearTimeout(timer);
      inputReleaseTimers.current.clear();
      inputPressedAt.current.clear();
      for (const input of activeInputs.current) {
        void channelRef.current?.send({
          type: "broadcast",
          event: "input",
          payload: { room, player, input, pressed: false },
        });
      }
      activeInputs.current.clear();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") releasePressed();
    };
    window.addEventListener("blur", releasePressed);
    window.addEventListener("pagehide", releasePressed);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      releasePressed();
      window.removeEventListener("blur", releasePressed);
      window.removeEventListener("pagehide", releasePressed);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [room, player]);

  const send = (input: number, pressed: boolean) => {
    if (!room || !channelRef.current) return;
    if (pressed) navigator.vibrate?.(8);
    if (pressed) activeInputs.current.add(input);
    else activeInputs.current.delete(input);
    const payload: RemotePayload = { room, player, input, pressed };
    void channelRef.current.send({ type: "broadcast", event: "input", payload });
  };
  const sendCommand = (command: RemoteCommand) => {
    if (!room || !channelRef.current) return;
    navigator.vibrate?.(20);
    void channelRef.current.send({
      type: "broadcast",
      event: "command",
      payload: { room, command },
    });
  };

  const releaseInput = (input: number) => {
    const pressedAt = inputPressedAt.current.get(input);
    const remaining =
      MOMENTARY_INPUTS.has(input) && pressedAt !== undefined
        ? MIN_MOMENTARY_PRESS_MS - (Date.now() - pressedAt)
        : 0;
    const release = () => {
      inputReleaseTimers.current.delete(input);
      inputPressedAt.current.delete(input);
      send(input, false);
    };
    if (remaining <= 0) {
      release();
      return;
    }
    const previousTimer = inputReleaseTimers.current.get(input);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    inputReleaseTimers.current.set(input, window.setTimeout(release, remaining));
  };

  const control = (label: string, input: number, className: string) => (
    <button
      type="button"
      className={`${buttonClass} ${className}`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const releaseTimer = inputReleaseTimers.current.get(input);
        if (releaseTimer !== undefined) window.clearTimeout(releaseTimer);
        inputReleaseTimers.current.delete(input);
        inputPressedAt.current.set(input, Date.now());
        send(input, true);
      }}
      onPointerUp={() => releaseInput(input)}
      onPointerCancel={() => releaseInput(input)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  );

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#101820] p-6 text-center font-mono text-orange-200">
        {error}
      </div>
    );
  }

  return (
    <main
      translate="no"
      className="notranslate remote-controller-screen select-none"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={() => {
        void requestLandscape();
        void requestWakeLock();
      }}
    >
      <div className="remote-controller-ambient" aria-hidden="true" />
      {!installationRequired && (
        <div className="remote-controller-frame">
          <header className="remote-controller-topbar">
            <div className="remote-controller-brand">
              <img
                src="/kali-dragon.png"
                alt=""
                aria-hidden="true"
                className="remote-controller-mark"
              />
              <div className="remote-controller-brand-text">
                <div className="remote-controller-wordmark">MASTER GAMES</div>
                <div className="remote-controller-connection">
                  <span
                    className={`remote-controller-status-dot ${connected ? "is-connected" : ""}`}
                  />
                  PAINEL REMOTO ·{" "}
                  {connected
                    ? `CONECTADO${latency === null ? "" : ` · ${latency} MS`}`
                    : "CONECTANDO…"}
                </div>
              </div>
            </div>
            <div className="remote-controller-header-actions">
              {!installed && (
                <button
                  type="button"
                  onClick={() => setInstallInfoOpen(true)}
                  className="remote-controller-chip remote-controller-chip--install"
                  aria-label="Instalar o controle remoto como aplicativo"
                >
                  ↓ INSTALAR
                </button>
              )}
              <button
                type="button"
                onClick={() => sendCommand("toggle-game-fullscreen")}
                className="remote-controller-chip remote-controller-chip--game"
                aria-label={`Alternar tela cheia do jogo ${castMode ? "na TV" : "no computador"}`}
              >
                ⛶ JOGO
              </button>
              <strong
                className={`remote-controller-chip ${player === 1 ? "remote-controller-chip--player1" : "remote-controller-chip--player2"}`}
              >
                JOGADOR {player}
              </strong>
            </div>
          </header>
          <section className="remote-controller-body">
            <div className="remote-controller-quick-actions">
              <button
                type="button"
                onClick={() => sendCommand("toggle-pause")}
                className="remote-controller-utility remote-controller-utility--pause"
              >
                PAUSAR / RETOMAR
              </button>
              <button
                type="button"
                onClick={() => sendCommand("save-and-exit")}
                className="remote-controller-utility remote-controller-utility--save"
              >
                SALVAR E BIBLIOTECA
              </button>
              {control(
                "CRÉDITO",
                REMOTE_INPUT.CREDIT,
                "remote-controller-utility remote-controller-utility--credit",
              )}
              {control(
                "START",
                REMOTE_INPUT.START,
                "remote-controller-utility remote-controller-utility--start",
              )}
            </div>
            <div className="remote-controller-decks">
              <div className="remote-controller-deck" role="group" aria-label="Direcional">
                <div className="remote-controller-dpad-grid">
                  <span aria-hidden="true" />
                  {control(
                    "▲",
                    4,
                    "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-300/45 to-slate-700/65 text-3xl text-slate-50",
                  )}
                  <span aria-hidden="true" />
                  {control(
                    "◀",
                    6,
                    "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-300/45 to-slate-700/65 text-3xl text-slate-50",
                  )}
                  <span className="remote-controller-center" aria-hidden="true">
                    +
                  </span>
                  {control(
                    "▶",
                    7,
                    "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-300/45 to-slate-700/65 text-3xl text-slate-50",
                  )}
                  <span aria-hidden="true" />
                  {control(
                    "▼",
                    5,
                    "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-300/45 to-slate-700/65 text-3xl text-slate-50",
                  )}
                  <span aria-hidden="true" />
                </div>
              </div>
              <div className="remote-controller-deck" role="group" aria-label="Botões de ação">
                <div className="remote-controller-face-grid">
                  <span aria-hidden="true" />
                  {control(
                    "Y",
                    1,
                    "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-300/40 to-slate-700/65 text-2xl text-slate-50",
                  )}
                  <span aria-hidden="true" />
                  {control(
                    "X",
                    9,
                    "h-full w-full border-amber-200/70 bg-gradient-to-b from-amber-300/45 to-amber-800/55 text-2xl text-amber-50",
                  )}
                  {control(
                    "A",
                    8,
                    `h-full w-full ${player === 1 ? "border-cyan-200/80 bg-gradient-to-b from-cyan-300/45 to-cyan-800/55 text-cyan-50" : "border-orange-200/80 bg-gradient-to-b from-orange-300/45 to-orange-800/55 text-orange-50"} text-2xl`,
                  )}
                  {control(
                    "B",
                    0,
                    "h-full w-full border-sky-200/65 bg-gradient-to-b from-sky-300/40 to-sky-800/55 text-2xl text-sky-50",
                  )}
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                </div>
              </div>
            </div>
            <p className="remote-controller-footer">
              {castMode
                ? "Mantenha esta tela aberta. Os comandos chegam ao jogo que está correndo na TV."
                : "Mantenha esta tela aberta. Os comandos chegam ao PC pela mesma rede Wi-Fi ou pela internet."}
            </p>
          </section>
        </div>
      )}
      {installInfoOpen && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#050a12]/90 p-4 backdrop-blur-md">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="remote-install-title"
            className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-cyan-300/35 bg-[#0b141c] p-5 text-slate-100 shadow-[0_0_55px_rgba(34,211,238,.18)] sm:p-7"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-violet-400 to-orange-300" />
            {!installationRequired && (
              <button
                type="button"
                onClick={() => setInstallInfoOpen(false)}
                className="absolute right-4 top-4 rounded-full border border-white/15 px-3 py-1 text-lg text-slate-300 hover:bg-white/10"
                aria-label="Fechar instalação"
              >
                ×
              </button>
            )}
            <div className="flex items-center gap-4 pr-10">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-cyan-300/35 bg-cyan-300/10 p-2 shadow-[0_0_24px_rgba(34,211,238,.15)]">
                <img src="/kali-dragon.png" alt="" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="font-mono text-[10px] font-bold tracking-[.22em] text-cyan-200">
                  APLICATIVO DO CONTROLE
                </p>
                <h2 id="remote-install-title" className="mt-1 text-2xl font-black text-white">
                  MGA Controle
                </h2>
              </div>
            </div>
            <img
              src="/assets/remote-controller-fight.jpg"
              alt="Controle remoto de arcade no celular"
              className="mt-5 h-36 w-full rounded-2xl border border-white/10 object-cover object-center"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-xs">
              <strong className={player === 1 ? "text-cyan-200" : "text-orange-200"}>
                JOGADOR {player}
              </strong>
              <span className="text-slate-400">SALA {room}</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Este atalho instala o <b className="text-white">controle remoto</b>, não a biblioteca
              de jogos. O ícone será <b className="text-cyan-100">MGA Controle</b> e abrirá esta
              sala como Jogador {player}.
            </p>
            {installPrompt ? (
              <button
                type="button"
                onClick={() => void installRemoteApp()}
                className="mt-5 w-full rounded-2xl border border-cyan-200/80 bg-gradient-to-b from-cyan-300/30 to-cyan-700/20 px-5 py-4 font-mono text-sm font-black tracking-wide text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,.16)] transition hover:brightness-110"
              >
                ⬇ INSTALAR APP DO CONTROLE
              </button>
            ) : installed && installationRequired ? (
              <div className="mt-5 rounded-2xl border border-emerald-200/25 bg-emerald-200/5 p-4 text-sm leading-relaxed text-emerald-100">
                <p className="font-bold">App instalado com sucesso.</p>
                <p className="mt-2 text-emerald-100/80">
                  Feche esta página e toque no ícone <b>MGA Controle</b> para abrir somente o
                  controle.
                </p>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-amber-200/25 bg-amber-200/5 p-4 text-sm leading-relaxed text-slate-200">
                <p className="font-bold text-amber-100">Use o menu do navegador para instalar:</p>
                <p className="mt-2">
                  <b>Android / Chrome:</b> menu ⋮ → “Instalar app” ou “Adicionar à tela inicial”.
                </p>
                <p className="mt-2">
                  <b>iPhone / Safari:</b> Compartilhar → “Adicionar à Tela de Início”.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (installationRequired) continueAfterManualInstall();
                else setInstallInfoOpen(false);
              }}
              className="mt-3 w-full rounded-xl border border-white/15 px-4 py-3 font-mono text-xs font-bold text-slate-300 transition hover:bg-white/5"
            >
              {installationRequired ? "JÁ INSTALEI — ABRIR PELO ÍCONE" : "VOLTAR AO CONTROLE"}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
