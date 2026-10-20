import { useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import "./RemoteController.css";

const buttonClass = [
  "relative isolate inline-flex items-center justify-center overflow-hidden select-none touch-none rounded-full border-2 font-mono font-black tracking-wide transition-[transform,filter,box-shadow] duration-100",
  "shadow-[inset_0_2px_2px_rgba(255,255,255,.58),inset_0_-8px_10px_rgba(0,0,0,.4),0_2px_0_rgba(255,255,255,.12),0_8px_14px_rgba(0,0,0,.52)] active:translate-y-1 active:shadow-[inset_0_3px_7px_rgba(0,0,0,.42),0_2px_0_rgba(15,23,42,.85)] active:brightness-125",
  "before:pointer-events-none before:absolute before:inset-[3px] before:z-0 before:rounded-[inherit] before:border before:border-white/35 before:bg-[linear-gradient(145deg,rgba(255,255,255,.38)_0%,rgba(255,255,255,.12)_28%,transparent_54%,rgba(0,0,0,.26)_100%)] before:content-['']",
  "after:pointer-events-none after:absolute after:left-[17%] after:right-[17%] after:top-[7%] after:z-0 after:h-[24%] after:rounded-full after:bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,.7),transparent_75%)] after:blur-[2px] after:content-['']",
].join(" ");

type RemotePayload = { room: string; player: number; input: number; pressed: boolean };
type RemoteCommand =
  | "toggle-pause"
  | "save-and-exit"
  | "toggle-game-fullscreen"
  | "launch-game"
  | "return-home"
  | "library-up"
  | "library-down"
  | "library-left"
  | "library-right"
  | "library-enter"
  | "library-toggle"
  | "library-launch-result"
  | "library-tab-next"
  | "library-tab-prev";
type RemoteCommandPayload = { room: string; command: RemoteCommand; ok?: boolean };

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

const CIRCUIT_PAD_BY_INPUT: Record<number, { id: string; side: "left" | "right" }> = {
  4: { id: "up", side: "left" },
  6: { id: "left", side: "left" },
  7: { id: "right", side: "left" },
  5: { id: "down", side: "left" },
  1: { id: "y", side: "right" },
  9: { id: "x", side: "right" },
  8: { id: "a", side: "right" },
  0: { id: "b", side: "right" },
};

type CircuitPad = { id: string; side: "left" | "right"; x: number; y: number; radius: number };
type CircuitLayout = { width: number; height: number; pads: CircuitPad[] };

const createCircuitPath = (pad: CircuitPad, width: number, height: number) => {
  const { id, x, y, radius } = pad;
  const reach = radius + 5;
  const routes: Record<string, [number, number][]> = {
    up: [
      [x, y - reach],
      [x, y - reach - 12],
      [x + 14, y - reach - 26],
      [x + 14, 14],
      [width * 0.38, 14],
    ],
    left: [
      [x - reach, y],
      [x - reach - 12, y],
      [x - reach - 26, y + 14],
      [14, y + 14],
    ],
    right: [
      [x + reach, y],
      [x + reach + 12, y],
      [x + reach + 26, y - 14],
      [width * 0.45, y - 14],
    ],
    down: [
      [x, y + reach],
      [x, y + reach + 12],
      [x + 14, y + reach + 26],
      [x + 14, height - 14],
    ],
    center: [
      [x, y + reach],
      [x, y + reach + 12],
      [x + 14, y + reach + 26],
      [width * 0.44, y + reach + 26],
    ],
    y: [
      [x, y - reach],
      [x, y - reach - 12],
      [x - 14, y - reach - 26],
      [x - 14, 14],
      [width * 0.64, 14],
    ],
    x: [
      [x - reach, y],
      [x - reach - 12, y],
      [x - reach - 26, y + 14],
      [width * 0.52, y + 14],
    ],
    a: [
      [x, y + reach],
      [x, y + reach + 12],
      [x + 14, y + reach + 26],
      [x + 14, height - 14],
    ],
    b: [
      [x + reach, y],
      [x + reach + 12, y],
      [x + reach + 26, y - 14],
      [width - 14, y - 14],
    ],
  };
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 8), max - 8);
  return (routes[id] || [])
    .map(
      ([pointX, pointY], index) =>
        `${index === 0 ? "M" : "L"} ${clamp(pointX, width)} ${clamp(pointY, height)}`,
    )
    .join(" ");
};

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
  const [connectionError, setConnectionError] = useState(false);
  const [error, setError] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installInfoOpen, setInstallInfoOpen] = useState(false);
  const [libraryMode, setLibraryMode] = useState(true);
  const [tvMode, setTvMode] = useState(false);
  const frameRef = useRef<HTMLElement | null>(null);
  const [circuitLayout, setCircuitLayout] = useState<CircuitLayout>({
    width: 0,
    height: 0,
    pads: [],
  });

  useEffect(() => {
    setTvMode(new URLSearchParams(window.location.search).get("tv") === "1");
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

  useEffect(() => {
    if (error) return;
    const frame = frameRef.current;
    if (!frame) return;
    let animationFrame = 0;
    const measure = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const frameRect = frame.getBoundingClientRect();
        const pads = Array.from(frame.querySelectorAll<HTMLElement>("[data-circuit-pad]")).map(
          (element): CircuitPad => {
            const rect = element.getBoundingClientRect();
            return {
              id: element.dataset["circuitPad"] || "",
              side: element.dataset["circuitSide"] === "right" ? "right" : "left",
              x: rect.left - frameRect.left + rect.width / 2,
              y: rect.top - frameRect.top + rect.height / 2,
              radius: Math.min(rect.width, rect.height) / 2,
            };
          },
        );
        setCircuitLayout({ width: frameRect.width, height: frameRect.height, pads });
      });
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(frame);
    frame
      .querySelectorAll<HTMLElement>("[data-circuit-pad]")
      .forEach((element) => observer?.observe(element));
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [error]);

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
    const announceWhenVisible = () => {
      if (document.visibilityState === "visible") announceReady();
    };
    document.addEventListener("visibilitychange", announceWhenVisible);
    channel
      .on("broadcast", { event: "room-ping" }, ({ payload }) => {
        if (payload?.room === room) {
          setConnected(true);
          const sentAt = Number(payload?.sentAt);
          if (sentAt > 0) setLatency(Math.max(0, Date.now() - sentAt));
        }
      })
      .on("broadcast", { event: "command" }, ({ payload }) => {
        const command = payload as Partial<RemoteCommandPayload>;
        if (command.room !== room || command.command !== "library-launch-result") return;
        setLibraryMode(!command.ok);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setError("");
          setConnectionError(false);
          announceReady();
          // O computador pode abrir o jogo depois de o QR Code ser lido.
          // Repetir o handshake evita perder o primeiro anúncio nesse caso.
          readyTimer = window.setInterval(announceReady, 2500);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnected(false);
          setLatency(null);
          setConnectionError(true);
        }
      });
    return () => {
      if (readyTimer) window.clearInterval(readyTimer);
      document.removeEventListener("visibilitychange", announceWhenVisible);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [room, player]);

  useEffect(() => {
    const onGameLaunchResult = (event: Event) => {
      const ok = Boolean((event as CustomEvent<{ ok?: unknown }>).detail?.ok);
      setLibraryMode(!ok);
    };
    window.addEventListener("mga-remote-game-launch-result", onGameLaunchResult);
    return () => window.removeEventListener("mga-remote-game-launch-result", onGameLaunchResult);
  }, []);

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
  }, [room, player, libraryMode]);

  const send = (input: number, pressed: boolean) => {
    if (!room || !channelRef.current || !connected) return;
    if (pressed) navigator.vibrate?.(8);
    if (pressed) activeInputs.current.add(input);
    else activeInputs.current.delete(input);
    const payload: RemotePayload = { room, player, input, pressed };
    void channelRef.current.send({ type: "broadcast", event: "input", payload });
  };
  const sendCommand = (command: RemoteCommand) => {
    if (!room || !channelRef.current || !connected) return;
    navigator.vibrate?.(20);
    void channelRef.current.send({
      type: "broadcast",
      event: "command",
      payload: { room, command },
    });
  };
  const libraryCommandByInput: Record<number, RemoteCommand> = {
    4: "library-up",
    6: "library-left",
    7: "library-right",
    5: "library-down",
    8: "library-enter",
    0: "library-toggle",
    2: "library-tab-next",
    9: "library-tab-prev",
  };
  const libraryCommandLabelByInput: Partial<Record<number, string>> = {
    0: "Mostrar ou ocultar a janela da biblioteca",
    2: "Próxima aba da biblioteca",
    8: "Abrir o jogo selecionado",
    9: "Aba anterior da biblioteca",
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
      data-circuit-pad={CIRCUIT_PAD_BY_INPUT[input]?.id}
      data-circuit-side={CIRCUIT_PAD_BY_INPUT[input]?.side}
      aria-label={libraryMode ? libraryCommandLabelByInput[input] || label : label}
      title={libraryMode ? libraryCommandLabelByInput[input] || label : label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const releaseTimer = inputReleaseTimers.current.get(input);
        if (releaseTimer !== undefined) window.clearTimeout(releaseTimer);
        inputReleaseTimers.current.delete(input);
        if (libraryMode && libraryCommandByInput[input]) {
          sendCommand(libraryCommandByInput[input]);
          return;
        }
        inputPressedAt.current.set(input, Date.now());
        send(input, true);
      }}
      onPointerUp={() => {
        if (!libraryMode || !libraryCommandByInput[input]) releaseInput(input);
      }}
      onPointerCancel={() => {
        if (!libraryMode || !libraryCommandByInput[input]) releaseInput(input);
      }}
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
      <div
        className="remote-landscape-guard fixed inset-0 z-[1000] place-items-center bg-[#050a12]/95 p-6 text-center backdrop-blur-xl"
        role="status"
        aria-live="polite"
      >
        <section className="w-full max-w-sm rounded-3xl border border-cyan-300/35 bg-[#0b141c] p-7 text-slate-100 shadow-[0_0_55px_rgba(34,211,238,.2)]">
          <div aria-hidden="true" className="mb-3 text-5xl text-cyan-200">
            ↻
          </div>
          <h1 className="font-mono text-xl font-black tracking-wide">PAISAGEM OBRIGATÓRIA</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Gire o celular para a horizontal para continuar.
          </p>
        </section>
      </div>
      <div className="pointer-events-none absolute inset-2 rounded-[2rem] border border-white/10 shadow-[inset_0_0_50px_rgba(255,255,255,.035)]" />
      <header className="relative mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-3 rounded-2xl border border-slate-300/20 bg-slate-200/[.07] px-4 py-3 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_10px_25px_rgba(2,6,23,.22)] [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:px-2 [@media(max-height:500px)]:py-1">
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
          <div
            aria-live="polite"
            className="mt-1 text-[10px] uppercase tracking-wider text-slate-400"
          >
            Painel remoto ·{" "}
            {connected
              ? `conectado${latency === null ? "" : ` · ${latency} ms`}`
              : connectionError
                ? "sem conexão · reabra o QR"
                : "conectando…"}
          </div>
          <div className="mt-1 text-[9px] font-bold tracking-[.16em] text-orange-200/80 [@media(max-height:500px)]:hidden">
            DEV EMERSON 2026
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tvMode && !libraryMode && (
            <button
              type="button"
              onClick={() => sendCommand("return-home")}
              className="rounded-xl border border-cyan-300/50 bg-cyan-300/10 px-3 py-2 text-[10px] font-bold text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_3px_8px_rgba(2,6,23,.3)]"
              aria-label="Salvar e voltar à biblioteca"
              title="Salvar e voltar à biblioteca"
            >
              ← BIBLIOTECA
            </button>
          )}
          <strong
            className={`rounded-lg border px-2 py-1 text-[10px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_3px_8px_rgba(2,6,23,.3)] ${player === 1 ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100" : "border-orange-300/70 bg-orange-300/10 text-orange-100"}`}
            aria-label={`Jogador ${player}`}
            title={`Jogador ${player}`}
          >
            P{player}
          </strong>
        </div>
      </header>
      <section
        ref={frameRef}
        className="relative isolate mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col justify-between gap-2 overflow-hidden rounded-[2rem] border border-white/25 bg-[#06131c]/25 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.2),inset_0_0_55px_rgba(34,211,238,.08),0_18px_40px_rgba(0,0,0,.38)] [@media(max-height:500px)]:gap-0 [@media(max-height:500px)]:py-0"
        style={{
          backgroundImage: `linear-gradient(145deg, rgba(255,255,255,.11), transparent 24%, transparent 76%, rgba(255,255,255,.035)), radial-gradient(ellipse at 50% 52%, rgba(34,211,238,.15), transparent 62%), url("/assets/remote-controller-pcb.webp")`,
          backgroundSize: "100% 100%, cover, cover",
          backgroundPosition: "center, center, center",
        }}
      >
        {circuitLayout.width > 0 && circuitLayout.pads.length > 0 && (
          <svg
            aria-hidden="true"
            className="remote-controller-circuit-overlay"
            viewBox={`0 0 ${circuitLayout.width} ${circuitLayout.height}`}
            preserveAspectRatio="none"
          >
            {circuitLayout.pads.map((pad) => (
              <g key={pad.id}>
                <path
                  d={createCircuitPath(pad, circuitLayout.width, circuitLayout.height)}
                  className="remote-controller-circuit-trace-shadow"
                />
                <path
                  d={createCircuitPath(pad, circuitLayout.width, circuitLayout.height)}
                  className="remote-controller-circuit-trace"
                />
                <circle
                  cx={pad.x}
                  cy={pad.y}
                  r={pad.radius + 3}
                  className="remote-controller-circuit-pad"
                />
                <circle
                  cx={pad.x}
                  cy={pad.y}
                  r={pad.radius + 1}
                  className="remote-controller-circuit-pad-glint"
                />
              </g>
            ))}
          </svg>
        )}
        <div
          className={`relative z-10 grid w-full max-w-3xl gap-2 px-2 ${libraryMode ? "mx-auto max-w-xs grid-cols-1" : tvMode ? "grid-cols-3" : "grid-cols-4"}`}
        >
          {!libraryMode && (
            <button
              type="button"
              onClick={() => sendCommand("toggle-pause")}
              className="h-8 rounded-xl border border-amber-300/70 bg-amber-400/20 px-2 font-mono text-[10px] font-bold text-amber-100 active:brightness-125"
            >
              PAUSAR
            </button>
          )}
          {!libraryMode && !tvMode && (
            <button
              type="button"
              onClick={() => sendCommand("save-and-exit")}
              className="h-8 rounded-xl border border-emerald-300/70 bg-emerald-400/20 px-2 font-mono text-[10px] font-bold text-emerald-100 active:brightness-125"
            >
              BIBLIOTECA
            </button>
          )}
          {control(
            libraryMode ? "ABA +" : "CRÉDITO",
            REMOTE_INPUT.CREDIT,
            "h-8 border-amber-300/80 bg-amber-400/20 text-xs text-amber-100",
          )}
          {!libraryMode &&
            control(
              "START",
              REMOTE_INPUT.START,
              "h-8 border-green-300/80 bg-green-400/20 text-xs text-green-100",
            )}
        </div>
        <div className="relative z-10 flex min-h-0 flex-1 items-center justify-between gap-2 -mx-1 px-0">
          <div className="relative grid aspect-square w-[min(13rem,38%)] translate-y-6 grid-cols-3 grid-rows-3 gap-2">
            <span />
            <span>
              {control(
                "▲",
                4,
                "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-400/35 to-slate-700/35 text-3xl text-slate-100",
              )}
            </span>
            <span />
            <span className="translate-y-5">
              {control(
                "◀",
                6,
                "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-400/35 to-slate-700/35 text-3xl text-slate-100",
              )}
            </span>
            <span className="translate-y-5">
              {control(
                "▼",
                5,
                "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-400/35 to-slate-700/35 text-3xl text-slate-100",
              )}
            </span>
            <span className="translate-y-5">
              {control(
                "▶",
                7,
                "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-400/35 to-slate-700/35 text-3xl text-slate-100",
              )}
            </span>
            <span />
            <span />
            <span />
          </div>
          <div className="relative grid aspect-square w-[min(11.5rem,34%)] translate-y-14 grid-cols-3 grid-rows-3 gap-3">
            <span />
            {libraryMode ? (
              <span />
            ) : (
              control(
                "Y",
                1,
                "h-full w-full border-slate-300/45 bg-gradient-to-b from-slate-400/35 to-slate-700/35 text-2xl text-slate-100",
              )
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
