# KeyRadar

Aplicativo web mobile-first para analisar **uma voz predominante a cappella** e estimar a tonalidade. A análise de tom é local no navegador. A progressão harmônica continua sendo uma **inferência experimental**.

**Novo na v0.5.2:** a escuta mantém a detecção local do tom, envia dois trechos de áudio consecutivos para ampliar as chances de reconhecimento por canto e tenta captar uma frase de cinco ou mais palavras no navegador. Até três frases diferentes são pesquisadas na busca pública gratuita do Genius, sem conta nem chave, e os resultados são ligados às cifras do Cifra Club. A cifra tem um link direto e só é carregada dentro do app quando você toca em **Ver cifra**. A identificação por frase depende da precisão da transcrição e da cobertura dos catálogos. A [auditoria de 120 louvores](artifacts/audit-louvores-2026-09-15.md) mede essa cobertura com trechos reais. Instruções em [INTEGRACOES.md](INTEGRACOES.md). Para abrir no computador sem túnel: `npm.cmd run dev:local`.

## Abrir no celular, sem USB

No PowerShell, dentro desta pasta:

```powershell
npm.cmd install
npm.cmd run dev
```

O terminal inicia Vite e imprime **ABRA ESTE ENDEREÇO NO CELULAR: https://…lhr.life**. Abra esse link no Chrome Android ou Safari iPhone. Toque em **Começar a ouvir**, permita o microfone, cante por 5–15 segundos e observe as notas e o tom provável. Mantenha a tela aberta.

O túnel usa o SSH que já existe neste Windows, através do localhost.run. Não precisa de conta, cabo, instalação de certificado ou alteração de firewall. PC e celular precisam de internet; não precisam estar na mesma rede. Mantenha o PC acordado e o processo em execução. Ctrl+C encerra o servidor e o túnel. O link é temporário e pode expirar; reinicie o comando para obter outro. O provedor pode apresentar uma página inicial de confirmação antes do aplicativo.

Para testar **PWA e versão de produção**:

```powershell
npm.cmd run build
npm.cmd run mobile
```

Ou dê dois cliques em `INICIAR KEYRADAR.cmd`, na pasta acima. Esse atalho compila e abre o túnel de produção. O arquivo `tools/mobile-url.txt` guarda o último endereço gerado. Só é válido enquanto aquela conexão existir.

No macOS/Linux com SSH, o script também utiliza localhost.run, mas esses sistemas não foram testados nesta entrega. Use `npm` em vez de `npm.cmd`.

### Alternativa: Cloudflare Tunnel

O provedor Cloudflare excedeu o tempo de resposta em duas tentativas neste ambiente. Por isso localhost.run é o padrão validado. A alternativa está implementada:

```powershell
$env:KEYRADAR_TUNNEL = 'cloudflare'
npm.cmd run dev
```

O script baixa o executável oficial Windows x64 para `tools/`, valida SHA-256 informado pelo release do GitHub e não instala serviços. Nas execuções seguintes verifica novamente o checksum. Para voltar ao padrão:

```powershell
Remove-Item Env:KEYRADAR_TUNNEL
```

Não é necessário ngrok, login externo ou certificado local. Apenas `http://192.168.…:5173` **não** atende ao requisito de contexto seguro para microfone. Em um PC, `http://localhost:5173` é permitido pelo navegador. `npm.cmd run dev:local` inicia somente Vite, sem túnel.

## Ambiente encontrado em 11/09/2026

| Item        | Resultado                                                              |
| ----------- | ---------------------------------------------------------------------- |
| Sistema     | Windows NT 10.0.26200, x64                                             |
| Node        | 24.18.0                                                                |
| npm         | 11.16.0                                                                |
| Git         | 2.55.0.windows.3                                                       |
| VS Code     | 1.137.0                                                                |
| Navegadores | Google Chrome e Microsoft Edge                                         |
| SSH         | OpenSSH do Windows disponível                                          |
| HTTPS local | mkcert, ngrok e cloudflared ausentes no PATH inicialmente              |
| Stack       | React 19, TypeScript 6, Vite 8, Web Audio API, Worker, vite-plugin-pwa |

A política do PowerShell bloqueia `npm.ps1`; use `npm.cmd`. Nenhuma política de execução, certificado, configuração de firewall ou serviço do Windows foi alterado. A chave pública do servidor SSH fica em `tools/known_hosts`, dentro do projeto. A dependência cloudflared é portátil.

## Como funciona

### Captura e pitch

`getUserMedia` pede áudio mono, com echoCancellation, noiseSuppression e autoGainControl desativados. O navegador/hardware pode limitar o cumprimento dessas preferências. Um `AudioContext` conecta a fonte a um `AnalyserNode` com buffer de 4096 amostras. Não usamos o maior pico de FFT: `getFloatTimeDomainData` copia a forma de onda do buffer circular interno do Web Audio.

