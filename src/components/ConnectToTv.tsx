const TV_MODE_URL = "https://gamecloud-keeper.lovable.app/tv";

/**
 * Fluxo sem espelhamento: o jogo roda no navegador da TV; o celular abre o
 * navegador do Stick usando o controle remoto Google TV e depois lê o QR.
 */
export function ConnectToTv() {
  return (
    <section className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 font-mono text-xs text-emerald-50">
      <b className="text-sm text-emerald-200">📺 ABRIR NO TV STICK MI — SEM ESPELHAR O CELULAR</b>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-zinc-300">
        <li>Conecte o celular e o TV Stick Mi à mesma rede Wi-Fi.</li>
        <li>
          No Android, abra o app <b>Google TV</b> → <b>Controle remoto</b>, selecione o Stick e
          pareie com o código que aparece na TV.
        </li>
        <li>
          Pelo controle do celular, abra um navegador na TV e digite o endereço abaixo. Na primeira
          vez, salve-o nos favoritos do navegador.
        </li>
        <li>
          Quando o QR aparecer na TV, leia-o com a câmera do celular e abra o controle. O jogo roda
          no Stick; o celular envia os comandos.
        </li>
      </ol>
      <p className="mt-3 select-all break-all rounded-lg bg-black/40 px-2 py-2 text-center text-sm font-bold text-cyan-200">
        {TV_MODE_URL}
      </p>
      <p className="mt-2 text-zinc-400">
        A busca direta de TVs pelo botão do site não está configurada nesta versão. Não use
        “Transmitir tela”: isso espelharia o celular.
      </p>
      <p className="mt-2 text-zinc-400">
        Em outras Smart TVs com navegador, abra o mesmo endereço na própria TV e leia o QR que ela
        mostrar.
      </p>
    </section>
  );
}
