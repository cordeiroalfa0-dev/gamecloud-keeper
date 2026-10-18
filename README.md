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

A autenticação dos jogadores continua sendo feita pelo Supabase/Google. Quando as três variáveis abaixo estiverem definidas **no ambiente server-side**, as rotas `/api/saves/` gravam, leem e excluem os checkpoints diretamente na Google Drive API, usando OAuth 2.0 com refresh token. Os saves ficam na pasta `Master Games Arcade Saves` da conta Google autorizada. Os nomes/índices dos saves usam hashes do usuário, ROM e core; a API valida o usuário pelo token Supabase antes de acessar os dados.

Configure no provedor de hospedagem (por exemplo, Lovable Cloud → Secrets):

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`

O servidor troca o refresh token por um access token temporário e mantém as credenciais fora do navegador. Configure o cliente OAuth para permitir o escopo mínimo `https://www.googleapis.com/auth/drive.file` e acesso offline (`access_type=offline`). Habilite a Google Drive API no projeto Google Cloud e autorize a conta proprietária do Drive. O app cria a pasta automaticamente.

**Comportamento de armazenamento:** sem nenhuma dessas três variáveis, saves continuam no Supabase, em `mga_saves`. Se uma ou duas estiverem presentes, a API retorna erro de configuração (503) em vez de usar silenciosamente outro destino. Com todas configuradas, o Drive é o destino; falhas da API do Google são reportadas como erro e não desviam a gravação para o Supabase.

Depois de adicionar os segredos, publique/reimplante o app e valide gravação, leitura e exclusão autenticadas. Teste também duas contas para confirmar isolamento entre usuários. A quota/armazenamento consumida pertence à conta Google proprietária.

Use `.env.example` apenas como referência. Não envie `.env`, client secret ou refresh token ao GitHub nem ao navegador. Se alguma credencial secreta já tiver sido commitada, revogue/rotacione-a no Google Cloud; removê-la do último commit não apaga o histórico.