O motor envia no máximo 20 janelas/s a um **Web Worker**, com apenas uma mensagem em processamento. Se o worker estiver ocupado, descarta a próxima janela em vez de acumular fila. YIN usa função de diferença, normalização cumulativa e refinamento parabólico, buscando aproximadamente 60–1100 Hz. Rejeita RMS abaixo de 0,008, clipping e periodicidade insuficiente. Não separa fontes simultâneas.

A estabilização usa mediana de cinco frames em MIDI contínuo, confiança mínima 0,85, permanência mínima de 120 ms e histerese de 65 cents. Após silêncio/perda de pitch, o estado reinicia. Vibrato pequeno e uma excursão isolada de semitom não criam automaticamente outra nota.

Cada pitch contém frequencyHz, midiNumber, noteName, pitchClass, pc numérico, centsDeviation, confidence e timestamp monotônico em milissegundos. A4 = 440 Hz; conversões aceitam parâmetro de afinação para expansão futura. A interface atual fixa 440.

### Tonalidade e confiança

Histórico de até 15 s / 400 evidências, ponderado por duração e confiança do pitch. Um silêncio de 350 ms marca um possível final de frase, com peso moderado extra. Perfis de 2, 5 e 15 s são combinados com pesos 0,10 / 0,25 / 0,65. Notas sustentadas naturalmente recebem mais peso por duração; a detecção de frase é heurística, não segmentação musical completa.

Cada um dos 12 tons maiores recebe correlação com o perfil maior de Krumhansl, menos penalidade pela massa cromática fora da escala. Softmax com temperatura fixa normaliza os candidatos, misturado a uma distribuição uniforme quando há pouca duração/diversidade. Os 12 valores internos somam 1; o TOP 2 não precisa somar 100% porque existem outros candidatos.

**O percentual é confiança relativa heurística, não probabilidade estatisticamente calibrada de acerto.** A interface comunica isso. Nenhum resultado aparece com apenas uma nota: exigimos pelo menos 2 s de pitch aceito e três classes relevantes. Para “estável”, exigimos pelo menos 5 s, liderança mantida por 2,5 s, confiança de 40% e diferença mínima de 12 pontos sobre o segundo. Uma mudança de líder exige vantagem de seis pontos mantida por 1,5 s. Na transição o título volta a analisar; não exibe um candidato de segunda posição como TOP 1. Resultados são apagados ao iniciar outra sessão; ao parar, os últimos resultados ficam disponíveis para consulta.

### Progressão provável — experimental

O catálogo extensível contém as 12 progressões solicitadas em graus diatônicos. O estimador compara grupos temporais de notas com as tríades de cada sequência em janelas de 8, 12 e 15 s. Exige tempo, notas distintas em cada grupo, boa compatibilidade e vantagem sobre a alternativa. Não usa valores mockados nem escolhe uma progressão aleatória. Se os critérios não forem atendidos, exibe **Progressão ainda incerta**.

Limitação deliberada: não há detector de pulso/compasso; grupos de acordes têm duração aproximadamente igual na hipótese. A confiança da progressão é heurística e limitada a 75%. Uma melodia pode ter várias harmonizações corretas. Expanda `PROGRESSIONS` e substitua o alinhamento quando houver detecção de frases/tempo mais avançada.

### Performance e privacidade

DSP no worker; UI limitada a aproximadamente 10 Hz; estimativa tonal a 2 Hz; 14 eventos no histórico visual, oito visíveis. Não há fila ilimitada de áudio. O buffer da forma de onda é transferido ao worker, sem duplicação na mensagem. A estimativa tonal usa pequenos vetores de 12 dimensões. Latência mínima aproximada: janela de 85–93 ms mais captura, agendamento e estabilização de aproximadamente 120–250 ms; a latência real depende do aparelho.

Nenhum MediaRecorder, upload de áudio, analytics ou fonte remota é usado. O túnel entrega os arquivos do site; o som fica no celular. A página funciona offline depois do primeiro carregamento completo da PWA. Os serviços de túnel recebem metadados normais de acesso ao site, não amostras de áudio.

## Arquitetura

```text
src/
  audio/       microphone, audioEngine, pitchDetector, pitchSmoother, pitch.worker
  music/       notes, chroma, keyProfiles, keyDetector, chordTheory, progressionEstimator
  hooks/       useSession: ciclo de vida e integração das análises
  components/  Diagnostics, UpdateNotice
  App.tsx      interface principal responsiva
scripts/       dev, mobile e provedores de túnel
public/        ícones PWA e favicon
 tests/        teoria, DSP, inferência e integração no Chrome
```

