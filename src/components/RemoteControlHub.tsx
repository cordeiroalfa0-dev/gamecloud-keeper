import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

type RemotePayload = { room: string; player: number; input: number; pressed: boolean };
type RemoteCommand = {
  room: string;
  command: "toggle-pause" | "save-and-exit" | "toggle-game-fullscreen" | "launch-game";
  romName?: string;
};

const ROOM_STORAGE_KEY = "mga-remote-room-v1";
// QR Codes precisam usar o domínio publicado. O endereço do editor/preview
// do Lovable exige acesso ao projeto e gera "acesso negado" no celular.
const PUBLIC_APP_URL = "https://save-my-games.lovable.app/controller";
let gamePlayerReady = false;
let queuedFullscreenToggle = false;
const makeRoom = () => `MGA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const readStoredRoom = () => {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(ROOM_STORAGE_KEY) || "";
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
  const message = {
    type: "mga-remote-input",
    player: Number(input.player),
    input: Number(input.input),
    pressed: Boolean(input.pressed),
  };

  // O emulador roda em um iframe e não recebe eventos disparados na janela
  // do launcher. O postMessage é o canal usado pelo player.html para injetar
  // a entrada no GameManager do EmulatorJS.
  const frame = document.querySelector<HTMLIFrameElement>("#mga-web-player-area iframe");
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
  if (command.command === "launch-game") {
    if (typeof command.romName === "string" && /\.(zip|7z|chd)$/i.test(command.romName)) {
      window.dispatchEvent(
        new CustomEvent("mga-remote-launch-game", { detail: { rom: command.romName } }),
      );
    }
    return;
  }
  if (
    command.command !== "toggle-pause" &&
    command.command !== "save-and-exit" &&
    command.command !== "toggle-game-fullscreen"
  )
    return;
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

const controllerUrl = (room: string, player: number) => {
  const url = new URL(PUBLIC_APP_URL);
  url.search = new URLSearchParams({ controller: "1", room, player: String(player) }).toString();
  return url.toString();
};

export function RemoteControlHub({ autoOpen = false }: { autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState("");
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [players, setPlayers] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!room) return;
    const channel = supabase.channel(`mga-remote-${room}`, {
      config: { private: false, broadcast: { ack: false } },
    });
    let timer: number | undefined;
    let staleTimer: number | undefined;
    const onPlayerLoading = () => {
      gamePlayerReady = false;
    };
    const onPlayerReady = () => {
      gamePlayerReady = true;
      if (!queuedFullscreenToggle) return;
      queuedFullscreenToggle = false;
      relayCommandToGame({ command: "toggle-game-fullscreen" });
    };
    window.addEventListener("mga-player-loading", onPlayerLoading);
    window.addEventListener("mga-player-ready", onPlayerReady);
    const lastSeen = new Map<number, number>();
    const markPlayerSeen = (player: number) => {
      if (player !== 1 && player !== 2) return;
      lastSeen.set(player, Date.now());
      setPlayers((current) => ({ ...current, [player]: true }));
    };
    channel
      .on("broadcast", { event: "controller-ready" }, ({ payload }) => {
        const player = Number(payload?.player);
        markPlayerSeen(player);
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
                setPlayers((current) => ({ ...current, [player]: false }));
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
      void supabase.removeChannel(channel);
    };
  }, [room]);

  const links = useMemo(
    () => ({ p1: room ? controllerUrl(room, 1) : "", p2: room ? controllerUrl(room, 2) : "" }),
    [room],
  );
  const create = () => {
    const savedRoom = readStoredRoom();
    const nextRoom = savedRoom || makeRoom();
    storeRoom(nextRoom);
    setRoom(nextRoom);
    setPlayers({});
    setOpen(true);
  };
  useEffect(() => {
    const savedRoom = readStoredRoom();
    if (savedRoom) setRoom(savedRoom);
    setRoomLoaded(true);
  }, []);

  useEffect(() => {
    if (!autoOpen || !roomLoaded) return;
    if (room) setOpen(true);
    else create();
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
        onClick={create}
        className="flex items-center justify-center gap-1.5 rounded-full border border-pink-400/40 px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide text-pink-200 transition-colors hover:border-pink-300 hover:bg-pink-400/10"
        title="Usar celulares como controles"
      >
        📱 Celulares
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-2xl border border-pink-400/40 bg-[#080012] p-5 text-white shadow-[0_0_40px_rgba(255,43,109,.25)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-mono text-lg font-bold text-pink-200">CONTROLES POR CELULAR</h2>
                <p className="mt-1 font-mono text-xs text-zinc-400">
                  Abra um link em cada celular. O jogo continua no PC.
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
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-3 text-center font-mono text-xs">
                <b className="text-cyan-200">JOGADOR 1</b>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(links.p1)}`}
                  alt="QR Code do controle do jogador 1"
                  className="mx-auto my-3 h-32 w-32 rounded-lg bg-white p-1"
                  loading="lazy"
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
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(links.p2)}`}
                  alt="QR Code do controle do jogador 2"
                  className="mx-auto my-3 h-32 w-32 rounded-lg bg-white p-1"
                  loading="lazy"
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
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-center font-mono text-xs">
              <div className="text-zinc-400">Código da sala</div>
              <strong className="text-3xl tracking-[.3em] text-white">{room}</strong>
              <div className="mt-2 text-[10px] text-zinc-500">
                Envie o link correspondente para cada celular.
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-center font-mono text-[10px] text-amber-100">
                <b className="block text-amber-200">COMANDOS NO CELULAR</b>
                <span>Pause, salvar e voltar à biblioteca</span>
              </div>
              <div className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-center font-mono text-[10px] text-cyan-100">
                <b className="block text-cyan-200">P1 + P2</b>
                <span>Os dois celulares controlam o mesmo jogo</span>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 font-mono text-xs text-amber-100">
              <strong className="block text-amber-200">TV STICK MI · TRANSMITIR A ABA</strong>
              <p className="mt-1 leading-relaxed text-amber-100/80">
                No Chrome do computador, abra{" "}
                <b>⋮ → Transmitir, salvar e compartilhar → Transmitir</b>, escolha seu TV Stick e
                selecione <b>Transmitir guia</b>. Depois coloque o jogo em tela cheia. O jogo
                continua rodando no computador; a TV mostra a imagem e os celulares continuam sendo
                os controles.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRoom("");
                storeRoom("");
                setPlayers({});
              }}
              className="mt-4 w-full rounded-lg border border-white/15 px-3 py-2 font-mono text-xs text-zinc-300 hover:border-pink-300/50"
            >
              Encerrar controles
            </button>
          </section>
        </div>
      )}
    </>
  );
}
