# Música e cifras — KeyRadar 0.5.2

## Escuta automática v0.5.2

Um toque em **Começar a ouvir** mantém a detecção de tom local e usa dois trechos consecutivos de 10 s para reconhecer a melodia com ACRCloud. Um resultado forte pode aparecer depois do primeiro trecho. Um resultado fraco só aparece se o segundo trecho apontar a mesma música e artista. Isso pode consumir até duas consultas do projeto por escuta. As notas de similaridade da ACRCloud não são porcentagens de acerto; o usuário continua confirmando artista e versão.

Em navegadores compatíveis, a API Web Speech tenta transcrever em português a frase cantada na mesma escuta. O app mostra a frase recebida para conferência. O navegador pode enviar o áudio ao serviço remoto de reconhecimento de fala e não há garantia de que transcreverá canto com música ou ruído. Cinco ou seis palavras finais iniciam automaticamente uma busca pública no Genius, sem chave e sem conta, seguida da localização da cifra no Cifra Club. Até três frases diferentes podem ser consultadas, mesmo que a primeira tenha sugerido candidatos. A busca pública pode mudar ou deixar de responder; nesse caso, o app oferece um link de pesquisa pela frase.

A [auditoria de 120 louvores](artifacts/audit-louvores-2026-09-15.md) encontrou o título correto entre os cinco primeiros em 67 das 100 músicas da amostra principal após uma frase e em 77/100 após até duas. Nos 30 hinos e títulos antigos adicionais, apenas 2 apareceram em alguma das duas consultas. É um teste de texto já transcrito, não de canto real. O catálogo gratuito atual tem cobertura fraca para repertório antigo e obscuro.

Se uma música for reconhecida mas o catálogo não trouxer um link específico de cifra, o app oferece a busca pronta no Cifra Club. A extração da cifra só começa quando o usuário toca em **Ver cifra** e não atrasa a identificação.

## O que já funciona

- Busca pelo nome ou artista no catálogo público do Cifra Club.
- Entrada direta de um link HTTPS de cifra do Cifra Club.
- Escolha do artista e, quando disponível na página, do arranjo principal ou simplificado.
- Extração dos acordes em ordem, mantendo extensões, baixo invertido, seções publicadas e repetições explícitas na linha.
- Transposição manual ou para o tom detectado anteriormente; salvar cifras neste navegador e reabrir offline após instalar/carregar o PWA.

Abra **Encontre a música. Toque a sua versão.**, busque a música, escolha artista e arranjo. **Salvar cifra** guarda somente metadados e acordes neste aparelho; as letras completas continuam na fonte. O link **Abrir cifra completa na fonte** abre o Cifra Club.

O Cifra Club não está sendo tratado como uma API oficial com contrato de estabilidade. O adaptador usa a busca e as páginas publicamente acessíveis do próprio catálogo, sem login nem contorno de bloqueios. Mudanças no site podem exigir manutenção. Uma página incompatível produz uma mensagem, nunca uma cadência inventada. Não há associação oficial entre KeyRadar e Cifra Club.

## Ativar reconhecimento por canto

1. Crie uma conta em https://www.acrcloud.com/ e um projeto com **Cover Song (humming) Identification** ou reconhecimento combinado que inclua canto. Fingerprinting de gravações, sozinho, não é adequado à voz a cappella.
2. Abra o arquivo local `.env.local`, preparado com campos vazios. Se precisar recriá-lo, copie `.env.example`.
3. Preencha `ACRCLOUD_HOST` (hostname sem `https://`), `ACRCLOUD_ACCESS_KEY` e `ACRCLOUD_ACCESS_SECRET` com os dados do projeto.
4. Reinicie o servidor KeyRadar. A identificação por melodia passa a ocorrer automaticamente na escuta principal.

As chaves ficam no servidor, nunca use `VITE_` nos nomes. Não envie chaves pelo chat. Os arquivos `.env*` estão ignorados pelo Git, exceto o exemplo sem segredos.

