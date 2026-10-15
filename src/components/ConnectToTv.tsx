const TV_MODE_URL = "https://gamecloud-keeper.lovable.app/tv";

export function ConnectToTv() {
  return (
    <section className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-4 font-mono text-sm text-emerald-50">
      <b className="text-base text-emerald-200">📺 JOGAR NA TV</b>
      <p className="mt-2 text-zinc-300">
        Abra este endereço no navegador da própria TV. No Mi TV Stick, você pode usar o controle
        físico ou o app Google TV para navegar e digitar o endereço.
      </p>
      <p className="mt-3 select-all break-all rounded-lg bg-black/40 px-3 py-3 text-center text-base font-bold text-cyan-200">
        {TV_MODE_URL}
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-zinc-300">
        <li>Na primeira vez, salve a página nos favoritos do navegador da TV.</li>
        <li>A tela da TV exibirá o QR Code do controle.</li>
        <li>Leia o QR Code com a câmera do celular e abra o controle no navegador.</li>
      </ol>
      <p className="mt-3 text-xs text-zinc-400">
        O jogo roda na TV; o celular funciona como controle. Os dois aparelhos precisam de internet.
      </p>
    </section>
  );
}
