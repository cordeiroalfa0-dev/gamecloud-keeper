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

      <button
        type="button"
        onClick={searchTvs}
        disabled={!supported || searching}
        className="mt-3 min-h-14 w-full rounded-xl border border-emerald-300/70 bg-emerald-400/20 px-4 py-4 text-lg font-bold text-emerald-50 active:scale-[0.98] disabled:opacity-50"
      >
        {searching
          ? "Procurando…"
          : supported
            ? "🔍 Procurar TVs no Wi-Fi"
            : "Abra no Chrome do Android para procurar TVs"}
      </button>
      {status && <p className="mt-2 text-emerald-200">{status}</p>}
      <p className="mt-2 text-xs text-zinc-400">
        Encontra TVs com Chromecast, Google TV, Android TV e TV Stick Mi. O jogo abre na TV e o
        celular vira o controle — não espelha a tela.
      </p>

      <details className="mt-4 rounded-lg bg-black/30 p-3">
        <summary className="cursor-pointer text-emerald-200">
          A TV não apareceu? Faça pelo navegador da TV
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-zinc-300">
          <li>Na TV, abra o navegador (no Stick, dá para usar o app Google TV → Controle remoto).</li>
          <li>Digite o endereço abaixo.</li>
          <li>Leia o QR que aparecer na TV com a câmera do celular.</li>
        </ol>
        <p className="mt-3 select-all break-all rounded-lg bg-black/40 px-2 py-2 text-center font-bold text-cyan-200">
          {TV_MODE_URL}
        </p>
      </details>
    </section>
  );
}
