import { useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

const buttonClass =
  "select-none touch-none rounded-2xl border-2 font-mono font-black tracking-wide transition-[transform,filter,box-shadow] duration-100 shadow-[inset_0_1px_0_rgba(255,255,255,.28),inset_0_-7px_0_rgba(0,0,0,.22),0_7px_0_rgba(15,23,42,.8),0_12px_24px_rgba(2,6,23,.28)] active:translate-y-1 active:shadow-[inset_0_2px_5px_rgba(0,0,0,.3),0_2px_0_rgba(15,23,42,.8)] active:brightness-125";

type RemotePayload = { room: string; player: number; input: number; pressed: boolean };
type RemoteCommand = "toggle-pause" | "save-and-exit" | "toggle-game-fullscreen" | "launch-game";

type RemoteSession = { room: string; player: 1 | 2 };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const REMOTE_SESSION_KEY = "mga-remote-session-v1";

const readRemoteSession = (): RemoteSession => {
  // Durante o SSR não existe window/sessionStorage: devolve a sessão vazia.
  if (typeof window === "undefined") return { room: "", player: 1 };
  const params = new URLSearchParams(window.location.search);
  const fromUrl = {
    room: (params.get("room") || "").toUpperCase(),
    player: params.get("player") === "2" ? 2 : 1,
  } as RemoteSession;
  if (fromUrl.room) {
    try {
      sessionStorage.setItem(REMOTE_SESSION_KEY, JSON.stringify(fromUrl));
    } catch {
      // O armazenamento pode estar bloqueado no modo privado.
    }
    return fromUrl;
  }
  try {
    const stored = JSON.parse(
      sessionStorage.getItem(REMOTE_SESSION_KEY) || "null",
    ) as Partial<RemoteSession>;
    if (typeof stored.room === "string" && stored.room) {
      return { room: stored.room.toUpperCase(), player: stored.player === 2 ? 2 : 1 };
    }
  } catch {
    // O armazenamento pode estar indisponível ou conter uma sessão inválida.
  }
  return fromUrl;
};

export function RemoteController() {
  const [{ room, player }] = useState(readRemoteSession);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeInputs = useRef(new Set<number>());
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

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
    setInstalled(standalone);

    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/remote-manifest.webmanifest";
    manifest.dataset["mgaRemote"] = "true";
    document.head.appendChild(manifest);

    const onInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled, { once: true });
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
      manifest.remove();
    };
  }, []);

  const installRemoteApp = async () => {
    if (!installPrompt) {
      window.alert(
        "Abra o menu do navegador e escolha “Adicionar à tela inicial” ou “Instalar aplicativo” para baixar o controle.",
      );
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
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

  const control = (label: string, input: number, className: string) => (
    <button
      type="button"
      className={`${buttonClass} ${className}`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        send(input, true);
      }}
      onPointerUp={() => send(input, false)}
      onPointerCancel={() => send(input, false)}
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

  if (!installed) {
    return (
      <main
        translate="no"
        className="notranslate flex min-h-screen items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_15%_10%,rgba(113,140,153,.32),transparent_26%),radial-gradient(circle_at_90%_90%,rgba(194,113,58,.14),transparent_28%),linear-gradient(135deg,#1c2930,#0e151b_55%,#111b21)] p-4 text-slate-100"
      >
        <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-cyan-300/40 bg-slate-950/85 shadow-[0_0_45px_rgba(34,211,238,.18)]">
          <img
            src="/assets/remote-controller-fight.jpg"
            alt="Lutadores em uma batalha de arcade"
            className="h-56 w-full object-cover object-center sm:h-72"
          />
          <div className="p-6 text-center font-mono sm:p-8">
            <div className="text-[10px] font-bold tracking-[.24em] text-cyan-300">
              MASTER GAMES ARCADE
            </div>
            <h1 className="mt-3 text-2xl font-black text-white">CONTROLE DO JOGADOR {player}</h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Este celular será o controle do jogador {player}. Instale o aplicativo para jogar com
              os botões na tela e abrir o controle pela tela inicial, sem a barra de endereço do
              navegador.
            </p>
            <button
              type="button"
              onClick={() => void installRemoteApp()}
              className="mt-6 w-full rounded-2xl border-2 border-cyan-200/80 bg-cyan-400/20 px-5 py-4 text-sm font-black tracking-wider text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,.2)] transition hover:bg-cyan-300/30"
            >
              BAIXAR APLICATIVO DO CONTROLE
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      translate="no"
      className="notranslate relative min-h-screen select-none overflow-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(113,140,153,.32),transparent_26%),radial-gradient(circle_at_90%_90%,rgba(194,113,58,.14),transparent_28%),linear-gradient(135deg,#1c2930,#0e151b_55%,#111b21)] p-3 text-slate-100"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={() => {
        void requestLandscape();
        void requestWakeLock();
      }}
    >
      <div className="pointer-events-none absolute inset-2 rounded-[2rem] border border-white/10 shadow-[inset_0_0_50px_rgba(255,255,255,.035)]" />
      <header className="relative mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-slate-300/20 bg-slate-200/[.07] px-4 py-3 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_10px_25px_rgba(2,6,23,.22)] backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2 text-xs tracking-[.18em] text-slate-100">
            <img
              src="/kali-dragon.png"
              alt=""
              aria-hidden="true"
              className="h-12 w-12 object-contain brightness-0 invert opacity-80 drop-shadow-[0_0_9px_rgba(251,146,60,.6)]"
            />
            MASTER GAMES
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">
            Painel remoto ·{" "}
            {connected ? `conectado${latency === null ? "" : ` · ${latency} ms`}` : "conectando…"}
          </div>
          <div className="mt-1 text-[9px] font-bold tracking-[.16em] text-orange-200/80">
            DEV EMERSON 2026
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => sendCommand("toggle-game-fullscreen")}
            className="rounded-xl border border-slate-300/50 bg-slate-300/10 px-3 py-2 text-[10px] font-bold text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_3px_8px_rgba(2,6,23,.3)]"
            aria-label="Alternar tela cheia do jogo no computador"
          >
            ⛶ JOGO
          </button>
          <strong
            className={`rounded-xl border px-4 py-2 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_3px_8px_rgba(2,6,23,.3)] ${player === 1 ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100" : "border-orange-300/70 bg-orange-300/10 text-orange-100"}`}
          >
            JOGADOR {player}
          </strong>
        </div>
      </header>
      <section className="relative mx-auto flex min-h-[calc(100dvh-74px)] max-w-3xl flex-col justify-between gap-5 py-4">
        <div className="grid grid-cols-2 gap-3 px-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => sendCommand("toggle-pause")}
            className="h-12 rounded-xl border-2 border-amber-200/70 bg-gradient-to-b from-amber-300/25 to-amber-700/20 font-mono text-xs font-black text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_5px_0_rgba(51,35,15,.8),0_10px_20px_rgba(2,6,23,.2)] active:translate-y-1 active:shadow-[inset_0_2px_5px_rgba(0,0,0,.3),0_2px_0_rgba(51,35,15,.8)]"
          >
            PAUSAR / RETOMAR
          </button>
          <button
            type="button"
            onClick={() => sendCommand("save-and-exit")}
            className="h-12 rounded-xl border-2 border-emerald-200/70 bg-gradient-to-b from-emerald-300/25 to-emerald-700/20 font-mono text-xs font-black text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_5px_0_rgba(10,45,35,.8),0_10px_20px_rgba(2,6,23,.2)] active:translate-y-1 active:shadow-[inset_0_2px_5px_rgba(0,0,0,.3),0_2px_0_rgba(10,45,35,.8)]"
          >
            SALVAR E BIBLIOTECA
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 px-3 sm:grid-cols-4">
          {control("CRÉDITO", 2, "h-14 border-amber-300/80 bg-amber-400/20 text-sm text-amber-100")}
          {control("START", 3, "h-14 border-green-300/80 bg-green-400/20 text-sm text-green-100")}
        </div>
        <div className="flex flex-1 items-end justify-between gap-4 px-1 pb-4 sm:items-center sm:px-8">
          <div className="relative grid h-56 w-56 grid-cols-3 grid-rows-3 gap-2 rounded-[1.8rem] border border-slate-200/30 bg-[linear-gradient(135deg,rgba(226,232,240,.22),rgba(71,85,105,.18)_42%,rgba(15,23,42,.45))] p-3 shadow-[inset_0_2px_0_rgba(255,255,255,.18),inset_0_-12px_20px_rgba(0,0,0,.22),0_14px_28px_rgba(2,6,23,.3)] before:pointer-events-none before:absolute before:inset-1 before:rounded-[1.4rem] before:border before:border-white/10 sm:h-72 sm:w-72">
            <span />
            <span>
              {control(
                "▲",
                4,
                "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-400/35 to-slate-700/35 text-3xl text-slate-100",
              )}
            </span>
            <span />
            <span>
              {control(
                "◀",
                6,
                "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-400/35 to-slate-700/35 text-3xl text-slate-100",
              )}
            </span>
            <span className="grid place-items-center rounded-2xl border border-cyan-300/30 bg-black/30 text-cyan-200/60">
              ✦
            </span>
            <span>
              {control(
                "▶",
                7,
                "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-400/35 to-slate-700/35 text-3xl text-slate-100",
              )}
            </span>
            <span />
            <span>
              {control(
                "▼",
                5,
                "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-400/35 to-slate-700/35 text-3xl text-slate-100",
              )}
            </span>
            <span />
          </div>
          <div className="relative grid h-56 w-56 grid-cols-3 grid-rows-3 gap-3 rounded-[1.8rem] border border-slate-200/30 bg-[linear-gradient(135deg,rgba(226,232,240,.22),rgba(71,85,105,.18)_42%,rgba(15,23,42,.45))] p-3 shadow-[inset_0_2px_0_rgba(255,255,255,.18),inset_0_-12px_20px_rgba(0,0,0,.22),0_14px_28px_rgba(2,6,23,.3)] before:pointer-events-none before:absolute before:inset-1 before:rounded-[1.4rem] before:border before:border-white/10 sm:h-72 sm:w-72">
            <span />
            {control(
              "Y",
              1,
              "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-400/35 to-slate-700/35 text-2xl text-slate-100",
            )}
            <span />
            {control(
              "X",
              9,
              "h-full w-full border-amber-200/70 bg-gradient-to-b from-amber-300/35 to-amber-700/25 text-2xl text-amber-50",
            )}
            {control(
              "A",
              8,
              `h-full w-full ${player === 1 ? "border-cyan-200/80 bg-gradient-to-b from-cyan-300/35 to-cyan-700/25 text-cyan-50" : "border-orange-200/80 bg-gradient-to-b from-orange-300/35 to-orange-700/25 text-orange-50"} text-2xl`,
            )}
            {control(
              "B",
              0,
              "h-full w-full border-sky-200/65 bg-gradient-to-b from-sky-300/30 to-sky-700/25 text-2xl text-sky-50",
            )}
            <span />
            <span />
            <span />
          </div>
        </div>
        <p className="text-center font-mono text-[10px] uppercase tracking-wider text-slate-400">
          Mantenha esta tela aberta. Os comandos chegam ao PC pela mesma rede Wi-Fi ou pela
          internet.
        </p>
      </section>
    </main>
  );
}
