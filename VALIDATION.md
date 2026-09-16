# Validação v0.5.2 — 15/09/2026

- [Auditoria com 120 louvores](artifacts/audit-louvores-2026-09-15.md): 90 músicas do ranking gospel semanal público do Cifra Club, 10 hinos/títulos antigos na amostra principal e 20 adicionais de desafio. Todas tiveram primeira frase de seis palavras e 116 tiveram segunda frase distinta.
- Amostra principal: título correto entre cinco candidatos em 67/100 na primeira frase, 77/100 em alguma das duas. Grupo de desafio: 1/20 em ambas as medidas. No total de 30 hinos e títulos antigos adicionais, 2/30 foram encontrados em alguma das duas frases.
- 120 primeiras consultas e 116 segundas concluídas sem erro de provedor. A taxa mede busca por texto da letra; não mede precisão do microfone ou da transcrição de canto.
- Depois da auditoria, o app passou a continuar a busca por até três frases mesmo quando a primeira sugeriu músicas incorretas. Build, lint, 68 testes Vitest, 11 testes Node e os dois cenários Chrome mobile afetados passaram.

# Validação v0.5.1 — 15/09/2026

- A busca pública por letra respondeu sem chave para cinco frases de louvores; “Tua bondade me seguirá” trouxe “Bondade de Deus” de Isaias Saad em primeiro. Pelo endpoint do app, essa música foi ligada à cifra de Isaías Saad no Cifra Club.
- O endereço HTTPS temporário respondeu com `catalog: true`, `recognition: true`, `lyrics: true`.
- Build TypeScript/PWA, lint, 68 testes Vitest, 11 testes Node e 7 cenários Chrome mobile relacionados a música/cifra aprovados.
- A transcrição de canto real no celular e uma taxa de acerto em repertório amplo ainda precisam ser medidas; a busca pública gratuita pode mudar sem aviso.

# Validação v0.5.0 — 15/09/2026

- Build TypeScript/PWA e lint aprovados.
- 68 testes Vitest e 10 testes Node aprovados.
- 19 cenários Chrome mobile aprovados; após o último ajuste, o cenário de duas frases também passou novamente. Ele simula a primeira frase sem resultado e a segunda frase encontrando uma cifra.
- O endereço HTTPS temporário respondeu com o HTML da versão compilada e com `catalog: true`, `recognition: true`, `lyrics: false`.
- ACRCloud está configurada no servidor, mas a taxa de acerto das músicas não foi medida nesta versão. Musixmatch ainda não tem chave; o fluxo automático por letra foi testado apenas com respostas simuladas. Canto real e transcrição no celular ainda precisam de ensaio.

# Validação v0.4.0 — 14/09/2026

- Build TypeScript/PWA e lint aprovados.
- 65 testes Vitest e 10 testes Node: regress?o musical, transposi??o, persist?ncia, extra??o, URLs permitidas, assinatura ACRCloud e bloqueio de envios de outra origem.
- 16 testes Chrome mobile aprovados, incluindo busca/arranjo, capotraste, offline, cancelamento, permiss?o pendente em segundo plano, grava??o curta e todos os cen?rios existentes de ?udio. Testes novos usam m?sica fict?cia e respostas controladas.
- Consulta real ao Cifra Club: Bondade de Deus, Isa?as Saad principal (123 acordes, 7 partes, posi??es em C/capo 2), simplificada (111 acordes, posi??es em D/sem capo); Pedras Vivas (108 acordes, posi??es em G/capo 1).
- Smoke real no navegador: busca ? Isa?as Saad ? principal ? 123 acordes ? transposi??o para D, sem erro JavaScript nem overflow em 390 px. Layout tamb?m testado em 320 px.
- ACRCloud e Musixmatch n?o validados com contas reais: credenciais ainda n?o configuradas. A interface informa essa condi??o.
- Capturas em artifacts/catalog-search-mobile.png, catalog-arrangements-mobile.png, catalog-reader-mobile.png e songs-reader-mobile.png.

# Validação da primeira versão — 11/09/2026