## Estados e diagnóstico

Estados: idle, requestingPermission, listening, analyzing, stable, noSignal, weakSignal, clipping, permissionDenied, unsupported e error. A estimativa tonal também tem analyzing, probable e stable. Captura para em background, ao perder a trilha do microfone ou na suspensão/interrupção do AudioContext. Reinício exige toque, respeitando as restrições do celular. Cancelamento durante a permissão libera inclusive um stream que só chegar depois.

**Diagnóstico** mostra sample rate, RMS, peak, frequência bruta, pitch estabilizado, MIDI, periodicidade/confiança, cents, AudioContext, latência base + janela, frames processados/descartados e chroma. Há um seno de teste em 440 Hz, com seletor de 261,63, 293,66, 329,63, 392 e 440 Hz. Ele passa pelo mesmo AnalyserNode e worker; é identificado como teste sintético e não é reproduzido no alto-falante.

Se o microfone for negado, abra as permissões do site no navegador, permita o microfone e tente de novo. “Sinal fraco”: aproxime o celular. Clipping: afaste-o. “Sem altura clara”: reduza conversas/ruído e privilegie uma voz. Isso não é um medidor calibrado de ruído ambiente.

## PWA e cache

Manifest com idioma pt-BR, modo standalone, cores e ícones PNG 192/512. Android: menu do navegador → Instalar/Adicionar à tela inicial. iPhone: Safari → Compartilhar → Adicionar à Tela de Início. A oferta exata varia conforme o navegador.

Service worker somente em produção. Pré-cache inclui o worker DSP. Atualização aparece para o usuário quando a escuta está parada; não recarrega a sessão musical automaticamente. Durante desenvolvimento, prefira `dev:local` em 5173; a versão de produção usa 4173. Feche abas antigas/limpe dados do site se alternar manualmente DEV e PROD na mesma origem. Para uso permanente, publique `dist/` em hospedagem HTTPS com domínio estável; links de túnel são para teste.

