# Arcade Cloud Sync

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://save-my-games.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1bb4998a-336e-4e3f-aa57-e0e9314a781d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Saves centralizados no Google Drive do proprietário

A autenticação dos jogadores continua sendo feita pelo Supabase/Google. Os checkpoints são gravados ao mesmo tempo no banco do projeto (`mga_saves`) e na pasta `Master Games Arcade Saves` do Google Drive do proprietário, quando a integração estiver disponível. Os nomes/índices dos saves usam hashes do usuário, ROM e core; a API valida o usuário pelo token Supabase antes de acessar os dados.

Existem duas formas de ativar o Drive, nesta ordem de preferência:

1. **Conexão do Google Drive ligada ao projeto (recomendado)** — o servidor fala com o Drive pelo gateway do Lovable usando os segredos `LOVABLE_API_KEY` e `GOOGLE_DRIVE_API_KEY`, criados ao ligar a conexão em Connectors. Nenhuma credencial OAuth é necessária.
2. **OAuth direto do Google** — configure no ambiente server-side as três variáveis `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` e `GOOGLE_DRIVE_REFRESH_TOKEN`. O servidor troca o refresh token por um access token temporário e mantém as credenciais fora do navegador. Use o escopo mínimo `https://www.googleapis.com/auth/drive.file` com acesso offline (`access_type=offline`), habilite a Google Drive API no projeto Google Cloud e autorize a conta proprietária.

**Comportamento de armazenamento:** o banco grava sempre. Com a integração ativa, a gravação no Drive acontece junto; se ela falhar, o save continua no banco e a resposta indica `storage: "database"` com `driveStored: false`. A leitura devolve o checkpoint mais recente entre banco e Drive. Se parte das credenciais estiver presente e nenhum dos dois caminhos estiver completo, a API retorna erro de configuração (503). O app cria a pasta automaticamente.

Depois de ativar, publique/reimplante o app e valide gravação, leitura e exclusão autenticadas. Teste também duas contas para confirmar isolamento entre usuários. A quota/armazenamento consumida pertence à conta Google proprietária.

Use `.env.example` apenas como referência. Não envie `.env`, client secret ou refresh token ao GitHub nem ao navegador. Se alguma credencial secreta já tiver sido commitada, revogue/rotacione-a no Google Cloud; removê-la do último commit não apaga o histórico.
