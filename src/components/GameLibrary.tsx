import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Star,
  Play,
  Clock3,
  Ghost,
  RotateCcw,
  Maximize2,
  Minimize2,
  Gamepad2,
  Minus,
  Info,
  X,
} from "lucide-react";
import { RemoteControlHub } from "@/components/RemoteControlHub";

/**
 * Biblioteca de jogos local.
 *
 * Antes, a lista de jogos (cards, busca, favoritos) vinha de um bundle
 * remoto hospedado num repositório separado (master-games-arcade-system,
 * via CDN). Este componente substitui aquele bundle: ele roda dentro deste
 * projeto, lê os mesmos dados que já existiam localmente
 * (roms-catalog.json, game-titles.json, media-manifest.json) e conversa
 * com o bridge local `public/web/mame-web.js` só para abrir o jogo, listar
 * favoritos/recentes e alternar favorito — o próprio bridge já expõe tudo
 * isso via `fetch("/api/...")` interceptado (nenhum servidor real por trás).
 */

type MediaEntry = {
  has_snap?: boolean;
  snap_url?: string;
};

type Tab = "all" | "favorites" | "recent";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "favorites", label: "Favoritos" },
  { id: "recent", label: "Recentes" },
];

const BACKGROUND_IMAGES = ["/assets/intro-esteyori-poster.jpg"];

const fileBase = (name: string) => name.toLowerCase().replace(/\.(zip|7z|chd)$/i, "");

type LocalCheckpoint = { rom: string; savedAt: number };

async function findLatestLocalCheckpoint(): Promise<LocalCheckpoint | null> {
  if (typeof window === "undefined" || !window.indexedDB) return null;

  return new Promise((resolve) => {
    let db: IDBDatabase | null = null;
    let settled = false;
    let latest: LocalCheckpoint | null = null;
    const finish = (value: LocalCheckpoint | null) => {
      if (settled) return;
      settled = true;
      db?.close();
      resolve(value);
    };

    try {
      const request = window.indexedDB.open("mga-progress-v1", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("states")) {
          request.result.createObjectStore("states");
        }
      };
      request.onerror = () => finish(null);
      request.onsuccess = () => {
        db = request.result;
        if (!db.objectStoreNames.contains("states")) return finish(null);

        try {
          const transaction = db.transaction("states", "readonly");
          const cursorRequest = transaction.objectStore("states").openCursor();
          transaction.onerror = () => finish(latest);
          transaction.onabort = () => finish(latest);
          cursorRequest.onerror = () => finish(latest);
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return finish(latest);

            const key = String(cursor.key);
            const record = cursor.value as {
              rom?: unknown;
              savedAt?: unknown;
              state?: unknown;
            };
            const bytes = record?.state;
            const stateSize =
              bytes instanceof ArrayBuffer
                ? bytes.byteLength
                : ArrayBuffer.isView(bytes)
                  ? bytes.byteLength
                  : 0;
            const savedAt = Number(record?.savedAt) || 0;
            if (
              !key.includes(":slot_") &&
              typeof record?.rom === "string" &&
              stateSize > 0 &&
              savedAt > (latest?.savedAt || 0)
            ) {
              latest = { rom: record.rom.toLowerCase(), savedAt };
            }
            cursor.continue();
          };
        } catch {
          finish(null);
        }
      };
    } catch {
      finish(null);
    }
  });
}

const prettyFallback = (name: string) =>
  fileBase(name)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

