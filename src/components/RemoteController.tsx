import { useEffect, useMemo, useRef, useState } from "react";

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
  | "pause-state"
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
type RemoteCommandPayload = {
  room: string;
  command: RemoteCommand;
  ok?: boolean;
  paused?: boolean;
  romName?: string;
};

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
  const [showInstallLanding, setShowInstallLanding] = useState(false);
  const [libraryMode, setLibraryMode] = useState(true);
  const [gamePaused, setGamePaused] = useState(false);
  const [libraryGames, setLibraryGames] = useState<
    Array<{ rom: string; title: string; snapUrl?: string | undefined }>
  >([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryIndex, setLibraryIndex] = useState(0);
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= window.innerHeight,
  );
  const frameRef = useRef<HTMLElement | null>(null);
  const [circuitLayout, setCircuitLayout] = useState<CircuitLayout>({
    width: 0,
    height: 0,
    pads: [],
  });

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
    setShowInstallLanding(!appInstalled);

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
      setShowInstallLanding(false);
      setInstallInfoOpen(false);
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
    let cancelled = false;
    const loadLibrary = async () => {
      setLibraryLoading(true);
      try {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.src = "/web/mame-web.js?v=20261102-topband-v1";
          script.onload = () => resolve();
          script.onerror = () => resolve();
          document.head.appendChild(script);
        });
        const [romsResponse, namesResponse, mediaResponse] = await Promise.all([
          fetch("/api/roms"),
          fetch("/api/gamenames"),
          fetch("/assets/media-manifest.json").catch(() => null),
        ]);
        const romsData = romsResponse.ok ? await romsResponse.json() : { roms: [] };
        const namesData = namesResponse.ok ? await namesResponse.json() : { names: {} };
        const mediaData = mediaResponse?.ok ? await mediaResponse.json() : {};
        const names = (namesData.names || {}) as Record<string, string>;
        const media = (mediaData || {}) as Record<
          string,
          { has_snap?: boolean; snap_url?: string }
        >;
        const romList: unknown[] = Array.isArray(romsData.roms) ? romsData.roms : [];
        const games = romList
          .filter((rom): rom is string => typeof rom === "string")
          .map((rom: string) => {
            const base = rom.replace(/\.(zip|7z|chd)$/i, "").toLowerCase();
            const snap = media[base];
            return {
              rom,
              title: names[base] || base.replace(/[-_]+/g, " "),
              snapUrl:
                snap?.has_snap && typeof snap.snap_url === "string" ? snap.snap_url : undefined,
            };
          });
        if (!cancelled) setLibraryGames(games);
      } catch {
        if (!cancelled) setLibraryGames([]);
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    };
    void loadLibrary();
    return () => {
      cancelled = true;
    };
  }, []);
  const visibleLibraryGames = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    if (!query) return libraryGames;
    return libraryGames.filter(
      (game) => game.title.toLowerCase().includes(query) || game.rom.toLowerCase().includes(query),
    );
  }, [libraryGames, libraryQuery]);
  useEffect(() => {
    setLibraryIndex((current) => Math.min(current, Math.max(0, visibleLibraryGames.length - 1)));
  }, [visibleLibraryGames.length]);
  const launchMobileGame = (romName: string) => {
    if (!romName) return;
    sendCommand("launch-game", { romName });
  };
  const moveLibrarySelection = (direction: "up" | "down" | "left" | "right") => {
    if (!visibleLibraryGames.length) return;
    const columns = 2;
    const current = libraryIndex;
    let next = current;
    if (direction === "left") next = Math.max(0, current - 1);
    if (direction === "right") next = Math.min(visibleLibraryGames.length - 1, current + 1);
    if (direction === "up") next = Math.max(0, current - columns);
    if (direction === "down") next = Math.min(visibleLibraryGames.length - 1, current + columns);
    setLibraryIndex(next);
  };
  useEffect(() => {
    if (error) return;
    const frame = frameRef.current;
    if (!frame) return;
    let animationFrame = 0;
    const measure = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const frameRect = frame.getBoundingClientRect();
        // Em pé, o controle é girado 90° pelo CSS; converte para coordenadas do controle.
        const rotated = window.matchMedia("(orientation: portrait)").matches;
        const pads = Array.from(frame.querySelectorAll<HTMLElement>("[data-circuit-pad]")).map(
          (element): CircuitPad => {
            const rect = element.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            return {
              id: element.dataset["circuitPad"] || "",
              side: element.dataset["circuitSide"] === "right" ? "right" : "left",
              x: rotated ? cy - frameRect.top : cx - frameRect.left,
              y: rotated ? frameRect.right - cx : cy - frameRect.top,
              radius: Math.min(rect.width, rect.height) / 2,
            };
          },
        );
        setCircuitLayout({
          width: rotated ? frameRect.height : frameRect.width,
          height: rotated ? frameRect.width : frameRect.height,
          pads,
        });
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
      setShowInstallLanding(false);
      setInstallInfoOpen(false);
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

  const enterLandscapeMode = async () => {
    try {
      const root = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
        if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: "hide" });
        else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
      }
    } catch {
      // Alguns navegadores não permitem tela cheia nesta página.
    }
    await requestLandscape();
  };

  useEffect(() => {
    void requestLandscape();
    void requestWakeLock();
    const updateOrientation = () => setIsLandscape(window.innerWidth >= window.innerHeight);
    updateOrientation();
    window.addEventListener("resize", updateOrientation, { passive: true });
    window.addEventListener("orientationchange", updateOrientation, { passive: true });
    const restoreWakeLock = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };
    window.addEventListener("visibilitychange", restoreWakeLock, { passive: true });
    return () => {
      window.removeEventListener("resize", updateOrientation);
      window.removeEventListener("orientationchange", updateOrientation);
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
      config: { private: false, broadcast: { ack: true } },
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
        if (command.room !== room) return;
        if (command.command === "library-launch-result") {
          setLibraryMode(!command.ok);
          if (command.ok) setGamePaused(false);
          return;
        }
        if (command.command === "pause-state") setGamePaused(Boolean(command.paused));
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
      if (ok) setGamePaused(false);
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
    if (!room || !channelRef.current) return;
    if (pressed) navigator.vibrate?.(8);
    if (pressed) activeInputs.current.add(input);
    else activeInputs.current.delete(input);
    const payload: RemotePayload = { room, player, input, pressed };
    void channelRef.current
      .send({ type: "broadcast", event: "input", payload })
      .then((status) => {
        if (status !== "ok") {
          setConnectionError(true);
          setConnected(false);
        }
      })
      .catch(() => {
        setConnectionError(true);
        setConnected(false);
      });
  };
  const sendCommand = (command: RemoteCommand, extra: Partial<RemoteCommandPayload> = {}) => {
    if (!room || !channelRef.current) return;
    navigator.vibrate?.(20);
    void channelRef.current
      .send({
        type: "broadcast",
        event: "command",
        payload: { room, command, ...extra },
      })
      .then((status) => {
        if (status !== "ok") {
          setConnectionError(true);
          setConnected(false);
        }
      })
      .catch(() => {
        setConnectionError(true);
        setConnected(false);
      });
  };
  const openMobileLibrary = () => {
    setLibraryMode(true);
    setGamePaused(false);
    setLibraryQuery("");
    setLibraryIndex(0);
    sendCommand("return-home");
  };
  const exitMobileGame = () => {
    setLibraryMode(true);
    setGamePaused(false);
    setLibraryQuery("");
    setLibraryIndex(0);
    sendCommand("save-and-exit");
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
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Alguns navegadores móveis recusam pointer capture após rotação;
          // isso não pode impedir o envio do comando ao host.
        }
        const releaseTimer = inputReleaseTimers.current.get(input);
        if (releaseTimer !== undefined) window.clearTimeout(releaseTimer);
        inputReleaseTimers.current.delete(input);
        if (libraryMode && libraryCommandByInput[input]) {
          const command = libraryCommandByInput[input];
          if (
            command === "library-up" ||
            command === "library-down" ||
            command === "library-left" ||
            command === "library-right"
          ) {
            moveLibrarySelection(
              command.replace("library-", "") as "up" | "down" | "left" | "right",
            );
          } else if (command === "library-enter") {
            const selected = visibleLibraryGames[libraryIndex];
            if (selected) launchMobileGame(selected.rom);
          }
          sendCommand(command);
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
      onLostPointerCapture={() => {
        if (libraryMode && libraryCommandByInput[input]) return;
        if (inputPressedAt.current.has(input) && !inputReleaseTimers.current.has(input))
          releaseInput(input);
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
      className="mga-reference-controller notranslate relative flex h-[100dvh] min-h-0 flex-col select-none overflow-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(113,140,153,.32),transparent_26%),radial-gradient(circle_at_90%_90%,rgba(194,113,58,.14),transparent_28%),linear-gradient(135deg,#1c2930,#0e151b_55%,#111b21)] p-2 text-slate-100 compact:p-1"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={() => {
        void enterLandscapeMode();
        void requestWakeLock();
      }}
    >
      <div className="pointer-events-none absolute inset-2 rounded-[2rem] border border-white/10 shadow-[inset_0_0_50px_rgba(255,255,255,.035)]" />
      <div
        className={`remote-landscape-warning ${isLandscape ? "remote-landscape-warning--hidden" : ""}`}
        role="status"
        aria-live="polite"
      >
        <div className="remote-landscape-warning__icon" aria-hidden="true">
          ↔
        </div>
        <strong>VIRE O CELULAR</strong>
        <span>Este controle funciona somente na horizontal.</span>
        <small>Gire a tela e os botões grandes aparecerão automaticamente.</small>
      </div>
      <header className="relative mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-3 rounded-2xl border border-slate-300/20 bg-slate-200/[.07] px-4 py-3 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_10px_25px_rgba(2,6,23,.22)] compact:gap-2 compact:px-2 compact:py-1">
        <div>
          <div className="flex items-center gap-2 text-xs tracking-[.18em] text-slate-100">
            <img
              src="/kali-dragon.png"
              alt=""
              aria-hidden="true"
              className="h-12 w-12 object-contain brightness-0 invert opacity-80 drop-shadow-[0_0_9px_rgba(251,146,60,.6)] compact:h-5 compact:w-5"
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
          <div className="mt-1 text-[9px] font-bold tracking-[.12em] text-emerald-200/85">
            CONTROLE WEB · APP OPCIONAL
          </div>
        </div>
        <div className="flex items-center gap-2">
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
        className={`relative isolate mx-auto flex w-full max-w-none min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-[2rem] border border-white/25 bg-[#06131c]/25 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.2),inset_0_0_55px_rgba(34,211,238,.08),0_18px_40px_rgba(0,0,0,.38)] compact:gap-0 compact:py-0 ${libraryMode ? "justify-start" : "justify-between"}`}
        style={{
          backgroundImage: `linear-gradient(145deg, rgba(255,255,255,.11), transparent 24%, transparent 76%, rgba(255,255,255,.035)), radial-gradient(ellipse at 50% 52%, rgba(34,211,238,.15), transparent 62%), url("/assets/remote-controller-pcb.webp")`,
          backgroundSize: "100% 100%, cover, cover",
          backgroundPosition: "center, center, center",
        }}
      >
        {libraryMode && (
          <div className="relative z-20 mx-auto flex h-full w-full max-w-none min-h-0 flex-1 flex-row-reverse gap-2 rounded-2xl border border-cyan-300/25 bg-[#06131c]/75 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_8px_18px_rgba(0,0,0,.28)] backdrop-blur-sm">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-2 px-1 pb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] font-black tracking-[.18em] text-cyan-200">
                    BIBLIOTECA NO CELULAR
                  </div>
                  <div className="truncate font-mono text-[9px] text-slate-400">
                    Escolha o jogo para abrir no navegador
                  </div>
                </div>
                <span className="rounded-full border border-cyan-300/25 px-2 py-1 font-mono text-[9px] text-cyan-200">
                  {visibleLibraryGames.length}
                </span>
              </div>
              <input
                value={libraryQuery}
                onChange={(event) => {
                  setLibraryQuery(event.target.value);
                  setLibraryIndex(0);
                }}
                placeholder="Buscar jogo..."
                className="mb-2 w-full shrink-0 rounded-xl border border-cyan-300/25 bg-black/35 px-3 py-2 font-mono text-[11px] text-cyan-50 outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
                aria-label="Buscar jogo na biblioteca"
              />
              <div className="game-library-scroll min-h-0 flex-1 overflow-y-auto pr-1">
                {libraryLoading ? (
                  <div className="grid h-full place-items-center font-mono text-[11px] text-cyan-200">
                    CARREGANDO JOGOS...
                  </div>
                ) : visibleLibraryGames.length === 0 ? (
                  <div className="grid h-full place-items-center text-center font-mono text-[11px] text-slate-400">
                    Nenhum jogo encontrado.
                  </div>
                ) : (
                  <div className="remote-library-grid grid grid-cols-2 gap-2">
                    {visibleLibraryGames.map((game, index) => (
                      <button
                        key={game.rom}
                        type="button"
                        onClick={() => {
                          setLibraryIndex(index);
                          launchMobileGame(game.rom);
                        }}
                        className={`relative aspect-video min-w-0 overflow-hidden rounded-xl border text-left font-mono text-[10px] font-bold transition ${index === libraryIndex ? "border-cyan-200 text-cyan-50 shadow-[0_0_12px_rgba(34,211,238,.28)]" : "border-white/10 text-slate-300"}`}
                      >
                        <span className="absolute inset-0 bg-gradient-to-br from-cyan-950 to-slate-950" />
                        {game.snapUrl && (
                          <img
                            src={game.snapUrl}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            decoding="async"
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                            }}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        )}
                        <span className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-transparent" />
                        <span className="absolute inset-x-2 bottom-2 z-10">
                          <span className="line-clamp-2 block">{game.title}</span>
                          <span className="mt-1 block truncate text-[8px] font-normal text-slate-200/80">
                            TOCAR PARA ABRIR
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <aside className="remote-library-art relative hidden w-[clamp(112px,22vw,220px)] shrink-0 overflow-hidden rounded-xl border border-white/15 bg-slate-950">
              <img
                src="/assets/mobile-library-rider.png"
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover object-center"
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
            </aside>
          </div>
        )}
        {!libraryMode && circuitLayout.width > 0 && circuitLayout.pads.length > 0 && (
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
          className={`relative z-10 grid w-full max-w-3xl grid-cols-5 gap-2 px-2 ${libraryMode ? "hidden" : ""}`}
        >
          {!libraryMode && (
            <button
              type="button"
              aria-label={gamePaused ? "Retomar jogo" : "Pausar jogo"}
              title={gamePaused ? "Retomar jogo" : "Pausar jogo"}
              onClick={() => sendCommand("toggle-pause")}
              className="h-8 min-w-0 rounded-xl border border-amber-300/70 bg-amber-400/20 px-1 font-mono text-[9px] font-bold text-amber-100 active:brightness-125"
            >
              {gamePaused ? "RETOMAR" : "PAUSAR"}
            </button>
          )}
          {!libraryMode && (
            <button
              type="button"
              aria-label="Sair do jogo e salvar progresso"
              title="Sair do jogo e salvar progresso"
              onClick={exitMobileGame}
              className="h-8 min-w-0 rounded-xl border border-rose-300/70 bg-rose-400/20 px-1 font-mono text-[8px] font-bold leading-tight text-rose-100 active:brightness-125"
            >
              SAIR DO JOGO
            </button>
          )}
          {!libraryMode && (
            <button
              type="button"
              aria-label="Voltar às telas da biblioteca"
              title="Voltar à biblioteca na tela web"
              onClick={openMobileLibrary}
              className="h-8 min-w-0 rounded-xl border border-emerald-300/70 bg-emerald-400/20 px-1 font-mono text-[9px] font-bold text-emerald-100 active:brightness-125"
            >
              VOLTAR
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
        <div
          className={`controller-control-row relative z-10 flex min-h-0 flex-1 justify-between gap-2 -mx-1 px-0 ${libraryMode ? "hidden" : ""}`}
        >
          <div className="controller-pad-grid relative grid aspect-square grid-cols-3 grid-rows-3 gap-2">
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
            <span />
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
          <div className="controller-action-grid relative grid aspect-square grid-cols-3 grid-rows-3 gap-3">
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
            {libraryMode ? (
              <span />
            ) : (
              control(
                "X",
                9,
                "h-full w-full border-amber-200/70 bg-gradient-to-b from-amber-300/35 to-amber-700/25 text-2xl text-amber-50",
              )
            )}
            <span />
            {control(
              "B",
              0,
              "h-full w-full border-sky-200/65 bg-gradient-to-b from-sky-300/30 to-sky-700/25 text-2xl text-sky-50",
            )}
            <span />
            {control(
              "A",
              8,
              `h-full w-full ${player === 1 ? "border-cyan-200/80 bg-gradient-to-b from-cyan-300/35 to-cyan-700/25 text-cyan-50" : "border-orange-200/80 bg-gradient-to-b from-orange-300/35 to-orange-700/25 text-orange-50"} text-2xl`,
            )}
            <span />
          </div>
        </div>
      </section>
      {(installInfoOpen || showInstallLanding) && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#050a12]/95 p-4 backdrop-blur-md">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="remote-install-title"
            className="relative max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-[2rem] border border-cyan-200/35 bg-[linear-gradient(145deg,#10252d,#09131b_60%,#180f18)] p-5 text-slate-100 shadow-[0_0_80px_rgba(34,211,238,.22)] sm:p-7 compact:rounded-2xl compact:p-3"
          >
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-300 via-violet-400 to-orange-300" />
            <button
              type="button"
              onClick={() => {
                setInstallInfoOpen(false);
                setShowInstallLanding(false);
              }}
              className="absolute right-4 top-4 rounded-full border border-white/15 px-3 py-1 text-lg text-slate-300 hover:bg-white/10"
              aria-label="Fechar instalação"
            >
              ×
            </button>
            <div className="flex items-center gap-4 pr-10 compact:gap-2">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-cyan-300/35 bg-cyan-300/10 p-2 shadow-[0_0_24px_rgba(34,211,238,.15)] compact:h-10 compact:w-10 compact:rounded-xl compact:p-1">
                <img src="/kali-dragon.png" alt="" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="font-mono text-[10px] font-bold tracking-[.22em] text-cyan-200">
                  APP WEB DO CONTROLE
                </p>
                <h2
                  id="remote-install-title"
                  className="mt-1 text-2xl font-black text-white compact:text-lg"
                >
                  Instale o MGA Controle
                </h2>
              </div>
            </div>
            <img
              src="/assets/remote-controller-fight.jpg"
              alt="Chun-Li e Ken em uma luta de arcade"
              className="mt-5 h-48 w-full rounded-2xl border border-white/15 object-cover object-center shadow-[0_12px_30px_rgba(0,0,0,.35)] sm:h-56 compact:mt-2 compact:h-16"
            />
            <div className="mt-4 rounded-2xl border border-cyan-200/20 bg-cyan-200/[.06] p-4 compact:mt-2 compact:p-2">
              <p className="font-mono text-[11px] font-black tracking-[.18em] text-cyan-200">
                CONTROLE WEB · SEM APK
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-200 compact:mt-1 compact:text-xs">
                Instale este app web no celular para abrir o controle como um aplicativo, em tela
                cheia e sem precisar procurar o link novamente.
              </p>
            </div>
            {showInstallLanding && installPrompt && (
              <button
                type="button"
                onClick={() => void installRemoteApp()}
                className="mt-3 w-full rounded-2xl border border-cyan-200/80 bg-gradient-to-b from-cyan-300/30 to-cyan-700/20 px-5 py-4 font-mono text-sm font-black tracking-wide text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,.16)] transition hover:brightness-110 compact:mt-2 compact:py-2"
              >
                ⬇ INSTALAR APP WEB NO CELULAR
              </button>
            )}
            <a
              href={`/controller?controller=1&room=${encodeURIComponent(room)}&player=${player}`}
              className="mt-3 flex w-full items-center justify-center rounded-2xl border border-violet-200/50 bg-violet-300/10 px-5 py-3 font-mono text-xs font-black tracking-wide text-violet-100 transition hover:bg-violet-300/20 compact:mt-2 compact:py-2"
            >
              ↗ ABRIR LINK DO APP WEB
            </a>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-xs compact:mt-2 compact:px-3 compact:py-1.5">
              <strong className={player === 1 ? "text-cyan-200" : "text-orange-200"}>
                JOGADOR {player}
              </strong>
              <span className="text-slate-400">SALA {room}</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-300 compact:mt-2 compact:text-xs">
              Esta é a versão web do sistema. A instalação adiciona um atalho do{" "}
              <b className="text-cyan-100">MGA Controle</b> à tela inicial e mantém a sala do
              Jogador {player} pronta para usar.
            </p>
            {!showInstallLanding && installPrompt ? (
              <button
                type="button"
                onClick={() => void installRemoteApp()}
                className="mt-5 w-full rounded-2xl border border-cyan-200/80 bg-gradient-to-b from-cyan-300/30 to-cyan-700/20 px-5 py-4 font-mono text-sm font-black tracking-wide text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,.16)] transition hover:brightness-110"
              >
                ⬇ INSTALAR APP WEB NO CELULAR
              </button>
            ) : installed ? (
              <div className="mt-5 rounded-2xl border border-emerald-200/25 bg-emerald-200/5 p-4 text-sm leading-relaxed text-emerald-100">
                <p className="font-bold">MGA Controle instalado neste aparelho.</p>
                <p className="mt-2 text-emerald-100/80">
                  Abra o ícone na tela inicial para voltar a esta experiência.
                </p>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-amber-200/25 bg-amber-200/5 p-4 text-sm leading-relaxed text-slate-200">
                <p className="font-bold text-amber-100">Instalação pelo menu do navegador</p>
                <p className="mt-2">
                  O navegador ainda não liberou o botão automático, mas a instalação web continua
                  disponível:
                </p>
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
                setInstallInfoOpen(false);
                setShowInstallLanding(false);
              }}
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
