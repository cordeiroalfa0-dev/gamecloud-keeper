# Estado da integração com Google Drive

**Projeto:** `save-my-games`  
**Atualizado em:** 8 de outubro de 2026  
**Estado geral:** código preparado e commitado localmente; integração Drive ainda não autorizada, configurada ou testada de ponta a ponta.

## O que já foi feito

- Implementado um adaptador server-side para criar/ler/atualizar/excluir saves pela Google Drive API.
- Os saves ficam na pasta `Master Games Arcade Saves` criada pelo app no Drive da conta proprietária que autorizar o OAuth.
- Cada save é associado ao usuário autenticado do app, à ROM e ao core. Os identificadores são transformados em hashes para não expor esses dados no nome do arquivo/índice do Drive.
- As rotas existentes `/api/saves/` usam o Drive quando as credenciais server-side estão configuradas; sem elas, continuam usando o Supabase como antes.
- A validação de identidade continua pelo token Supabase. O token Google não é enviado ao navegador.
- Corrigida a leitura de `checkpoint_version` na rota Supabase e alinhados os tipos com a migração SQL existente.
- `.env` foi retirado do rastreamento do Git; o arquivo local foi preservado e não entra no ZIP. Foi criado `.env.example` sem valores secretos e o `.gitignore` agora ignora `.env`.
- Adicionadas instruções de configuração no `README.md`.

## Validações executadas

- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- ESLint focalizado nos principais arquivos de implementação: passou.
- `git diff --check`: passou.
- Não houve teste real com a Drive API, porque as credenciais ainda não estão configuradas. A conexão precisa ser testada depois da autorização e do deploy.
- O lint global `npm run lint` não terminou no ambiente de análise; foi interrompido pelo limite do processo. O ZIP não contém dependências instaladas.

## O que falta antes de usar o Drive

1. **Recuperar o acesso ao projeto Google Cloud `tefelin-app`.** A sessão de navegador usada na tentativa de rotação recebeu erro de permissão `resourcemanager.projects.get`. Retomar com a conta que possui acesso ao projeto ou pedir ao administrador que conceda acesso.
2. **Rotacionar o Client Secret compartilhado anteriormente.** O valor enviado por mensagem deve ser tratado como exposto: revogue/substitua-o no Google Cloud antes de configurar o app. Ele não foi reutilizado nem instalado.
3. **Terminar a autorização OAuth do proprietário.** Habilitar Google Drive API; concluir a tela de consentimento; criar/usar cliente OAuth Web; autorizar somente `https://www.googleapis.com/auth/drive.file` com acesso offline. Para o OAuth Playground, o URI de redirecionamento autorizado é `https://developers.google.com/oauthplayground`.
4. **Obter o Refresh Token** usando o cliente OAuth próprio. O OAuth Playground informa que intermedeia a troca e recebe as credenciais OAuth; não compartilhe URL com tokens nem envie o Refresh Token por mensagem. Com credenciais próprias, evite usar um Refresh Token emitido pelo cliente padrão do Playground, que pode ser revogado após 24 horas.
5. **Adicionar os segredos no Lovable Cloud → Secrets**, somente no servidor:
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET` (o novo, após rotação)
   - `GOOGLE_DRIVE_REFRESH_TOKEN`
6. **Publicar o código e fazer deploy** para que o site use o novo adaptador. O commit local `ff4eecd` não foi enviado ao GitHub. Após a publicação, verificar no Drive a pasta criada e fazer uma gravação/restauração real.

> Nunca coloque Client Secret ou Refresh Token em `.env` versionado, em variáveis `VITE_*`, no código do navegador ou em mensagens. Não inclua os novos valores no relatório ou no ZIP.

## Como validar quando estiver configurado e implantado

1. Entrar no app com a conta proprietária autorizada e iniciar um jogo.
2. Aguardar o autosave ou fazer um save manual; confirmar na interface que a sincronização foi confirmada.
3. No Drive da conta proprietária, conferir a pasta `Master Games Arcade Saves` e a criação/atualização do arquivo do save.
4. Reabrir o mesmo jogo e confirmar a restauração do estado salvo.
5. Testar com uma segunda conta do app: ela deve receber saves separados e não carregar os checkpoints da primeira conta.
6. Testar a exclusão do save e confirmar que o arquivo correspondente foi removido do Drive.

## Custo e limites

O uso padrão da Drive API não tem cobrança adicional dentro das quotas publicadas pelo Google; os arquivos consomem o armazenamento da conta Google proprietária, compartilhado com Drive, Gmail e Fotos. O Google planeja cobranças para uso acima de certas quotas mais adiante em 2026; monitore quotas e armazenamento se o app tiver muitos usuários.

## Estado do Git

- Commit local do código: `ff4eecd` (`feat: suportar saves centralizados no Google Drive`).
- Branch `main` está à frente do remoto; **nenhum push ou deploy foi feito**.
- O projeto não contém Client Secret nem Refresh Token no commit ou no ZIP.