async function waitForBridge(): Promise<void> {
  await new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = "/web/mame-web.js?v=20261024-web-cleanup-v1";
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

export function GameLibrary({
  accountSlot,
  cloudAccessToken,
}: {
  accountSlot?: React.ReactNode;
  cloudAccessToken?: string | null;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [roms, setRoms] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [media, setMedia] = useState<Record<string, MediaEntry>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [resumeGame, setResumeGame] = useState<{ rom: string; savedAt: number | null } | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [launching, setLaunching] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState("");
  const mountedRef = useRef(true);

  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWindowOpen, setIsWindowOpen] = useState(true);
  const [isWindowExpanded, setIsWindowExpanded] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(0);
  const libraryContentRef = useRef<HTMLDivElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    (window as Window & { MGA_CLOUD_ACCESS_TOKEN?: string }).MGA_CLOUD_ACCESS_TOKEN =
      cloudAccessToken || "";
    window.dispatchEvent(new Event("mga-cloud-access-token-updated"));
  }, [cloudAccessToken]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.body.classList.contains("mga-game-active")) return;
      setBackgroundIndex((current) => (current + 1) % BACKGROUND_IMAGES.length);
    }, 10_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let x = 0;
    let y = 0;
    const render = () => {
      frame = 0;
      root.style.setProperty("--mga-parallax-x", `${x}px`);
      root.style.setProperty("--mga-parallax-y", `${y}px`);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (document.body.classList.contains("mga-game-active")) return;
      if (reducedMotion.matches || event.pointerType === "touch") return;
      x = Math.max(-12, Math.min(12, (event.clientX / window.innerWidth - 0.5) * -24));
      y = Math.max(-8, Math.min(8, (event.clientY / window.innerHeight - 0.5) * -16));
      if (!frame) frame = window.requestAnimationFrame(render);
    };
    const reset = () => {
      x = 0;
      y = 0;
      if (!frame) frame = window.requestAnimationFrame(render);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", reset, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", reset);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--mga-parallax-x");
      root.style.removeProperty("--mga-parallax-y");
    };
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Alguns navegadores bloqueiam fullscreen no preview ou em iframes.
    }
  };

  const loadLibrary = async () => {
    setPhase("loading");
    setErrorMessage("");
    try {
      await waitForBridge();
      const [romsRes, namesRes, favRes, recentRes, mediaRes] = await Promise.all([
        fetch("/api/roms"),
        fetch("/api/gamenames"),
        fetch("/api/games/favorites"),
        fetch("/api/games/recent"),
        fetch("/assets/media-manifest.json").catch(() => null),
      ]);
      if (!romsRes.ok) throw new Error("Catálogo de ROMs indisponível");
      const romsData = await romsRes.json();
      const namesData = namesRes.ok ? await namesRes.json() : { names: {} };
      const favData = favRes.ok ? await favRes.json() : { games: [] };
      const recentData = recentRes.ok ? await recentRes.json() : { games: [] };
      const mediaData = mediaRes && mediaRes.ok ? await mediaRes.json() : {};
      const latestCheckpoint = await findLatestLocalCheckpoint();
      const availableRoms: string[] = Array.isArray(romsData.roms) ? romsData.roms : [];
      const recentGames: string[] = Array.isArray(recentData.games) ? recentData.games : [];
      const checkpointRom = latestCheckpoint
        ? availableRoms.find((rom) => fileBase(rom) === latestCheckpoint.rom)
        : undefined;
      const resumeRom = checkpointRom || recentGames[0] || null;
      if (!mountedRef.current) return;
      setRoms(availableRoms);
      setNames(namesData.names || {});
      setFavorites(Array.isArray(favData.games) ? favData.games : []);
      setRecent(recentGames);
      setResumeGame(
        resumeRom
          ? { rom: resumeRom, savedAt: checkpointRom ? latestCheckpoint?.savedAt || null : null }
          : null,
      );
      setMedia(mediaData || {});
      setPhase("ready");
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(error instanceof Error ? error.message : "Falha ao carregar a biblioteca.");
      setPhase("error");
    }
  };

  useEffect(() => {
    void loadLibrary();
  }, []);

  useEffect(() => {
    const refreshResumeGame = async () => {
      const latestCheckpoint = await findLatestLocalCheckpoint();
      const checkpointRom = latestCheckpoint
        ? roms.find((rom) => fileBase(rom) === latestCheckpoint.rom)
        : undefined;
      const resumeRom = checkpointRom || recent[0] || null;
      setResumeGame(
        resumeRom
          ? { rom: resumeRom, savedAt: checkpointRom ? latestCheckpoint?.savedAt || null : null }
          : null,
      );
    };
    const handleSaveComplete = () => void refreshResumeGame();
    window.addEventListener("mga-save-complete", handleSaveComplete);
    return () => window.removeEventListener("mga-save-complete", handleSaveComplete);
  }, [roms, recent]);

  const titleFor = (rom: string) => names[fileBase(rom)] || prettyFallback(rom);
  const snapFor = (rom: string) => {
    const entry = media[fileBase(rom)];
    return entry?.has_snap ? entry.snap_url : undefined;
  };
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const visibleRoms = useMemo(() => {
    let list = roms;
    if (tab === "favorites") list = roms.filter((rom) => favoriteSet.has(rom));
    if (tab === "recent") {
      const order = new Map(recent.map((rom, index) => [rom, index]));
      list = roms.filter((rom) => order.has(rom)).sort((a, b) => order.get(a)! - order.get(b)!);
    }
    const q = query.trim().toLowerCase();
    return q
      ? list.filter((rom) => titleFor(rom).toLowerCase().includes(q) || fileBase(rom).includes(q))
      : list;
  }, [roms, tab, favoriteSet, recent, query, names]);

  useEffect(() => {
    selectedIndexRef.current = 0;
    setSelectedIndex(0);
    libraryContentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [query, tab]);

  useEffect(() => {
    const next = Math.min(selectedIndexRef.current, Math.max(0, visibleRoms.length - 1));
    selectedIndexRef.current = next;
    setSelectedIndex(next);
  }, [visibleRoms.length]);

  const toggleFavorite = async (rom: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      const response = await fetch("/api/games/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: rom }),
      });
      const data = await response.json();
      if (Array.isArray(data.games)) setFavorites(data.games);
    } catch {
      // O bridge local pode não estar disponível em uma prévia sem assets.
    }
  };

  const playGame = async (rom: string): Promise<boolean> => {
    if (launching) return false;
    setLaunchError("");
    setLaunching(rom);
    try {
      const response = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ romName: rom }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Não foi possível abrir o jogo.");
      setRecent((previous) => [rom, ...previous.filter((item) => item !== rom)].slice(0, 100));
      window.dispatchEvent(new CustomEvent("mga-remote-game-launch-result", { detail: { ok: true } }));
      return true;
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Não foi possível abrir o jogo.");
      window.dispatchEvent(new CustomEvent("mga-remote-game-launch-result", { detail: { ok: false } }));
      return false;
    } finally {
      if (mountedRef.current) setLaunching(null);
    }
  };

  useEffect(() => {
    const handleRemoteLaunch = (event: Event) => {
      const rom = (event as CustomEvent<{ rom?: unknown }>).detail?.rom;
      if (typeof rom === "string" && roms.includes(rom)) void playGame(rom);
    };
    window.addEventListener("mga-remote-launch-game", handleRemoteLaunch);
    return () => window.removeEventListener("mga-remote-launch-game", handleRemoteLaunch);
  }, [roms, launching]);

  return (
    <div className={`relative min-h-screen overflow-hidden bg-[#050009] text-[#eafffe]`}>
      <div className="mga-game-background pointer-events-none fixed inset-0 z-0 bg-[#050009]">
        {BACKGROUND_IMAGES.map((image, index) => (
          <img
            key={image}
            src={image}
            alt=""
            aria-hidden="true"
            style={{
              objectPosition: "center 30%",
              transform:
                "translate3d(var(--mga-parallax-x, 0px), var(--mga-parallax-y, 0px), 0) scale(1.02)",
            }}
            className={`mga-hero-image absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
              index === backgroundIndex ? "opacity-60" : "opacity-0"
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-[#050009]/45" />
      </div>

      <header
        className={`relative z-10 sticky top-0 border-b border-cyan-500/20 bg-[#050009]/90 px-4 py-3 backdrop-blur sm:px-8`}
      >
        <div
          className={`mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}
        >
          <div className={`flex items-center gap-3`}>
            <img
              src="/kali-dragon.png"
              alt="Logo do dragão"
              className="h-12 w-12 shrink-0 object-contain brightness-0 invert opacity-85 drop-shadow-[0_0_9px_rgba(0,229,255,.65)]"
            />
            <div>
              <h1 className="font-mono text-lg font-bold tracking-wide text-cyan-400 [text-shadow:0_0_10px_rgba(0,229,255,.5)] sm:text-xl">
                MASTER GAMES ARCADE
              </h1>
              <p className="font-mono text-[10px] font-bold tracking-[.18em] text-pink-200">
                DEV EMERSON 2026
              </p>
              <p className="font-mono text-[11px] text-zinc-500">
                {roms.length > 0 ? `${roms.length} jogos disponíveis` : "Fliperama no navegador"}
              </p>
            </div>
          </div>

          <div className={`flex flex-col gap-2 sm:flex-row sm:items-center`}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500/60" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar jogo..."
                className="w-full min-w-0 rounded-full border border-cyan-500/30 bg-black/60 py-2 pl-9 pr-4 font-mono text-sm text-cyan-100 placeholder:text-zinc-600 outline-none focus:border-cyan-400 sm:w-56"
              />
            </div>

            <div className={`flex gap-1.5`}>
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide transition-colors ${
                    tab === item.id
                      ? "border-cyan-400 bg-cyan-400/15 text-cyan-300"
                      : "border-white/10 text-zinc-400 hover:border-cyan-500/40 hover:text-cyan-200"
                  }`}
                >
                  {item.id === "favorites" && <Star className="h-3 w-3" />}
                  {item.id === "recent" && <Clock3 className="h-3 w-3" />}
                  {item.label}
                </button>
              ))}
            </div>

            <div>
              <RemoteControlHub />
            </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Sair da tela cheia" : "Entrar em tela cheia"}
              title={isFullscreen ? "Sair da tela cheia" : "Entrar em tela cheia"}
              className={`flex items-center justify-center gap-1.5 rounded-full border border-cyan-500/30 px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide text-cyan-200 transition-colors hover:border-cyan-400 hover:bg-cyan-400/10`}
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              <span>{isFullscreen ? "Sair da tela cheia" : "Tela cheia"}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAboutOpen(true)}
              aria-label="Sobre o sistema"
              title="Sobre o sistema"
              className={`flex items-center justify-center gap-1.5 rounded-full border border-pink-400/30 px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide text-pink-200 transition-colors hover:border-pink-300 hover:bg-pink-400/10`}
            >
              <Info className="h-3.5 w-3.5" /> Sobre
            </button>
            <div className="">{accountSlot}</div>
          </div>
        </div>
      </header>

      {isWindowOpen ? (
        <section
          aria-label="Janela da biblioteca de jogos"
          className={`fixed inset-x-2 top-[16rem] z-30 flex max-h-[calc(100dvh-17rem)] w-[calc(100vw-1rem)] min-w-0 flex-col overflow-hidden rounded-2xl border border-cyan-500/35 bg-[#050009]/90 shadow-[0_0_36px_rgba(0,229,255,.22)] backdrop-blur-xl transition-[width] duration-300 sm:inset-x-auto sm:right-3 sm:top-24 sm:max-h-[calc(100dvh-6rem)] sm:w-[min(92vw,420px)] ${isWindowExpanded ? "sm:w-[min(96vw,1200px)]" : ""}`}
        >
          <div
            className={`flex shrink-0 items-center justify-between gap-3 border-b border-cyan-500/20 bg-black/35 px-3 py-2.5`}
          >
            <div className="min-w-0">
              <h2 className="font-mono text-xs font-bold tracking-[0.16em] text-cyan-300">
                BIBLIOTECA
              </h2>
              <p className="font-mono text-[10px] text-zinc-500">
                {phase === "ready"
                  ? `${visibleRoms.length} jogos · DEV EMERSON 2026`
                  : "Master Games Arcade · DEV EMERSON 2026"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsWindowExpanded((expanded) => !expanded)}
                aria-label={isWindowExpanded ? "Recolher janela" : "Expandir janela"}
                title={isWindowExpanded ? "Recolher janela" : "Expandir janela"}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-zinc-300 transition-colors hover:border-cyan-400/60 hover:text-cyan-200"
              >
                {isWindowExpanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsWindowOpen(false)}
                aria-label="Ocultar janela da biblioteca"
                title="Ocultar janela"
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-zinc-300 transition-colors hover:border-pink-400/60 hover:text-pink-200"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            ref={libraryContentRef}
            className={`game-library-scroll min-h-0 flex-1 touch-pan-y overscroll-contain overflow-y-auto p-3 sm:p-4`}
          >
            {phase === "ready" && resumeGame && !query.trim() && (
              <button
                ref={resumeButtonRef}
                type="button"
                onClick={() => playGame(resumeGame.rom)}
                disabled={Boolean(launching)}
                aria-label={`Continuar ${titleFor(resumeGame.rom)}`}
                className={`mb-4 flex w-full items-center gap-3 rounded-xl border bg-amber-400/10 p-3 text-left transition-colors hover:bg-amber-400/15 disabled:cursor-wait disabled:opacity-60 ${selectedIndex === -1 ? "border-cyan-300 shadow-[0_0_18px_rgba(0,229,255,.35)] ring-2 ring-cyan-300/60" : "border-amber-400/45"}`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-300/50 bg-black/30 text-amber-200">
                  <Play className="h-4 w-4 fill-current" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[10px] font-bold tracking-wider text-amber-200">
                    CONTINUAR PARTIDA
                  </span>
                  <span className="block truncate font-mono text-sm font-bold text-white">
                    {titleFor(resumeGame.rom)}
                  </span>
                  <span className="block font-mono text-[10px] text-zinc-300">
                    {resumeGame.savedAt
                      ? `Checkpoint confirmado ${new Date(resumeGame.savedAt).toLocaleString("pt-BR")}`
                      : "Abrir o último jogo e procurar um checkpoint disponível"}
                  </span>
                </span>
              </button>
            )}

            {phase === "loading" && <LibrarySkeleton expanded={isWindowExpanded} />}

            {phase === "error" && (
              <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-4 text-center">
                <Ghost className="h-10 w-10 text-pink-400" />
                <p className="font-mono text-sm text-pink-300">{errorMessage}</p>
                <button
                  type="button"
                  onClick={loadLibrary}
                  className="flex items-center gap-2 rounded-full border border-cyan-400 px-4 py-2 font-mono text-xs font-bold text-cyan-300 hover:bg-cyan-400/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Tentar novamente
                </button>
              </div>
            )}

            {phase === "ready" && visibleRoms.length === 0 && (
              <div className="mt-12 text-center font-mono text-sm text-zinc-500">
                {tab === "favorites"
                  ? "Nenhum favorito ainda. Toque na estrela de um jogo para guardar aqui."
                  : tab === "recent"
                    ? "Você ainda não jogou nada nesta sessão."
                    : "Nenhum jogo encontrado para essa busca."}
              </div>
            )}

            {phase === "ready" && visibleRoms.length > 0 && (
              <div
                className={`grid w-full min-w-0 grid-cols-2 gap-3 ${isWindowExpanded ? "sm:grid-cols-3 xl:grid-cols-4" : ""}`}
              >
                {visibleRoms.map((rom, index) => (
                  <GameCard
                    key={rom}
                    title={titleFor(rom)}
                    snapUrl={snapFor(rom)}
                    isFavorite={favoriteSet.has(rom)}
                    isLaunching={launching === rom}
                    isSelected={selectedIndex === index}
                    onPlay={() => playGame(rom)}
                    onToggleFavorite={(e) => toggleFavorite(rom, e)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setIsWindowOpen(true)}
          className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-cyan-400/60 bg-[#050009]/90 px-4 py-3 font-mono text-xs font-bold text-cyan-200 shadow-[0_0_22px_rgba(0,229,255,.24)] backdrop-blur-md transition-colors hover:bg-cyan-400/15"
        >
          <Gamepad2 className="h-4 w-4" /> Mostrar biblioteca
        </button>
      )}

      {launchError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-pink-500 bg-black/90 px-4 py-2 font-mono text-xs text-pink-300 shadow-[0_0_20px_rgba(255,43,109,.35)]"
        >
          {launchError}
        </div>
      )}

      {isAboutOpen && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-system-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsAboutOpen(false);
          }}
        >
          <section className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-cyan-400/35 bg-[#080012] p-5 text-white shadow-[0_0_45px_rgba(0,229,255,.2)] sm:p-7">
            <header className="flex items-start justify-between gap-4 border-b border-cyan-400/20 pb-4">
              <div>
                <p className="font-mono text-[10px] font-bold tracking-[.24em] text-cyan-300">
                  SOBRE O ARCADE
                </p>
                <div className="flex items-center gap-3">
                  <img
                    src="/kali-dragon.png"
                    alt="Logo do dragão"
                    className="h-12 w-12 object-contain brightness-0 invert opacity-85 drop-shadow-[0_0_9px_rgba(0,229,255,.65)]"
                  />
                  <div>
                    <h2
                      id="about-system-title"
                      className="mt-2 font-mono text-2xl font-black tracking-wide text-white"
                    >
                      MASTER GAMES ARCADE
                    </h2>
                    <p className="mt-1 font-mono text-xs text-zinc-400">
                      Seus jogos clássicos, do seu jeito.
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAboutOpen(false)}
                aria-label="Fechar sobre o sistema"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 text-zinc-300 hover:border-pink-400/60 hover:text-pink-200"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="mt-5 flex flex-col gap-5 sm:flex-row">
              <img
                src="/assets/game-loading-art-portrait.png"
                alt="Arte do Master Games Arcade"
                className="w-44 shrink-0 self-center rounded-xl border border-cyan-400/30 shadow-[0_0_25px_rgba(0,229,255,.2)] sm:w-52 sm:self-start"
              />
              <div className="grid flex-1 gap-5 font-mono text-xs leading-relaxed text-zinc-300 sm:grid-cols-2">
                <article>
                  <h3 className="font-bold tracking-wider text-cyan-200">SEU FLIPERAMA ONLINE</h3>
                  <p className="mt-2">
                    Escolha um jogo, pesquise pelo nome, marque seus favoritos e reveja as partidas
                    que você jogou recentemente. Tudo funciona direto no navegador, sem instalar
                    programas.
                  </p>
                  <p className="mt-2">
                    Para aproveitar melhor, coloque o jogo em tela cheia usando o botão próprio ou a
                    tecla F11 no computador.
                  </p>
                </article>
                <article>
                  <h3 className="font-bold tracking-wider text-pink-200">SEU PROGRESSO</h3>
                  <p className="mt-2">
                    A partida é salva automaticamente enquanto você joga e pode continuar de onde
                    parou na próxima vez.
                  </p>
                  <p className="mt-2">
                    Sem entrar na conta, o progresso fica neste navegador. Ao entrar com sua conta,
                    ele também pode ser guardado na nuvem e usado em outro aparelho.
                  </p>
                </article>
                <article>
                  <h3 className="font-bold tracking-wider text-amber-200">CONTROLES</h3>
                  <p className="mt-2">
                    Você pode jogar com o teclado, com um controle USB ou com os controles na tela
                    do celular. Basta conectar o controle antes de começar a partida.
                  </p>
                  <p className="mt-2">
                    No teclado, as setas movimentam o jogador 1. Use Z e X para os botões
                    principais, 1 para começar e 5 para colocar ficha. Para o jogador 2, use T, F, G
                    e H para movimentar, J e K para os botões, B para começar e V para colocar
                    ficha.
                  </p>
                </article>
              </div>
            </div>

            <footer className="mt-6 border-t border-pink-400/20 pt-4 text-center font-mono">
              <p className="text-[10px] tracking-[.2em] text-zinc-500">DESENVOLVIMENTO</p>
              <p className="mt-1 text-lg font-black text-pink-200">DEV EMERSON 2026</p>
              <p className="mt-1 text-[10px] text-zinc-500">Master Games Arcade · Web Edition</p>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function GameCard({
  title,
  snapUrl,
  isFavorite,
  isLaunching,
  isSelected,
  onPlay,
  onToggleFavorite,
}: {
  title: string;
  snapUrl?: string | undefined;
  isFavorite: boolean;
  isLaunching: boolean;
  isSelected: boolean;
  onPlay: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showArt = snapUrl && !imgFailed;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !isLaunching && onPlay()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !isLaunching) {
          e.preventDefault();
          onPlay();
        }
      }}
      aria-disabled={isLaunching}
      data-library-card="true"
      className={`group relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border bg-[#0a0014] text-left outline-none transition-[border-color,box-shadow] hover:border-cyan-400/70 hover:shadow-[0_0_18px_rgba(0,229,255,.25)] focus-visible:border-cyan-400 aria-disabled:pointer-events-none aria-disabled:opacity-60 ${isSelected ? "border-cyan-300 shadow-[0_0_20px_rgba(0,229,255,.45)] ring-2 ring-cyan-300/70" : "border-white/10"}`}
    >
      <span className="relative block aspect-[4/3] w-full overflow-hidden bg-linear-to-br from-[#160227] to-[#03000a]">
        {showArt ? (
          <img
            src={snapUrl}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center px-2 text-center font-mono text-[13px] font-bold uppercase tracking-wide text-cyan-500/70">
            {title.slice(0, 18)}
          </span>
        )}

        <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="h-8 w-8 fill-cyan-300 text-cyan-300 drop-shadow-[0_0_8px_rgba(0,229,255,.8)]" />
        </span>

        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-pressed={isFavorite}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/70 shadow-md backdrop-blur-sm sm:right-1.5 sm:top-1.5 sm:h-8 sm:w-8"
        >
          <Star
            className={`h-4 w-4 ${isFavorite ? "fill-yellow-400 text-yellow-400" : "text-white/85"}`}
          />
        </button>

        {isLaunching && (
          <span className="absolute inset-0 grid place-items-center bg-black/70 font-mono text-[11px] text-cyan-300">
            Abrindo...
          </span>
        )}
      </span>

      <span className="px-2 py-2 font-mono text-xs leading-snug text-zinc-200 line-clamp-2">
        {title}
      </span>
    </div>
  );
}

function LibrarySkeleton({ expanded }: { expanded: boolean }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${expanded ? "sm:grid-cols-3 xl:grid-cols-4" : ""}`}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-lg border border-white/10 bg-[#0a0014]"
        >
          <div className="aspect-[4/3] bg-white/5" />
          <div className="m-2 h-3 rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}
