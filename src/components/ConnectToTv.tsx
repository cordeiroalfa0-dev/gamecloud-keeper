import { useEffect, useState } from "react";

const PUBLIC_ORIGIN = "https://gamecloud-keeper.lovable.app";
const TV_MODE_URL = `${PUBLIC_ORIGIN}/tv`;
const ROOM_STORAGE_KEY = "mga-remote-room-v1";

const makeRoom = () => `MGA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

type PresentationRequestCtor = new (urls: string[]) => {
  start: () => Promise<unknown>;
};

/**
 * Celular → TV (pensado para o celular).
 * 1) Chrome do Android: Presentation API lista as TVs com Chromecast/Google TV
 *    do mesmo Wi-Fi e abre o Modo TV nela (o jogo roda na TV, sem espelhar).
 * 2) Sem suporte (iPhone, outros navegadores, TV sem Chromecast): passo a passo
 *    abrindo o endereço no navegador da TV e lendo o QR.
 */
type TvItem = { room: string; label: string };

export function ConnectToTv() {
  const [supported, setSupported] = useState(false);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState("");
  const [tvs, setTvs] = useState<TvItem[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const scanWifi = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/public/tv-presence", { cache: "no-store" });
      const data = (await res.json()) as { tvs?: TvItem[] };
      setTvs(data.tvs ?? []);
    } catch {
      setTvs([]);
    } finally {
      setScanning(false);
    }
  };

  const pickTv = (room: string) => {
    try {
      localStorage.setItem(ROOM_STORAGE_KEY, room);
    } catch {
      // modo privado
    }
    window.location.href = `/controller?controller=1&room=${room}&player=1`;
  };

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "PresentationRequest" in window);
    void scanWifi();
    const t = setInterval(scanWifi, 5000);
    return () => clearInterval(t);
  }, []);

  const searchTvs = async () => {
    const Ctor = (window as unknown as { PresentationRequest?: PresentationRequestCtor })
      .PresentationRequest;
    if (!Ctor) return;
    const room = makeRoom();
    const tvUrl = `${PUBLIC_ORIGIN}/?launcher=1&tv=1&room=${room}`;
    setSearching(true);
    setStatus("Procurando TVs neste Wi-Fi… escolha a TV na lista que vai aparecer.");
    try {
      await new Ctor([tvUrl]).start();
      try {
        localStorage.setItem(ROOM_STORAGE_KEY, room);
      } catch {
        // modo privado
      }
      setStatus("TV conectada! Abrindo o controle…");
      window.location.href = `/controller?controller=1&room=${room}&player=1`;
    } catch (error) {
      const name = (error as { name?: string })?.name;
      setStatus(
        name === "NotFoundError"
          ? "Nenhuma TV com Chromecast/Google TV encontrada neste Wi-Fi. Use o passo a passo abaixo."
          : name === "AbortError"
            ? ""
            : "Não foi possível conectar. Use o passo a passo abaixo.",
      );
    } finally {
      setSearching(false);
    }
  };

  return (
    <section className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-4 font-mono text-sm text-emerald-50">
      <b className="text-base text-emerald-200">📺 JOGAR NA TV</b>
      <p className="mt-2 text-zinc-300">
        Conecte o celular no <b>mesmo Wi-Fi</b> da TV (ex.: o Wi-Fi da casa do seu amigo).
      </p>

      <div className="mt-3 rounded-lg bg-black/30 p-3">
        <b className="text-emerald-200">TVs neste Wi-Fi</b>
        {tvs && tvs.length > 0 ? (
          <div className="mt-2 space-y-2">
            {tvs.map((tv) => (
              <button
                key={tv.room}
                type="button"
                onClick={() => pickTv(tv.room)}
                className="min-h-14 w-full rounded-xl border border-emerald-300/70 bg-emerald-400/25 px-4 py-3 text-left text-lg font-bold text-emerald-50 active:scale-[0.98]"
              >
                📺 {tv.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-300">
            {scanning && !tvs ? "Procurando…" : "Nenhuma TV ligada ainda. Procurando a cada 5 segundos…"}
          </p>
        )}
        <p className="mt-3 text-xs text-zinc-400">
          Na TV, abra o navegador uma vez neste endereço — ela aparece aqui sozinha, sem QR:
        </p>
        <p className="mt-1 select-all break-all rounded-lg bg-black/40 px-2 py-2 text-center font-bold text-cyan-200">
          {TV_MODE_URL}
        </p>
      </div>

      <details className="mt-4 rounded-lg bg-black/30 p-3">
        <summary className="cursor-pointer text-emerald-200">Outro jeito: Chromecast</summary>
        <button
          type="button"
          onClick={searchTvs}
          disabled={!supported || searching}
          className="mt-3 min-h-12 w-full rounded-xl border border-emerald-300/50 px-4 py-3 font-bold text-emerald-50 disabled:opacity-50"
        >
          {searching ? "Procurando…" : supported ? "🔍 Procurar Chromecast" : "Só no Chrome do Android"}
        </button>
        {status && <p className="mt-2 text-emerald-200">{status}</p>}
      </details>
    </section>
  );
}