## Verificação

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run lint
npm.cmd run test:e2e
```

Os testes E2E usam o Chrome instalado, com entrada de microfone de teste autorizada pelas flags do navegador **somente no teste**. O aplicativo entregue usa getUserMedia normal e pede a permissão do usuário. Playwright inicia o preview automaticamente se necessário.

Testes musicais: conversão, escalas, transposição, graus, perfis, YIN em 44,1/48 kHz, harmônicos, ruído determinístico, clipping, silêncio, mediana, expiração, rejeição de nota isolada, sequências G/A, transposição para todos os 12 tons e progressão I V vi IV. Integração: layout de 390 px, seno pelo worker, captura e parada, permissão negada, background, offline, cancelamento tardio, microfone inexistente e uma melodia WAV passando por getUserMedia → detector → G maior.

Screenshots e WAV de teste são gerados em `artifacts/`, ignorada pelo Git. O WAV é áudio sintético, não gravação do usuário.

## Limitações e próximos passos

Não foi medida a meta de 8/10 em canto real. Os testes sintéticos validam funcionamento e regressões, não acurácia em uma igreja. É necessário validar no seu Android/iPhone, com cantores e melodias conhecidas, incluindo reverberação. Não prometemos separar voz, PA, banda ou múltiplos cantores. Melodias pentatônicas, curtas, menores/modais, desafinadas ou modulantes podem ser ambíguas. A interface prioriza somente tons maiores, conforme o escopo.

Próximos passos: registrar uma avaliação consentida com 20+ trechos anotados (sem gravação automática), medir latência/CPU/bateria nos aparelhos reais, calibrar confiança com conjunto independente, melhorar detecção de frases e harmonia com alinhamento dinâmico, adicionar afinação configurável e domínio HTTPS persistente. Safari/iOS físico e instalação real na tela inicial ainda dependem de teste no aparelho.

## Referências

- [YIN: de Cheveigné e Kawahara, 2002](https://pubmed.ncbi.nlm.nih.gov/12002874/)
- [Web Audio/getUserMedia e contexto seguro](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Vite](https://vite.dev/guide/)
- [Vite PWA: estratégias de service worker](https://vite-pwa-org.netlify.app/guide/service-worker-strategies-and-behaviors)
- [localhost.run](https://localhost.run/docs/)
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)

### Reconexão e troca de domínio

O localhost.run pode trocar o domínio mesmo com o terminal aberto. O script acompanha cada mudança e atualiza `tools/mobile-url.txt`. Se a conexão cair por inatividade/rede, tenta reconectar com espera progressiva (até cinco falhas consecutivas). Use sempre o último link exibido; o anterior pode retornar “no tunnel here”. O Vite usa polling a cada 500 ms, ignorando arquivos de ferramentas e artefatos, para evitar o erro EBUSY do watcher nativo observado neste Windows.

Os três testes adicionais de extração de URL cobrem links administrativos falsos, saída incompleta e rotação do domínio. Eles fazem parte de `npm.cmd test`.

## Cadência antecipada acima de 50%

A possível cadência aparece diretamente abaixo do tom assim que a confiança tonal ultrapassa 50%. Havendo inferência melódica, ela tem prioridade. Caso contrário, apresenta I → V → vi → IV transposta para o tom como **sequência comum ainda não confirmada pela melodia**, sem inventar um percentual de confiança harmônica. Em 50% ou menos, a sugestão fica oculta. Essa apresentação antecipada substitui o antigo cartão separado de progressão incerta; o estimador melódico conserva seus critérios próprios.

## Escuta rápida com tom fixado (versão atual)

Esta versão substitui o comportamento de exibição anterior: remove “Notas ao vivo” e seu histórico da interface. Assim que há 800 ms acumulados de pitch aceito, três classes de nota e vantagem inicial de perfil, fixa o candidato principal. O tempo de relógio depende da frase cantada; uma nota isolada continua insuficiente. A análise roda a 4 Hz e não apaga o tom por pausas ou por oscilações breves entre candidatos.

O tom escolhido fica protegido por pelo menos 5 s. Só muda se o rival tiver vantagem de score de 0,18, confiança relativa de pelo menos 25% e liderança sustentada por 3 s de observações recentes. “Tom fixado” descreve a retenção do resultado, não certeza estatística: o percentual não é inflado. “Outro candidato” mostra a melhor alternativa atual; a distribuição bruta permanece ordenada internamente. Reanalisar tom inicia nova análise.

A cadência comum aparece imediatamente junto com o tom fixado, sem o antigo limiar de 50%. A inferência melódica continua tendo preferência quando disponível. Sem essa evidência, I V vi IV é explicitamente uma sugestão comum, não confirmação dos acordes.

YIN usa a mesma janela temporal, com filtro passa-baixa e redução de amostragem por dois em entradas de 44,1/48 kHz (aproximadamente um quarto das operações da função de diferença). Mediana de três frames e permanência de 80 ms agilizam a aceitação; o limite RMS foi reduzido a 0,004 para voz mais baixa, preservando a rejeição por periodicidade. Clipping é verificado também antes do filtro.

Suspensões breves do AudioContext tentam recuperação por até 2 s. Um worker travado é reiniciado automaticamente, com até duas tentativas consecutivas. Interrupções permanentes ainda pedem um toque para reiniciar. Background continua pausando a captura. Essas recuperações são cobertas por testes de navegador; o aparelho físico continua sendo necessário para avaliar as condições reais de captação.


## Atualização de versão

### Preparação para Render

O arquivo `render.yaml` prepara um Static Site no Render. No painel, crie um serviço a partir deste repositório e use o blueprint; o build executa `npm ci && npm run build` e publica `dist/`. `index.html` e `sw.js` recebem `Cache-Control: no-cache` para evitar que o celular retenha uma versão antiga. O PWA usa `autoUpdate` e a versão exibida no rodapé acompanha o pacote (`v0.5.3`). Nenhuma conta, variável secreta ou banco Supabase é necessária para esta preparação local.

A versão v0.2.0 aparece no rodapé para identificar a interface sem Notas ao vivo. A PWA verifica atualizações ao voltar à aba e a cada minuto; aplica uma atualização disponível quando a escuta está parada. Durante captura, informa que a atualização aguarda a parada. Um endereço HTTPS novo também permite abrir uma origem sem o cache da versão anterior.

## Refinamento v0.3.0: conferência da hipótese

A resposta rápida, a fixação do tom, a cadência imediata e a tela sem Notas ao vivo permanecem. O indicador de estado agora distingue “Conferindo”, “Ainda incerto” e “Evidência forte”, sem adicionar outro painel.

A conferência não altera os scores, percentuais, critérios de primeira escolha ou troca do tom. Para evidência forte exige pelo menos 6,5 s de notas válidas, cinco classes relevantes, compatibilidade de 93% com a escala, separação dos candidatos e notas que diferenciem o tom da alternativa. Dois trechos sem sobreposição (últimos 4 s e trecho anterior dentro de 12 s) também precisam concordar. Pausas, trechos curtos, notas compartilhadas entre tons e contradições não recebem esse indicador.

Esses critérios são heurísticos. Não medem uma probabilidade de acerto de 100% nem demonstram aumento da acurácia com canto real. Servem para evitar confundir a primeira hipótese fixada com uma conclusão bem sustentada, preservando a rapidez anterior.
