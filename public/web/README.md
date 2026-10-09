# Master Games Arcade Web

Camada web do Master Games Arcade, mantendo a interface original e substituindo a execução nativa por uma camada compatível com navegador.

## Estado atual

- O launcher original continua sendo usado como interface principal.
- `web/mame-web.js` é carregado antes do bundle original em `index.html`.
- As chamadas locais `/api/*` usadas pelo launcher são interceptadas pelo bridge web quando necessário.
- O catálogo é publicado localmente em `/roms-catalog.json`.
- Os títulos amigáveis são publicados localmente em `/game-titles.json`.
- O repositório original `master-games-arcade-system` permanece separado.

## Execução das ROMs

A execução principal usa o **EmulatorJS 4.2.3** com cores WebAssembly do **FBNeo** e do **FBAlpha 2012 CPS2**. Os arquivos do EmulatorJS são self-hosted em `web/emulatorjs-data/`; o CDN oficial é usado apenas como fallback caso um asset local falhe.

As ROMs continuam hospedadas separadamente e são baixadas por meio das APIs `/api/rom`. As BIOS são expostas na raiz com os nomes esperados pelo core, como `neogeo.zip`, usando os rewrites do Vercel. O conjunto de ROMs precisa ser compatível com o core FBNeo; arquivos destinados ao MAME 0.168.2 não devem ser misturados automaticamente.

## Validação

Execute o teste de integridade antes de publicar:

```bash
node tests/web-integrity.mjs
```

Esse teste confirma a presença do player, dos manifestos locais, dos cores FBNeo e das rotas essenciais.

## Melhorias integradas

1. Catálogo local com fallback externo.
2. Mapa local de títulos amigáveis.
3. Timeout de 12 segundos para carregamento de dados.
4. Cache controlado para evitar catálogo desatualizado.
5. Histórico dos jogos recentes no navegador.
6. Favoritos persistidos localmente.
7. API web para consultar favoritos e recentes.
8. Identificação estável de até quatro gamepads.
9. Eventos de conexão, desconexão e retorno da aba para controles.
10. Atalhos F9 para diagnóstico, F11 para tela cheia e Escape para sair do player.

## Melhorias de vídeo

O player também oferece ajustes visuais persistentes, sem modificar o core, a ROM ou a BIOS: escala inteira de pixels, proporção automática, proporção 4:3, modo esticado, shader SABR para suavização inteligente de sprites pixelados, scanlines, vinheta CRT, paleta normal, paleta âmbar, paleta fria e paleta suave. O perfil inicial usa brilho, contraste e saturação levemente aprimorados; todos podem ser ajustados durante a execução.

Atalhos: `F1` liga/desliga o shader SABR, `F2` scanlines, `F3` escala inteira, `F4` proporção, `F5` paleta, `F6` brilho, `F7` contraste, `F8` saturação, `F10` vinheta e `H`/`?` diagnóstico dos ajustes. As preferências são guardadas em `localStorage`.

## Melhorias de ROMs e BIOS

Foram incorporadas cinco práticas confirmadas no histórico do projeto original: duplicatas marcadas no manifesto deixam de aparecer como jogos independentes; uma ROM duplicada é resolvida para o arquivo original; `/api/roms/check` informa disponibilidade, duplicata, core e BIOS esperada; `/api/bios/status` lista a disponibilidade das BIOS conhecidas; e a entrega de ROM suporta `HEAD`, `Range`, CORS preflight e nomes de arquivo validados. Essas regras preservam as correções do projeto original para Neo Geo, CPS2/FBAlpha 2012 e BIOS por caminho na raiz.
