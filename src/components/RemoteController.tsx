import { useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

const buttonClass = [
  "relative isolate inline-flex items-center justify-center overflow-hidden select-none touch-none rounded-full border-2 font-mono font-black tracking-wide transition-[transform,filter,box-shadow] duration-100 backdrop-blur-sm backdrop-saturate-150",
  "shadow-[inset_0_2px_2px_rgba(255,255,255,.58),inset_0_-8px_10px_rgba(0,0,0,.4),0_2px_0_rgba(255,255,255,.12),0_8px_14px_rgba(0,0,0,.52)] active:translate-y-1 active:shadow-[inset_0_3px_7px_rgba(0,0,0,.42),0_2px_0_rgba(15,23,42,.85)] active:brightness-125",
  "before:pointer-events-none before:absolute before:inset-[3px] before:z-0 before:rounded-[inherit] before:border before:border-white/35 before:bg-[linear-gradient(145deg,rgba(255,255,255,.38)_0%,rgba(255,255,255,.12)_28%,transparent_54%,rgba(0,0,0,.26)_100%)] before:content-['']",
  "after:pointer-events-none after:absolute after:left-[17%] after:right-[17%] after:top-[7%] after:z-0 after:h-[24%] after:rounded-full after:bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,.7),transparent_75%)] after:blur-[2px] after:content-['']",
].join(" ");

const circuitBoardPattern = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 700" fill="none">
    <defs>
      <pattern id="microgrid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" stroke="#67e8f9" stroke-opacity=".075" stroke-width="1" />
      </pattern>
      <filter id="traceGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <linearGradient id="cyanTrace" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#a5f3fc" /><stop offset=".5" stop-color="#22d3ee" />
        <stop offset="1" stop-color="#0891b2" />
      </linearGradient>
    </defs>
    <rect width="1600" height="700" fill="url(#microgrid)" />
    <g stroke="url(#cyanTrace)" stroke-opacity=".58" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#traceGlow)">
      <path d="M-20 92H112V148H210V202H312V242H438" />
      <path d="M-20 270H74V226H162V188H254V152H360" />
      <path d="M-20 472H124V430H222V386H318V344H432" />
      <path d="M-20 622H150V576H256V530H344V486H470" />
      <path d="M1620 104H1482V154H1380V202H1282V248H1164" />
      <path d="M1620 286H1516V248H1428V210H1330V174H1222" />
      <path d="M1620 470H1484V428H1380V388H1284V344H1168" />
      <path d="M1620 624H1458V576H1352V534H1264V490H1140" />
    </g>
    <g stroke="#c4b5fd" stroke-opacity=".48" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M42 344H164V374H270V408H360" />
      <path d="M1558 356H1438V326H1330V294H1240" />
      <path d="M510 18V72H574V112H646V156H720" />
      <path d="M1090 682V626H1028V588H954V548H884" />
      <path d="M620 690V642H682V604H750V568H820" />
      <path d="M980 12V58H920V96H858V132H796" />
    </g>
    <g stroke="#fbbf75" stroke-opacity=".5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M202 54H278V82H352V112H412" />
      <path d="M1398 648H1326V618H1254V590H1194" />
      <path d="M18 546H70V520H122V494H176" />
      <path d="M1582 182H1530V208H1478V234H1424" />
    </g>
    <g fill="#071923" stroke="#67e8f9" stroke-opacity=".7" stroke-width="2">
      <circle cx="112" cy="148" r="7" /><circle cx="210" cy="202" r="7" />
      <circle cx="162" cy="188" r="7" /><circle cx="222" cy="386" r="7" />
      <circle cx="256" cy="530" r="7" /><circle cx="1482" cy="154" r="7" />
      <circle cx="1428" cy="210" r="7" /><circle cx="1380" cy="388" r="7" />
      <circle cx="1352" cy="534" r="7" /><circle cx="682" cy="604" r="6" />
      <circle cx="920" cy="96" r="6" />
    </g>
    <g fill="#67e8f9" fill-opacity=".88">
      <circle cx="112" cy="148" r="2.5" /><circle cx="210" cy="202" r="2.5" />
      <circle cx="162" cy="188" r="2.5" /><circle cx="222" cy="386" r="2.5" />
      <circle cx="256" cy="530" r="2.5" /><circle cx="1482" cy="154" r="2.5" />
      <circle cx="1428" cy="210" r="2.5" /><circle cx="1380" cy="388" r="2.5" />
      <circle cx="1352" cy="534" r="2.5" />
    </g>
    <g stroke="#94a3b8" stroke-opacity=".38" stroke-width="2" fill="#0b2029">
      <rect x="82" y="300" width="116" height="70" rx="9" />
      <rect x="1402" y="302" width="116" height="70" rx="9" />
      <rect x="474" y="506" width="84" height="54" rx="7" />
      <rect x="1042" y="140" width="84" height="54" rx="7" />
      <path d="M98 292V278M118 292V278M138 292V278M158 292V278M178 292V278M98 378V392M118 378V392M138 378V392M158 378V392M178 378V392" />
      <path d="M1418 294V280M1438 294V280M1458 294V280M1478 294V280M1498 294V280M1418 380V394M1438 380V394M1458 380V394M1478 380V394M1498 380V394" />
    </g>
    <g fill="#c4b5fd" fill-opacity=".82">
      <circle cx="164" cy="374" r="3" /><circle cx="1438" cy="326" r="3" />
      <circle cx="574" cy="112" r="3" /><circle cx="1028" cy="588" r="3" />
      <circle cx="352" cy="112" r="3" /><circle cx="1254" cy="590" r="3" />
      <circle cx="70" cy="520" r="3" /><circle cx="1530" cy="208" r="3" />
    </g>
  </svg>`,
);

const panelScrewPositions = [
  "left-3 top-3",
  "right-3 top-3",
  "bottom-3 left-3",
  "bottom-3 right-3",
] as const;

const PanelFasteners = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
    {panelScrewPositions.map((position) => (
      <span
        key={position}
        className={`absolute ${position} grid size-2.5 place-items-center rounded-full border border-white/60 bg-[radial-gradient(circle_at_30%_25%,#f8fafc,#94a3b8_38%,#1e293b_78%)] shadow-[inset_0_1px_1px_rgba(255,255,255,.85),0_1px_2px_rgba(0,0,0,.7)]`}
      >
        <span className="h-px w-1.5 rotate-45 bg-slate-950/75" />
      </span>
    ))}
  </div>
);

