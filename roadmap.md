# Roadmap

- [x] Importar código do GitHub (arcade-companion) para este projeto
- [x] Ativar Lovable Cloud e criar tabela mga_saves
- [x] Ativar login com Google
- [x] Corrigir "Retornar ao momento salvo" após reabrir o jogo (core CPS2)
- [x] Corrigir login Google no site publicado (app apontava para banco antigo; várias contas)
- [x] Verificar salvamento em nuvem com usuário logado (validado em 2026-11-20 com a conta real do usuário: grava, lê e exclui)
- [x] Save na nuvem E no Google Drive ao mesmo tempo (banco grava sempre; Drive via conexão ligada; leitura devolve o mais recente)
- [x] Auto-save a cada 1 minuto (era 30s) e remoção de todos os botões de salvar (player); botões de Retornar/Carregar mantidos
- [x] Botões CRÉDITO e START do controle remoto (funcionam no preview; site precisa ser publicado)
- [x] Sincronizar com o GitHub: main 3a4b541 já estava na cópia local; corrigido erro de tipo em RemoteController.tsx que quebrava o build
- [x] Decidir se os arquivos de "Jogar na TV" voltam: decidido em 2026-11-17 — ficam FORA (cópia continua guardada na branch lovable-sync do GitHub e no commit local 5f3a62c)
- [x] Controle do celular sempre na horizontal (gira sozinho em pé) e tela cheia para esconder a barra do endereço
- [x] Conferir e atualizar biblioteca do celular com imagens, dois cards e imagem ao lado
- [x] Rostos dos personagens visíveis na tela de carregamento do jogo
- [x] Remover a tela "Configuração do jogo" (inicia direto no modo Fácil)
