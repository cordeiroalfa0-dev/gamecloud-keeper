# Estado da integração com Google Drive

**Projeto:** `save-my-games`  
**Atualizado em:** 8 de outubro de 2026  
**Estado do código:** adaptador implementado para OAuth direto do Google Drive; deploy e gravação real ainda precisam ser validados após configuração dos segredos.

## Implementação

- As rotas `/api/saves/` gravam, leem e excluem no Google Drive quando o servidor tem todas as três variáveis `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` e `GOOGLE_DRIVE_REFRESH_TOKEN`.
- O servidor troca o refresh token por access token temporário e chama `www.googleapis.com/drive/v3`; os tokens não são enviados ao navegador.
- Os saves ficam em `Master Games Arcade Saves`. Usuário, ROM e core são representados por hashes para a chave/nome do arquivo.
- A identidade do usuário continua sendo validada via token Supabase.
- Sem nenhuma credencial OAuth, o caminho legado usa a tabela Supabase `mga_saves`. Se somente parte das credenciais estiver presente, as rotas retornam 503; erros de Drive também são retornados ao cliente e não fazem fallback silencioso ao Supabase.
- O README e `.env.example` agora refletem os mesmos nomes de variáveis que o adaptador realmente lê.

## Limite de validação

O endpoint público respondeu 401 sem autenticação, conforme esperado. Isso prova que a rota publicada exige login, mas não revela o destino configurado. A validação de ponta a ponta requer credenciais OAuth válidas configuradas no servidor e um teste autenticado de gravação/leitura. Não foi possível verificar os segredos do provedor de hospedagem nem confirmar que as alterações locais já estejam implantadas.

## Configuração pendente para ativar o Drive

1. No Google Cloud Console, habilite Google Drive API e configure a tela de consentimento.
2. Crie credencial OAuth Web e obtenha um refresh token da conta proprietária com o escopo `https://www.googleapis.com/auth/drive.file` e acesso offline.
3. Configure como segredos server-side do ambiente publicado: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` e `GOOGLE_DRIVE_REFRESH_TOKEN`.
4. Publique/reimplante o código atualizado.
5. Entre no app, salve uma partida, confirme a pasta/arquivo no Drive, reabra a partida e valide restauração. Faça teste de isolamento com outra conta e valide exclusão.

Nunca armazene credenciais em variáveis `VITE_*`, no frontend, ou no Git. Caso um segredo tenha sido compartilhado ou commitado anteriormente, revogue/rotacione-o no Google Cloud antes de usar a integração.