Durante a escuta, o aplicativo prepara dois trechos consecutivos de 10 segundos e os envia à ACRCloud por meio do servidor. A detecção de tom continua durante a consulta. Cancelar, sair da tela ou mandar o app para segundo plano encerra a captura. O KeyRadar não grava áudio em disco. O serviço externo processa o trecho segundo seus termos. O limite local é de 30 consultas/hora por servidor, incluindo tentativas sem resultado, para conter uso acidental da conta. Este limite reinicia com o processo; para exposição permanente, adicione autenticação e controle persistente de uso.

As possíveis músicas retornadas são apresentadas para confirmação. Depois o aplicativo busca o título no Cifra Club e você escolhe a versão desejada. Reconhecimento não significa certeza absoluta nem garante presença no catálogo.

O projeto ACRCloud existente já reconheceu parte das músicas testadas pelo usuário. A qualidade depende da voz, da gravação e do catálogo; os testes automatizados usam respostas controladas e não medem taxa de acerto real.

Documentação: https://docs.acrcloud.com/reference/identification-api/identification-api e https://docs.acrcloud.com/tutorials/recognize-music.

## Busca por trecho de letra

Não é necessário cadastrar serviço de letras. A busca por frase usa [resultados públicos do Genius](https://genius.com/api/search?q=Tua%20bondade%20me%20seguir%C3%A1) e retorna apenas título e artista; o app não baixa letras completas. Uma frase conhecida de “Bondade de Deus” trouxe Isaias Saad como primeiro resultado no teste manual. Outras quatro frases de louvores trouxeram músicas relacionadas, mas isso não mede a taxa de acerto em canto real. A opção de busca manual permanece em **Diagnóstico → Abrir repertório ou corrigir música**.

A captura de canto usa ACRCloud, mas ela não transcreve a letra. A transcrição usa a API de fala do navegador, que pode processar áudio remotamente. A busca pelo texto transcrito usa a consulta pública do Genius. A análise de tom em si permanece local.

Referência de uso da busca pública: https://lyricsgenius.readthedocs.io/en/master/how_it_works.html.

## Tom, capo e acompanhamento

**Original** mantém as posições e o capotraste da cifra. Exemplo real verificado: Isaías Saad, Bondade de Deus, principal: acordes em C com capo 2, soando em D. Escolher **D** no seletor mostra acordes em D para tocar **sem capo**. A simplificada do catálogo usa outra sequência; o app carrega essa página, não simplifica a principal por conta própria.

O tom detectado não muda a cifra sozinho: **Usar tom detectado** aplica a mudança explicitamente. Sem metadados reconhecíveis de tom, a transposição é desabilitada e a cifra permanece original. As seções e quebras seguem a fonte; não são compassos inferidos. Não há sincronização automática de acorde com a voz nem promessa de 100% de reconhecimento. A ordem de repetições abreviadas ou instruções textuais deve ser conferida na fonte.

## Execução e verificação

O backend está no plugin Vite `server/api.mjs`, disponível tanto no desenvolvimento quanto no preview. Para usar no computador **sem túnel**:

```powershell
npm.cmd run dev:local
```

Abra http://localhost:5173. Para testar a build: `npm.cmd run build`, depois `npm.cmd run preview` e http://localhost:4173. Hospedagem apenas dos arquivos de `dist` não executa a API; preserve o servidor Node. O detector local e cifras já salvas continuam offline, mas buscas e reconhecimento precisam de internet.

Validação: `npm.cmd test`, `npm.cmd run test:e2e`, `npm.cmd run build`, `npm.cmd run lint`. Os testes de navegador usam músicas fictícias e respostas controladas para serem repetíveis. A consulta real ao Cifra Club foi verificada separadamente com os arranjos principal/simplificado de Isaías Saad e principal de Pedras Vivas em 14/09/2026.