type RemotePayload = { room: string; player: number; input: number; pressed: boolean };
type RemoteCommand = "toggle-pause" | "save-and-exit" | "toggle-game-fullscreen" | "launch-game";

type RemoteSession = { room: string; player: 1 | 2 };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const REMOTE_SESSION_KEY = "mga-remote-session-v1";
const REMOTE_INSTALLED_KEY = "mga-remote-app-installed-v1";
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

export function RemoteController() {
  const [{ room, player }] = useState(readRemoteSession);
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
      <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">{label}</span>
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
      className="mga-reference-controller notranslate relative flex h-[100dvh] min-h-0 flex-col select-none overflow-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(113,140,153,.32),transparent_26%),radial-gradient(circle_at_90%_90%,rgba(194,113,58,.14),transparent_28%),linear-gradient(135deg,#1c2930,#0e151b_55%,#111b21)] p-2 text-slate-100 [@media(max-height:500px)]:p-1"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={() => {
        void requestLandscape();
        void requestWakeLock();
      }}
    >
      <div className="pointer-events-none absolute inset-2 rounded-[2rem] border border-white/10 shadow-[inset_0_0_50px_rgba(255,255,255,.035)]" />
      <header className="relative mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-3 rounded-2xl border border-slate-300/20 bg-slate-200/[.07] px-4 py-3 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_10px_25px_rgba(2,6,23,.22)] backdrop-blur-sm [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:px-2 [@media(max-height:500px)]:py-1">
        <div>
          <div className="flex items-center gap-2 text-xs tracking-[.18em] text-slate-100">
            <img
              src="/kali-dragon.png"
              alt=""
              aria-hidden="true"
              className="h-12 w-12 object-contain brightness-0 invert opacity-80 drop-shadow-[0_0_9px_rgba(251,146,60,.6)] [@media(max-height:500px)]:h-5 [@media(max-height:500px)]:w-5"
            />
            MASTER GAMES
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400 [@media(max-height:500px)]:hidden">
            Painel remoto ·{" "}
            {connected ? `conectado${latency === null ? "" : ` · ${latency} ms`}` : "conectando…"}
          </div>
          <div className="mt-1 text-[9px] font-bold tracking-[.16em] text-orange-200/80 [@media(max-height:500px)]:hidden">
            DEV EMERSON 2026
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!installed && (
            <button
              type="button"
              onClick={() => setInstallInfoOpen(true)}
              className="rounded-xl border border-cyan-300/50 bg-cyan-300/10 px-3 py-2 text-[10px] font-bold text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_3px_8px_rgba(2,6,23,.3)]"
              aria-label="Instalar o controle remoto como aplicativo"
            >
              ⬇ INSTALAR
            </button>
          )}
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
      <section
        className="relative mx-auto flex min-h-0 flex-1 flex-col justify-between gap-2 overflow-hidden rounded-[2rem] border border-white/25 bg-[#06131c]/25 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.2),inset_0_0_55px_rgba(34,211,238,.08),0_18px_40px_rgba(0,0,0,.38)] backdrop-blur-[2px] [@media(max-height:500px)]:gap-0 [@media(max-height:500px)]:py-0"
        style={{
          backgroundImage: `linear-gradient(145deg, rgba(255,255,255,.11), transparent 24%, transparent 76%, rgba(255,255,255,.035)), radial-gradient(ellipse at 50% 52%, rgba(34,211,238,.15), transparent 62%), url("data:image/svg+xml,${circuitBoardPattern}")`,
          backgroundSize: "100% 100%, cover, 100% 100%",
        }}
      >
        <div className="grid grid-cols-2 gap-2 px-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => sendCommand("toggle-pause")}
            className="relative isolate h-7 overflow-hidden rounded-xl border-2 border-amber-200/70 bg-gradient-to-b from-amber-300/25 to-amber-700/20 px-1 font-mono text-[10px] font-black leading-none text-amber-100 shadow-[inset_0_2px_2px_rgba(255,255,255,.46),inset_0_-5px_7px_rgba(0,0,0,.34),0_3px_0_rgba(0,0,0,.55),0_7px_9px_rgba(0,0,0,.36)] backdrop-blur-sm active:translate-y-1 active:shadow-[inset_0_2px_5px_rgba(0,0,0,.3),0_2px_0_rgba(51,35,15,.8)] before:pointer-events-none before:absolute before:inset-[2px] before:rounded-[inherit] before:border before:border-white/35 before:bg-[linear-gradient(145deg,rgba(255,255,255,.36)_0%,transparent_48%,rgba(0,0,0,.25)_100%)] before:content-[''] after:pointer-events-none after:absolute after:left-[18%] after:right-[18%] after:top-[7%] after:h-[22%] after:rounded-full after:bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,.68),transparent_75%)] after:blur-[2px] after:content-[''] [@media(max-height:500px)]:h-6 [@media(max-height:500px)]:text-[9px]"
          >
            <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">
              PAUSAR / RETOMAR
            </span>
          </button>
          <button
            type="button"
            onClick={() => sendCommand("save-and-exit")}
            className="relative isolate h-7 overflow-hidden rounded-xl border-2 border-emerald-200/70 bg-gradient-to-b from-emerald-300/25 to-emerald-700/20 px-1 font-mono text-[10px] font-black leading-none text-emerald-100 shadow-[inset_0_2px_2px_rgba(255,255,255,.46),inset_0_-5px_7px_rgba(0,0,0,.34),0_3px_0_rgba(0,0,0,.55),0_7px_9px_rgba(0,0,0,.36)] backdrop-blur-sm active:translate-y-1 active:shadow-[inset_0_2px_5px_rgba(0,0,0,.3),0_2px_0_rgba(10,45,35,.8)] before:pointer-events-none before:absolute before:inset-[2px] before:rounded-[inherit] before:border before:border-white/35 before:bg-[linear-gradient(145deg,rgba(255,255,255,.36)_0%,transparent_48%,rgba(0,0,0,.25)_100%)] before:content-[''] after:pointer-events-none after:absolute after:left-[18%] after:right-[18%] after:top-[7%] after:h-[22%] after:rounded-full after:bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,.68),transparent_75%)] after:blur-[2px] after:content-[''] [@media(max-height:500px)]:h-6 [@media(max-height:500px)]:text-[9px]"
          >
            <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">
              SALVAR E BIBLIOTECA
            </span>
          </button>
          {control(
            "CRÉDITO",
            REMOTE_INPUT.CREDIT,
            "h-7 border-amber-300/80 bg-amber-400/20 text-xs text-amber-100 [@media(max-height:500px)]:h-6 [@media(max-height:500px)]:text-[10px]",
          )}
          {control(
            "START",
            REMOTE_INPUT.START,
            "h-7 border-green-300/80 bg-green-400/20 text-xs text-green-100 [@media(max-height:500px)]:h-6 [@media(max-height:500px)]:text-[10px]",
          )}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-between gap-2 px-1 sm:px-8">
          <div className="relative grid h-56 w-56 grid-cols-3 grid-rows-3 gap-2 rounded-[1.8rem] border border-white/40 bg-[linear-gradient(145deg,rgba(255,255,255,.3),rgba(148,163,184,.14)_18%,rgba(15,23,42,.62)_68%,rgba(255,255,255,.16))] p-3 shadow-[inset_0_2px_0_rgba(255,255,255,.3),inset_0_-12px_20px_rgba(0,0,0,.34),0_3px_0_rgba(0,0,0,.5),0_14px_28px_rgba(2,6,23,.4)] backdrop-blur-md before:pointer-events-none before:absolute before:inset-1 before:rounded-[1.4rem] before:border before:border-white/25 before:bg-[linear-gradient(140deg,rgba(255,255,255,.18),transparent_36%,rgba(0,0,0,.2))] before:content-[''] sm:h-72 sm:w-72">
            <PanelFasteners />
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
            <span className="grid place-items-center rounded-full border border-cyan-100/45 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,.28),rgba(12,32,44,.94)_72%)] text-cyan-100/80 shadow-[inset_0_2px_3px_rgba(255,255,255,.34),inset_0_-4px_6px_rgba(0,0,0,.68),0_3px_4px_rgba(0,0,0,.5)]">
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
          <div className="relative grid h-56 w-56 grid-cols-3 grid-rows-3 gap-3 rounded-[1.8rem] border border-white/40 bg-[linear-gradient(145deg,rgba(255,255,255,.3),rgba(148,163,184,.14)_18%,rgba(15,23,42,.62)_68%,rgba(255,255,255,.16))] p-3 shadow-[inset_0_2px_0_rgba(255,255,255,.3),inset_0_-12px_20px_rgba(0,0,0,.34),0_3px_0_rgba(0,0,0,.5),0_14px_28px_rgba(2,6,23,.4)] backdrop-blur-md before:pointer-events-none before:absolute before:inset-1 before:rounded-[1.4rem] before:border before:border-white/25 before:bg-[linear-gradient(140deg,rgba(255,255,255,.18),transparent_36%,rgba(0,0,0,.2))] before:content-[''] sm:h-72 sm:w-72">
            <PanelFasteners />
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
      {installInfoOpen && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#050a12]/90 p-4 backdrop-blur-md">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="remote-install-title"
            className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-cyan-300/35 bg-[#0b141c] p-5 text-slate-100 shadow-[0_0_55px_rgba(34,211,238,.18)] sm:p-7"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-violet-400 to-orange-300" />
            <button
              type="button"
              onClick={() => setInstallInfoOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-white/15 px-3 py-1 text-lg text-slate-300 hover:bg-white/10"
              aria-label="Fechar instalação"
            >
              ×
            </button>
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
              O controle funciona nesta página do navegador. Se quiser, você também pode instalar o
              atalho <b className="text-cyan-100">MGA Controle</b> para abrir esta sala como Jogador{" "}
              {player}.
            </p>
            {installPrompt ? (
              <button
                type="button"
                onClick={() => void installRemoteApp()}
                className="mt-5 w-full rounded-2xl border border-cyan-200/80 bg-gradient-to-b from-cyan-300/30 to-cyan-700/20 px-5 py-4 font-mono text-sm font-black tracking-wide text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,.16)] transition hover:brightness-110"
              >
                ⬇ INSTALAR APP DO CONTROLE
              </button>
            ) : installed ? (
              <div className="mt-5 rounded-2xl border border-emerald-200/25 bg-emerald-200/5 p-4 text-sm leading-relaxed text-emerald-100">
                <p className="font-bold">MGA Controle está instalado neste aparelho.</p>
                <p className="mt-2 text-emerald-100/80">A instalação é opcional para jogar.</p>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-amber-200/25 bg-amber-200/5 p-4 text-sm leading-relaxed text-slate-200">
                <p className="font-bold text-amber-100">Instalação opcional</p>
                <p className="mt-2">Você já pode usar os controles nesta página.</p>
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
              onClick={() => setInstallInfoOpen(false)}
              className="mt-3 w-full rounded-xl border border-white/15 px-4 py-3 font-mono text-xs font-bold text-slate-300 transition hover:bg-white/5"
            >
              CONTINUAR NO NAVEGADOR
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