- `npm.cmd run build`: aprovado, incluindo TypeScript e geração de service worker.
- `npm.cmd test`: **32 testes aprovados**.
- `npm.cmd run test:e2e`: **8 testes aprovados** no Chrome instalado, viewport mobile de 390 × 844.
- `npm.cmd run lint`: aprovado, sem avisos após correções.
- HTTP público: o túnel HTTPS de produção respondeu 200 com o HTML do KeyRadar.
- `npm.cmd run dev`: iniciou Vite em 5173 e imprimiu automaticamente endereço HTTPS válido pelo localhost.run.
- Cloudflare Tunnel: download oficial e SHA-256 verificados; criação do túnel excedeu o tempo de resposta duas vezes. localhost.run foi a alternativa funcional.

## Evidência de áudio

O teste de integração gera uma melodia WAV com seno e segundo harmônico, usa a entrada de microfone de teste do Chrome e verifica o resultado G maior. A aplicação percorre getUserMedia, Web Audio, worker YIN, estabilização, histórico e inferência tonal. O modo sintético interno também foi testado com 440 Hz e 261,63 Hz. A PWA carregou offline e continuou analisando o seno pelo worker em cache.

Permissão negada, microfone inexistente, pausa em background, parada e cancelamento enquanto uma permissão está pendente foram verificados. A captura de teste do Chrome não substitui a avaliação com microfone físico e cantor real.

## Limites da validação

Não foi testado um iPhone/Android físico nem medida a meta de 80% de acerto em igreja. É necessário testar canto real, reverberação, distância, CPU e bateria no dispositivo. Confiança é heurística; progressão é experimental. O link HTTPS é temporário e depende do processo do PC e do serviço externo.

## Artefatos

`artifacts/mobile-idle.png`, `artifacts/mobile-listening.png`, `artifacts/desktop-listening.png` e `artifacts/g-major.wav` são gerados pelos testes. Podem ser recriados com `npm.cmd run test:e2e`.

## Correções após verificação pública

O primeiro domínio público expirou/trocou e retornou HTTP 503. O script agora acompanha a rotação e reconecta após desconexão, com limite de cinco falhas consecutivas. Três testes de URLs passaram. O watcher nativo do Vite apresentou EBUSY ao editar arquivos no Windows: configurado polling com exclusões para ferramentas/artefatos.

## Verificação HTTPS concluída

O Chrome abriu a versão de produção pelo túnel atualizado e retornou: HTTP 200, `isSecureContext = true`, API de microfone disponível, detector indicando **A4 / 440 Hz** com o seno interno e nenhum erro JavaScript. O áudio sintético foi processado localmente pelo worker através dos arquivos servidos no endereço público.

## Tom rápido e fixado — atualização

Build/TypeScript e lint aprovados. 53 testes musicais/DSP/estabilidade e três testes de túnel aprovados. Nove cenários de navegador passaram com a nova captura, incluindo recuperação de suspensão do AudioContext e reinício de worker travado. O teste de melodia inicialmente revelou uma hipótese D retida por tempo excessivo; após ajuste de histerese e tolerância às transições vocais, o teste completo voltou a reconhecer G maior e confirmou a cadência visível e ausência de Notas ao vivo. Total dos cenários de navegador validados: dez.

A velocidade e recuperação foram verificadas em ambiente automatizado no Chrome; o efeito real no celular/igreja ainda depende do teste físico do usuário.

## Refinamento v0.3.0 — 14/09/2026

Build/TypeScript e lint aprovados; 61 testes musicais, de DSP, estabilidade e conferência, mais três testes de túnel, aprovados. Dez testes no Chrome aprovados (38 s), incluindo a melodia G maior, a cadência imediata, ausência de Notas ao vivo, recuperação do áudio e PWA offline.

A conferência usa dois trechos sem sobreposição e critérios de diversidade, compatibilidade e separação entre tons. O resultado rápido e sua fixação mantêm os critérios da versão v0.2.0. Os testes não estabelecem taxa de acerto em canto real nem proximidade de 100%.
