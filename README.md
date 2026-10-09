# Arcade Cloud Sync

https://github.com/cordeiroalfa0-dev/arcade-companion arrume pois não ta salvando na nuven

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

A autenticação dos jogadores continua sendo feita pelo Supabase/Google. Quando as três variáveis abaixo estiverem definidas **no ambiente do servidor**, as rotas `/api/saves/` passam a gravar, ler e excluir os checkpoints em uma pasta `Master Games Arcade Saves` criada no Drive da conta que autorizou a integração. Cada arquivo é identificado por hashes do usuário, ROM e core; a API valida o usuário pelo token Supabase antes de acessar o arquivo. Sem essas variáveis, o app mantém o comportamento anterior e usa o Supabase.

1. No Google Cloud Console, crie um projeto, habilite a Google Drive API e configure a tela de consentimento OAuth.
2. Crie credenciais OAuth para aplicação Web. Autorize o escopo mínimo `https://www.googleapis.com/auth/drive.file` com acesso offline (`access_type=offline`) na conta Google proprietária do Drive. Guarde o `refresh_token` resultante como segredo.
3. Configure no provedor de hospedagem (somente em variáveis **server-side**, nunca `VITE_*`) `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` e `GOOGLE_DRIVE_REFRESH_TOKEN`. O app cria a pasta que usa, portanto não precisa de um ID de pasta preexistente.
4. Faça novo deploy e teste login, gravação, leitura e exclusão com duas contas diferentes. A conta proprietária do Drive paga a quota/armazenamento; imponha limites de utilização no serviço antes de abrir o app ao público.

Use `.env.example` apenas como referência. Não envie `.env`, client secret ou refresh token ao GitHub nem ao navegador. Se uma credencial secreta já tiver sido commitada, removê-la do último commit não apaga o histórico: revogue/rotacione a credencial no Google Cloud.
