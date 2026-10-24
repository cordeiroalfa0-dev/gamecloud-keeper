import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { supabase } from "@/integrations/supabase/client";
import { ConnectToTv } from "@/components/ConnectToTv";

type RemotePayload = { room: string; player: number; input: number; pressed: boolean };
type RemoteCommand = {
  room: string;
  command:
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
  ok?: boolean;
  romName?: string;
};

const ROOM_STORAGE_KEY = "mga-remote-room-v1";
// SSR usa o domínio publicado como fallback; no navegador o QR acompanha o host atual.
const PUBLIC_APP_ORIGIN = "https://gamecloud-keeper.lovable.app";
let gamePlayerReady = false;
let gamePlayerLaunching = false;
let gamePlayerBridgeReady = false;
let queuedFullscreenToggle = false;
let pendingRemoteInputs: RemotePayload[] = [];
const makeRoom = () => `MGA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const readStoredRoom = () => {
  if (typeof window === "undefined") return "";
  try {
    const storedRoom = localStorage.getItem(ROOM_STORAGE_KEY)?.trim().toUpperCase() || "";
    return /^MGA-[A-Z0-9]{4}$/.test(storedRoom) ? storedRoom : "";
  } catch {
    return "";
  }
};
const storeRoom = (value: string) => {
  try {
    if (value) localStorage.setItem(ROOM_STORAGE_KEY, value);
    else localStorage.removeItem(ROOM_STORAGE_KEY);
  } catch {
    // Armazenamento pode estar bloqueado no modo privado.
  }
};
const relayInputToGame = (input: Partial<RemotePayload>) => {
  const frame = document.querySelector<HTMLIFrameElement>("#mga-web-player-area iframe");
  const normalized: RemotePayload = {
    room: String(input.room || ""),
    player: Number(input.player),
    input: Number(input.input),
    pressed: Boolean(input.pressed),
  };
  if (!gamePlayerBridgeReady || !frame?.contentWindow) {
    const hasQueuedPress = pendingRemoteInputs.some(
      (entry) =>
        entry.player === normalized.player && entry.input === normalized.input && entry.pressed,
    );
    if (normalized.pressed || hasQueuedPress) {
      if (pendingRemoteInputs.length >= 128) pendingRemoteInputs.shift();
      pendingRemoteInputs.push(normalized);
    }
    window.dispatchEvent(new CustomEvent("mga-remote-input", { detail: input }));
    return;
  }
  const message = {
    type: "mga-remote-input",
    player: normalized.player,
    input: normalized.input,
    pressed: normalized.pressed,
  };

  // O emulador roda em um iframe e não recebe eventos disparados na janela
  // do launcher. O postMessage é o canal usado pelo player.html para injetar
  // a entrada no GameManager do EmulatorJS.
  frame?.contentWindow?.postMessage(message, window.location.origin);

  // Mantém o evento para integrações locais que ainda consumam esse contrato.
  window.dispatchEvent(new CustomEvent("mga-remote-input", { detail: input }));
};
const releaseRemotePlayer = (player: number) => {
  for (let input = 0; input <= 9; input += 1) {
    relayInputToGame({ player, input, pressed: false });
  }
};
const relayCommandToGame = (command: Partial<RemoteCommand>) => {
  if (command.command?.startsWith("library-")) {
    window.dispatchEvent(
      new CustomEvent("mga-remote-library-command", { detail: { command: command.command } }),
    );
    return;
  }
  if (command.command === "launch-game") {
    if (typeof command.romName === "string" && /\.(zip|7z|chd)$/i.test(command.romName)) {
      window.dispatchEvent(
        new CustomEvent("mga-remote-launch-game", { detail: { rom: command.romName } }),
      );
    }
    return;
  }
  if (command.command === "return-home") {
    window.dispatchEvent(
      new CustomEvent("mga-remote-library-command", { detail: { command: "library-home" } }),
    );
    if (!gamePlayerReady && !gamePlayerLaunching) return;
    if (!gamePlayerReady) {
      window.dispatchEvent(new Event("mga-remote-close-player"));
      return;
    }
    const frame = document.querySelector<HTMLIFrameElement>("#mga-web-player-area iframe");
    if (!frame?.contentWindow) {
      window.dispatchEvent(new Event("mga-remote-close-player"));
      return;
    }
    frame.contentWindow.postMessage(
      { type: "mga-remote-command", command: "save-and-exit" },
      window.location.origin,
    );
    return;
  }
  if (
    command.command !== "toggle-pause" &&
    command.command !== "save-and-exit" &&
    command.command !== "toggle-game-fullscreen"
  )
    return;
  if (command.command === "save-and-exit" && !gamePlayerReady) {
    window.dispatchEvent(new Event("mga-remote-close-player"));
    return;
  }
  const frame = document.querySelector<HTMLIFrameElement>("#mga-web-player-area iframe");
  if (command.command === "toggle-game-fullscreen" && !gamePlayerReady) {
    queuedFullscreenToggle = true;
    return;
  }
  frame?.contentWindow?.postMessage(
    { type: "mga-remote-command", command: command.command },
    window.location.origin,
  );
};

const controllerUrl = (room: string, player: number, tvMode: boolean) => {
  const origin = typeof window === "undefined" ? PUBLIC_APP_ORIGIN : window.location.origin;
  const url = new URL("/controller", origin);
  const params = new URLSearchParams({ controller: "1", room, player: String(player) });
  if (tvMode) params.set("tv", "1");
  url.search = params.toString();
  return url.toString();
};

export function RemoteControlHub({ autoOpen = false }: { autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState("");
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [players, setPlayers] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace" || e.key === "GoBack" || e.key === "XF86Back") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!room) return;
    const channel = supabase.channel(`mga-remote-${room}`, {
      config: { private: false, broadcast: { ack: false } },
    });
    let timer: number | undefined;
    let staleTimer: number | undefined;
    let queuedLaunchResult: boolean | null = null;
    const onPlayerLoading = () => {
      gamePlayerReady = false;
      gamePlayerLaunching = true;
      gamePlayerBridgeReady = false;
      pendingRemoteInputs = [];
      queuedLaunchResult = null;
      broadcastLaunchResult(true);
    };
    const broadcastLaunchResult = (ok: boolean) => {
      void channel.send({
        type: "broadcast",
        event: "command",
        payload: { room, command: "library-launch-result", ok },
      });
    };
    const onPlayerReady = () => {
      gamePlayerReady = true;
      gamePlayerLaunching = false;
      gamePlayerBridgeReady = true;
      for (const input of pendingRemoteInputs.splice(0)) relayInputToGame(input);
      broadcastLaunchResult(true);
      queuedLaunchResult = null;
      if (!queuedFullscreenToggle) return;
      queuedFullscreenToggle = false;
      relayCommandToGame({ command: "toggle-game-fullscreen" });
    };
    const onPlayerFaulted = () => {
      gamePlayerReady = false;
      gamePlayerLaunching = true;
      queuedFullscreenToggle = false;
      broadcastLaunchResult(true);
    };
    const onPlayerBridgeReady = () => {
      gamePlayerBridgeReady = true;
      for (const input of pendingRemoteInputs.splice(0)) relayInputToGame(input);
    };
    window.addEventListener("mga-player-loading", onPlayerLoading);
    window.addEventListener("mga-player-ready", onPlayerReady);
    window.addEventListener("mga-player-faulted", onPlayerFaulted);
    window.addEventListener("mga-player-bridge-ready", onPlayerBridgeReady);
    const onLaunchResult = (event: Event) => {
      const ok = Boolean((event as CustomEvent<{ ok?: unknown }>).detail?.ok);
      broadcastLaunchResult(ok);
      if (ok) {
        gamePlayerLaunching = true;
        queuedLaunchResult = true;
      } else {
        gamePlayerReady = false;
        gamePlayerLaunching = false;
        gamePlayerBridgeReady = false;
        queuedFullscreenToggle = false;
        pendingRemoteInputs = [];
        queuedLaunchResult = null;
      }
    };
    window.addEventListener("mga-remote-game-launch-result", onLaunchResult);
    const lastSeen = new Map<number, number>();
    const markPlayerSeen = (player: number) => {
      if (player !== 1 && player !== 2) return;
      const isNewConnection = !lastSeen.has(player);
      lastSeen.set(player, Date.now());
      // Muitos eventos chegam por segundo enquanto o jogador toca nos botões.
      // Só redesenha a biblioteca quando o estado de conexão realmente muda.
      setPlayers((current) => (current[player] ? current : { ...current, [player]: true }));
      // Fecha a janela do QR Code assim que um celular se conecta.
      if (isNewConnection) setOpen(false);
    };
    channel
      .on("broadcast", { event: "controller-ready" }, ({ payload }) => {
        if (payload?.room !== room) return;
        const player = Number(payload?.player);
        markPlayerSeen(player);
        broadcastLaunchResult(gamePlayerReady || gamePlayerLaunching);
      })
      .on("broadcast", { event: "input" }, ({ payload }) => {
        const input = payload as Partial<RemotePayload>;
        if (input.room !== room) return;
        relayInputToGame(input);
        const player = Number(input.player);
        markPlayerSeen(player);
      })
      .on("broadcast", { event: "command" }, ({ payload }) => {
        const command = payload as Partial<RemoteCommand>;
        if (command.room !== room) return;
        relayCommandToGame(command);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          const ping = () =>
            void channel.send({
              type: "broadcast",
              event: "room-ping",
              payload: { room, sentAt: Date.now() },
            });
          ping();
          timer = window.setInterval(ping, 2500);
          staleTimer = window.setInterval(() => {
            const now = Date.now();
            for (const player of [1, 2]) {
              const seenAt = lastSeen.get(player);
              if (seenAt && now - seenAt > 7000) {
                releaseRemotePlayer(player);
                lastSeen.delete(player);
                setPlayers((current) =>
                  current[player] ? { ...current, [player]: false } : current,
                );
              }
            }
          }, 1000);
        }
      });
    return () => {
      if (timer) window.clearInterval(timer);
      if (staleTimer) window.clearInterval(staleTimer);
      for (const player of [1, 2]) releaseRemotePlayer(player);
      window.removeEventListener("mga-player-loading", onPlayerLoading);
      window.removeEventListener("mga-player-ready", onPlayerReady);
      window.removeEventListener("mga-player-faulted", onPlayerFaulted);
      window.removeEventListener("mga-player-bridge-ready", onPlayerBridgeReady);
      window.removeEventListener("mga-remote-game-launch-result", onLaunchResult);
      void supabase.removeChannel(channel);
    };
  }, [room]);

  const links = useMemo(
    () => ({
      p1: room ? controllerUrl(room, 1, autoOpen) : "",
      p2: room ? controllerUrl(room, 2, autoOpen) : "",
    }),
    [autoOpen, room],
  );
  const create = (showDialog = true) => {
    const savedRoom = readStoredRoom();
    const nextRoom = savedRoom || makeRoom();
    storeRoom(nextRoom);
    setRoom(nextRoom);
    setPlayers({});
    setOpen(showDialog);
  };
  useEffect(() => {
    // Recupera uma sala se o link já trouxer um código válido.
    const urlRoom = (new URLSearchParams(window.location.search).get("room") || "").toUpperCase();
    if (/^MGA-[A-Z0-9]{4}$/.test(urlRoom)) storeRoom(urlRoom);
    const savedRoom = readStoredRoom();
    if (savedRoom) setRoom(savedRoom);
    setRoomLoaded(true);
  }, []);

  useEffect(() => {
    if (!autoOpen || !roomLoaded) return;
    const handheldViewport = window.matchMedia("(pointer: coarse) and (max-width: 1024px)").matches;
    const showDialog = !handheldViewport;
    if (room) setOpen(showDialog);
    else create(showDialog);
  }, [autoOpen, roomLoaded, room]);
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      // O navegador pode bloquear o clipboard fora de um gesto permitido.
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => create(true)}
        className="flex items-center justify-center gap-1.5 rounded-full border border-pink-400/40 px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide text-pink-200 transition-colors hover:border-pink-300 hover:bg-pink-400/10"
        title="Abrir QR Code para usar o celular como controle"
      >
        QR CONTROLE
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`${autoOpen ? "mga-tv-control-overlay" : ""} pointer-events-auto fixed inset-0 z-[9999] grid place-items-center overflow-y-auto bg-black/90 p-4 backdrop-blur-sm`}
            >
              <section
                className={`${autoOpen ? "mga-tv-control-dialog" : ""} my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-pink-400/40 bg-[#080012] p-5 text-white shadow-[0_0_40px_rgba(255,43,109,.25)]`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-mono text-lg font-bold text-pink-200">
                      CONTROLES POR CELULAR
                    </h2>
                    <p className="mt-1 font-mono text-xs text-zinc-400">
                      {autoOpen
                        ? "O jogo roda nesta TV. Leia um QR Code com o celular para controlá-lo."
                        : "Abra um link em cada celular para usar os controles nesta tela."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-xl text-zinc-400"
                  >
                    ✕
                  </button>
                </div>
                <div
                  className={`${autoOpen ? "mga-tv-control-players" : ""} mt-5 grid grid-cols-2 gap-3`}
                >
                  <div className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-3 text-center font-mono text-xs">
                    <b className="text-cyan-200">JOGADOR 1</b>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(links.p1)}`}
                      alt="QR Code do controle do jogador 1"
                      className="mx-auto my-3 h-32 w-32 rounded-lg bg-white p-1 sm:h-40 sm:w-40"
                      loading="eager"
                    />
                    <div className="text-zinc-400">
                      {players[1] ? "● conectado" : "○ aguardando leitura"}
                    </div>
                    <button
                      type="button"
                      onClick={() => copy(links.p1, "P1")}
                      className="mt-3 w-full rounded-lg border border-cyan-300/50 px-2 py-2 text-cyan-200"
                    >
                      {copied === "P1" ? "Copiado" : "Copiar link P1"}
                    </button>
                  </div>
                  <div className="rounded-xl border border-pink-400/40 bg-pink-400/10 p-3 text-center font-mono text-xs">
                    <b className="text-pink-200">JOGADOR 2</b>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(links.p2)}`}
                      alt="QR Code do controle do jogador 2"
                      className="mx-auto my-3 h-32 w-32 rounded-lg bg-white p-1 sm:h-40 sm:w-40"
                      loading="eager"
                    />
                    <div className="text-zinc-400">
                      {players[2] ? "● conectado" : "○ aguardando leitura"}
                    </div>
                    <button
                      type="button"
                      onClick={() => copy(links.p2, "P2")}
                      className="mt-3 w-full rounded-lg border border-pink-300/50 px-2 py-2 text-pink-200"
                    >
                      {copied === "P2" ? "Copiado" : "Copiar link P2"}
                    </button>
                  </div>
                </div>
                <div className={`${autoOpen ? "mga-tv-control-setup" : ""} mt-4`}>
                  <ConnectToTv />
                </div>
                <div
                  className={`${autoOpen ? "mga-tv-control-room" : ""} mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-center font-mono text-xs`}
                >
                  <div className="text-zinc-400">Código da sala</div>
                  <strong className="text-3xl tracking-[.3em] text-white">{room}</strong>
                  <div className="mt-2 text-[10px] text-zinc-500">
                    Envie o link correspondente para cada celular.
                  </div>
                </div>
                <div
                  className={`${autoOpen ? "mga-tv-control-help" : ""} mt-4 grid grid-cols-2 gap-2`}
                >
                  <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-center font-mono text-[10px] text-amber-100">
                    <b className="block text-amber-200">COMANDOS NO CELULAR</b>
                    <span>Direcional navega, JANELA abre/fecha e ENTER escolhe</span>
                  </div>
                  <div className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-center font-mono text-[10px] text-cyan-100">
                    <b className="block text-cyan-200">P1 + P2</b>
                    <span>Os dois celulares controlam o mesmo jogo</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRoom("");
                    storeRoom("");
                    setPlayers({});
                  }}
                  className={`${autoOpen ? "mga-tv-control-close" : ""} mt-4 w-full rounded-lg border border-white/15 px-3 py-2 font-mono text-xs text-zinc-300 hover:border-pink-300/50`}
                >
                  Encerrar controles
                </button>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
