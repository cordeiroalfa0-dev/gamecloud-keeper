import { useEffect, useState } from "react";
import { Cast } from "lucide-react";

type CastContext = {
  setOptions: (options: { receiverApplicationId: string; autoJoinPolicy: string }) => void;
  requestSession: () => Promise<unknown>;
};

type CastFramework = {
  CastContext: { getInstance: () => CastContext };
};

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    cast?: { framework: CastFramework };
    chrome?: { cast?: { AutoJoinPolicy?: { ORIGIN_SCOPED: string } } };
  }
}

const RECEIVER_APP_ID = import.meta.env["VITE_GOOGLE_CAST_APP_ID"]?.trim() ?? "";
const CAST_SDK_URL = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
let castSdkPromise: Promise<boolean> | null = null;

function loadCastSdk() {
  if (window.cast?.framework?.CastContext) return Promise.resolve(true);
  if (castSdkPromise) return castSdkPromise;

  castSdkPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      resolve(available);
    };

    window.__onGCastApiAvailable = (isAvailable) => finish(isAvailable);
    const existingScript = document.querySelector<HTMLScriptElement>(
      "script[data-mga-google-cast]",
    );
    if (existingScript) {
      existingScript.addEventListener("load", () => finish(Boolean(window.cast?.framework)), {
        once: true,
      });
      existingScript.addEventListener("error", () => finish(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = CAST_SDK_URL;
    script.async = true;
    script.dataset["mgaGoogleCast"] = "true";
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });

  return castSdkPromise;
}

export function CastToTvButton() {
  const [sdkReady, setSdkReady] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!RECEIVER_APP_ID) return;
    let active = true;

    void loadCastSdk().then((available) => {
      if (!active) return;
      if (!available || !window.cast?.framework?.CastContext) {
        setMessage(
          "Google Cast não ficou disponível neste navegador. Abra o sistema no Chrome para Android e tente novamente.",
        );
        return;
      }
      const context = window.cast.framework.CastContext.getInstance();
      context.setOptions({
        receiverApplicationId: RECEIVER_APP_ID,
        autoJoinPolicy: window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED ?? "ORIGIN_SCOPED",
      });
      setSdkReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  const connectToTv = async () => {
    if (!RECEIVER_APP_ID) {
      setMessage("O Google Cast ainda precisa ser configurado para esta aplicação.");
      return;
    }
    if (!sdkReady || !window.cast?.framework?.CastContext) {
      setMessage(
        "Google Cast indisponível neste navegador. Tente abrir o sistema no Chrome para Android.",
      );
      return;
    }

    setBusy(true);
    setMessage("Escolha a TV na lista de dispositivos Google Cast.");
    try {
      await window.cast.framework.CastContext.getInstance().requestSession();
      setMessage(
        "TV conectada. Quando o QR aparecer na TV, leia-o com o telemóvel para abrir os controles.",
      );
    } catch (error) {
      const text = error instanceof Error ? error.message.toLowerCase() : "";
      setMessage(
        text.includes("cancel")
          ? "Seleção cancelada."
          : "Não foi possível iniciar a transmissão. Verifique a rede Wi-Fi e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => void connectToTv()}
        disabled={busy}
        aria-label="Transmitir o sistema para uma TV Google Cast"
        title={
          !RECEIVER_APP_ID
            ? "O Google Cast precisa ser configurado"
            : sdkReady
              ? "Transmitir para uma TV Google Cast"
              : "A carregar o Google Cast"
        }
        className="flex items-center justify-center gap-1.5 rounded-full border border-emerald-400/40 px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide text-emerald-200 transition-colors hover:border-emerald-300 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <Cast className="h-3.5 w-3.5" />
        <span>
          {busy ? "A ligar…" : RECEIVER_APP_ID && !sdkReady ? "A carregar…" : "Transmitir"}
        </span>
      </button>
      {message && (
        <p
          role="status"
          className="max-w-56 text-center font-mono text-[9px] leading-tight text-emerald-100/80"
        >
          {message}
        </p>
      )}
    </div>
  );
}
