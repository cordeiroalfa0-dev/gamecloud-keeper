# Transmitir o Gamecloud Keeper do Android para a TV

O fluxo usa Google Cast. O Android mostra um seletor de dispositivos próximos; ao escolher uma TV compatível, ela abre o receptor do Gamecloud Keeper, que por sua vez abre o Modo TV existente com o QR dos controles. Depois de ler o QR com o telemóvel, a página de controle conecta-se à partida que está a correr na TV.

## Pré-requisitos

- O telemóvel e o dispositivo de TV precisam estar na mesma rede Wi‑Fi.
- A TV precisa ter Google Cast integrado ou um Chromecast/Google TV ligado a ela. TVs que ofereçam apenas AirPlay ou Miracast não aparecem no seletor Google Cast.
- Uma rede de convidados ou uma rede com isolamento entre clientes pode impedir que o telemóvel descubra a TV.
- Abra o sistema num navegador compatível com Google Cast no Android, de preferência Chrome.

## Configuração necessária uma vez

1. Publique primeiro o site num endereço HTTPS estável.
2. No Google Cast SDK Developer Console, registe uma aplicação de tipo **Custom Web Receiver** e use como URL do receptor:

   ```text
   https://gamecloud-keeper.lovable.app/cast-receiver.html
   ```

   Se o domínio público da aplicação tiver mudado, substitua-o pelo domínio atualmente publicado. O ficheiro `public/cast-receiver.html` tem de estar acessível diretamente por HTTPS.

3. Copie o **Application ID** atribuído pelo Google Cast.
4. Configure a variável de compilação pública `VITE_GOOGLE_CAST_APP_ID` com esse ID no ambiente usado para compilar/publicar o site. O `.env.example` mostra o nome da variável. Este identificador é público; não coloque nele chaves privadas ou segredos.
5. Recompile e publique o site para que a variável esteja incluída no JavaScript entregue ao navegador.

Sem um Application ID válido, o botão **Transmitir** aparece, mas explica que o Cast ainda não está configurado. A aplicação não consegue criar esse ID sozinha: ele pertence à configuração do Google Cast do proprietário do sistema.

## Como usar

1. No telemóvel Android, abra o Gamecloud Keeper no Chrome e toque em **Transmitir**.
2. Escolha, no seletor do Google Cast, a TV ou o Chromecast que aparecer.
3. A TV abre o sistema no **Modo TV** e mostra o QR dos controles.
4. Leia o QR com o telemóvel. A página `/controller` liga-se à sala e o telemóvel passa a controlar o jogo na TV.

Se a TV não aparecer, confirme que ambos os aparelhos estão na mesma rede Wi‑Fi e que o router não está a isolar os dispositivos. O seletor lista apenas aparelhos Google Cast visíveis; ele não faz descoberta universal de todos os protocolos de Smart TV.
