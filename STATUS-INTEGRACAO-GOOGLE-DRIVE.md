# Estado da integração com Google Drive

**Projeto:** `save-my-games`
**Atualizado em:** 20 de novembro de 2026
**Estado do código:** o save é gravado no banco do projeto **e** no Google Drive do proprietário; gravação, leitura e exclusão validadas de ponta a ponta contra a conexão ligada.

## Como funciona hoje

- As rotas `/api/saves/` gravam sempre no banco do projeto (tabela `mga_saves`) e, quando a integração com o Drive está ativa, gravam também em `Master Games Arcade Saves`.
- A leitura devolve o checkpoint mais recente entre banco e Drive (comparando `savedAt` e `checkpointVersion`).
- A exclusão remove dos dois destinos.
- A identidade do usuário continua sendo validada via token Supabase; usuário, ROM e core viram hashes no nome/chave do arquivo.

## Caminhos de acesso ao Drive (em ordem de preferência)

1. **Conexão do Google Drive ligada ao projeto (ativa).** O servidor chama o gateway do Lovable (`connector-gateway.lovable.dev/google_drive`) com `LOVABLE_API_KEY` e `GOOGLE_DRIVE_API_KEY`. Nenhuma credencial OAuth é necessária no código.
2. **OAuth direto do Google (alternativa).** Exige `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` e `GOOGLE_DRIVE_REFRESH_TOKEN` no ambiente server-side, com escopo `https://www.googleapis.com/auth/drive.file` e acesso offline.

Se apenas parte das credenciais estiver presente e nenhum caminho estiver completo, as rotas retornam 503 em vez de escolher um destino silenciosamente.

## Validação feita em 2026-11-20

- Sessão autenticada real (conta do próprio usuário) contra o servidor local.
- Gravação: resposta `storage: "database+google_drive"`, `stored: true`, `driveStored: true`; arquivo `.mga-save.json` criado na pasta do Drive com `modifiedTime` do instante do teste.
- Leitura: o mesmo checkpoint voltou pela API com o `savedAt` correto.
- Exclusão: arquivo sumiu da pasta do Drive e a linha correspondente ficou com contagem zero no banco.
- Teste de contrato: `node tests/cloud-save-contract.test.mjs` → ok.

## Pendências

- Repetir a validação depois de publicar (o ambiente publicado precisa receber o código atualizado).
- Confirmar isolamento entre duas contas de jogador no ambiente publicado.
- Nunca armazene credenciais em variáveis `VITE_*`, no frontend ou no Git.
