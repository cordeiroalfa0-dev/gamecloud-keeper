import { useState } from "react";
import { ConnectToTv } from "@/components/ConnectToTv";

/** Botão grande, só no celular: procurar TVs do Wi-Fi e virar controle. */
export function PhoneTvButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-1/2 z-[90] -translate-x-1/2 rounded-full border-2 border-emerald-300 bg-emerald-500/90 px-6 py-4 font-mono text-lg font-bold text-black shadow-[0_0_24px_rgba(52,211,153,.6)] active:scale-95 md:hidden"
      >
        📺 Jogar na TV
      </button>
      {open && (
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/90 p-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mb-3 ml-auto block rounded-full border border-white/30 px-4 py-2 font-mono text-zinc-200"
          >
            ✕ Fechar
          </button>
          <ConnectToTv />
        </div>
      )}
    </>
  );
}
