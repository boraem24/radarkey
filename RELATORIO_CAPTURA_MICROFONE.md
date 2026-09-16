# Relatório para análise — captura de palavras cantadas no KeyRadar

## Sintoma observado

No endereço de produção `https://keyradar.onrender.com`, o usuário toca em
**Começar a ouvir**, canta uma música e o aplicativo continua mostrando
`Transcrição capturada: nenhum trecho recebido`. O relato é que o aplicativo
parece ouvir, mas não registra as palavras cantadas. A identificação de tom e
a transcrição são caminhos diferentes; este relatório trata principalmente da
transcrição.

## O que está comprovado

- O frontend está publicado no Render e chama a API em
  `https://keyradar-api.onrender.com`.
- `GET /api/music/status` responde HTTP 200 com
  `{ "catalog": true, "lyrics": true, "recognition": false }`.
- `recognition: false` é esperado: não há chave ACRCloud configurada. Portanto,
  o reconhecimento acústico de música não está ativo.
- A busca por letra só começa depois que o navegador entrega uma frase ao
  callback `onPhrase` em `src/songs/speech.ts`.
- A API não recebe áudio para transcrever. O áudio da fala é processado pelo
  Web Speech API do próprio navegador; somente o texto resultante é enviado à
  busca gratuita de letras.
- Typecheck, build e os 75 testes automatizados passam. Esses testes usam
  microfones e SpeechRecognition falsos; eles não comprovam funcionamento em
  um aparelho físico.
- O bundle público atual contém o indicador de estado da fala e não contém o
  botão grande `Copiar`.

## Fluxo atual do áudio

1. `useSession.start()` cria `AudioEngine`.
2. `src/audio/microphone.ts` solicita `getUserMedia` em HTTPS com um canal,
   cancelamento de eco, redução de ruído e ganho automático.
3. `AudioEngine` conecta o stream a um `AnalyserNode`; o worker YIN usa esses
   dados para detectar notas e tom.
4. Quando existe uma faixa de áudio, `listenForWords()` cria
   `SpeechRecognition` ou `webkitSpeechRecognition` com `lang = pt-BR`,
   `continuous = true`, `interimResults = true` e `maxAlternatives = 3`.
5. O texto recebido atualiza `heardPhrase`; só então a busca por letra é
   chamada.

## Causas mais prováveis, em ordem

### 1. O navegador não oferece Web Speech API

`supportsSpeechRecognition()` só verifica `window.SpeechRecognition` e
`window.webkitSpeechRecognition`. Safari/iOS, Firefox e alguns modos PWA não
oferecem essa API ou oferecem uma implementação limitada. Sem ela, o tom pode
funcionar normalmente, mas nenhuma palavra será capturada. O estado exibido é
`Este navegador não oferece transcrição por voz`.

### 2. O navegador bloqueou ou encerrou o reconhecimento

`recognition.onerror` muda o estado para erro, mas o código não preserva nem
exibe o nome do erro (`not-allowed`, `service-not-allowed`, `network`,
`audio-capture`, `no-speech`). Também não há contador de eventos `onstart`,
`onresult` e `onend`. Assim, ainda não é possível distinguir permissão,
serviço de voz indisponível, rede ou ausência de fala.

### 3. Incompatibilidade com `recognition.start(track)`

O código tenta primeiro `recognition.start(track)` para associar a faixa do
microfone e usa `recognition.start()` como fallback. O argumento de faixa é
suportado somente em algumas implementações experimentais. É necessário
registrar qual chamada foi aceita e qual exceção ocorreu.

### 4. Reconhecimento de voz depende de um serviço externo do navegador

Mesmo com HTTPS, o Web Speech API pode exigir conexão, idioma instalado e
serviço de voz habilitado na conta/aparelho. O KeyRadar não controla esse
serviço e não tem um transcritor próprio no servidor.

### 5. Permissão ou faixa sem áudio

`getUserMedia` pode conceder uma faixa que termina depois, ou o usuário pode
ter permitido o microfone para outra origem. O `AudioEngine` detecta o fim da
faixa para o caminho do tom, mas a interface não mostra o estado
`track.readyState`, `track.enabled` ou nível capturado especificamente para a
fala.

### 6. Cache/PWA

O Render já publicou o bundle novo, mas uma instalação PWA antiga pode manter
um service worker anterior. O teste de diagnóstico deve ser feito primeiro no
Chrome em uma aba anônima, para separar cache de problema do microfone.

## Pontos do código para revisar

- `src/songs/speech.ts:24-101`: suporte, criação, `start`, `onstart`, `onresult`,
  `onend`, `onerror` e reinício automático.
- `src/hooks/useSession.ts:85-110`: início sem esperar a API; flags
  `recognition`/`lyrics` e estado visual.
- `src/hooks/useSession.ts:184-205`: `onPhrase`, buffer de frases e condição
  que só consulta letras quando `lyrics` é verdadeiro.
- `src/audio/microphone.ts:1-16`: permissão e constraints do microfone.
- `src/audio/audioEngine.ts:47-106`: stream, `AudioContext`, `AnalyserNode` e
  faixa entregue ao reconhecimento.
- `src/App.tsx:155-174`: texto capturado e indicador visual de fala.
- `server/api.mjs:7-18`: capabilities; `recognition` permanece falso sem ACRCloud.

## Teste mínimo recomendado no aparelho

1. Abrir no Chrome Android uma aba anônima:
   `https://keyradar.onrender.com/?v=654cb9f`.
2. Confirmar permissão de microfone para `keyradar.onrender.com`.
3. Tocar em **Começar a ouvir**.
4. Abrir **Diagnóstico** e observar RMS, pico, nota e estado da fala.
5. Falar uma frase normal, depois cantar a mesma frase por 5 segundos.
6. Registrar qual mensagem aparece:
   - `Escuta de palavras ativa` sem resultado: reconhecimento iniciou, mas não
     entregou evento `result`.
   - `Palavras recebidas pelo microfone`: o caminho funcionou.
   - `Navegador não oferece transcrição`: incompatibilidade do navegador.
   - `Navegador bloqueou a transcrição`: permissão/serviço/erro do navegador.
7. Repetir em uma aba normal e no Safari/iPhone, anotando diferenças.

## Instrumentação que Claude deve adicionar

- Guardar `speechError`, `speechStarts`, `speechResults`, `speechEnds` e
  `lastSpeechEvent` no estado da sessão.
- Preservar `event.error` em `onerror` e mostrá-lo no painel Diagnóstico.
- Registrar `track.readyState`, `track.enabled`, `track.muted` e RMS no momento
  em que o reconhecimento inicia.
- Registrar se `start(track)` ou `start()` foi usado e a exceção da primeira
  tentativa.
- Não esconder o erro com comentário vazio; distinguir claramente
  `unsupported`, `not-allowed`, `network`, `no-speech` e `audio-capture`.
- Criar um teste de navegador que simule `onstart`, `onerror`, `onend` e
  `onresult` e confirme que cada estado chega à interface.
- Se o requisito for funcionar também em Safari/iOS ou sem o serviço de voz do
  navegador, adicionar um backend de transcrição real (por exemplo, um modelo
  hospedado) ou declarar essa limitação. A API atual não transcreve áudio.

## Conclusão técnica

Não há evidência de que o Cifra Club ou a API Render esteja impedindo a captura:
sem uma frase recebida, a busca nem é executada. O ponto de falha está entre a
faixa concedida pelo `getUserMedia` e os eventos do Web Speech API. O próximo
passo correto é coletar os eventos e o erro real no aparelho; sem isso, qualquer
novo ajuste de algoritmo de letras ou tom será apenas tentativa.
