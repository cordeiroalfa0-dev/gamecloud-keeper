import { useEffect, useState } from "react";

const PUBLIC_ORIGIN = "https://gamecloud-keeper.lovable.app";
const ROOM_STORAGE_KEY = "mga-remote-room-v1";

const makeRoom = () => `MGA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

type PresentationRequestCtor = new (urls: string[]) => {
  start: () => Promise<unknown>;
  getAvailability?: () => Promise<{ value: boolean; onchange: (() => void) | null }>;
};

/**
 * Celular → TV. Chromecast/Google TV: usa a Presentation API do Chrome, que
 * lista as TVs do mesmo Wi-Fi e abre o Modo TV nela com uma sala nova; o
 * celular vira o controle dessa sala. Outras TVs: endereço curto + QR Code.
 */
export function ConnectToTv() {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "PresentationRequest" in window);
  }, []);

  const castToTv = async () => {
    const Ctor = (window as unknown as { PresentationRequest?: PresentationRequestCtor })
      .PresentationRequest;
    if (!Ctor) return;
    const room = makeRoom();
    const tvUrl = `${PUBLIC_ORIGIN}/?launcher=1&tv=1&room=${room}`;
    setStatus("Procurando TVs no Wi-Fi…");
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
          ? "Nenhuma TV com Chromecast encontrada neste Wi-Fi. Use o jeito 2 abaixo."
          : name === "AbortError"
            ? ""
            : "Não foi possível conectar. Use o jeito 2 abaixo.",
      );
    }
  };

  return (
    <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 font-mono text-xs text-emerald-50">
      <b className="text-sm text-emerald-200">📺 CONECTAR NA TV</b>
      <p className="mt-2 text-zinc-300">
        <b>1. TV com Chromecast / Google TV / Android TV</b> (celular no mesmo Wi-Fi, pelo Chrome):
      </p>
      <button
        type="button"
        onClick={castToTv}
        disabled={!supported}
        className="mt-2 w-full rounded-xl border border-emerald-300/70 bg-emerald-400/20 px-4 py-3 text-base font-bold text-emerald-50 disabled:opacity-50"
      >
        {supported ? "Procurar TVs no Wi-Fi" : "Abra no Chrome do Android para procurar TVs"}
      </button>
      {status && <p className="mt-2 text-emerald-200">{status}</p>}
      <p className="mt-3 text-zinc-300">
        <b>2. Qualquer outra Smart TV</b>: abra o navegador da TV e digite
      </p>
      <p className="mt-1 select-all rounded-lg bg-black/40 px-2 py-2 text-center text-sm font-bold text-cyan-200">
        gamecloud-keeper.lovable.app/tv
      </p>
      <p className="mt-1 text-zinc-400">
        A TV mostra o QR Code — leia com a câmera do celular e ele vira o controle.
      </p>
    </div>
  );
}
