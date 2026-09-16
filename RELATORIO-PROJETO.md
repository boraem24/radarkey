# Relatório do projeto KeyRadar

## Ideia do projeto

O KeyRadar foi pensado para uma situação de igreja: alguém começa a cantar uma música sem avisar, e o músico precisa descobrir rapidamente o tom e qual música está sendo cantada, sem digitar o nome. O fluxo desejado é ouvir o canto pelo celular, detectar a tonalidade, transcrever algumas palavras, identificar a música e abrir uma cifra adequada no Cifra Club.

## O que já existe

- Captura de áudio pelo microfone do celular.
- Detecção local de altura e estimativa de tonalidade.
- Fixação temporária do tom para evitar oscilações rápidas.
- Sugestões de cadência baseadas no tom.
- Transcrição de fala pelo navegador quando o dispositivo oferece Web Speech.
- Busca gratuita por letra no Genius.
- Busca e leitura de cifras do Cifra Club.
- Seleção de versões e transposição de cifras.
- PWA mobile-first e API Node separada.
- Testes automatizados de música, catálogo, API e interface.

## Problemas encontrados

### Identificação da música

A identificação por letra ainda não está no nível do Shazam. Frases cantadas chegam curtas e com erros de reconhecimento. Uma única frase pode conter palavras comuns demais para localizar uma música. O Genius retorna resultados de catálogo, mas não é uma busca semântica completa de letras e pode não ter louvores antigos, versões regionais ou músicas pouco indexadas.

O teste com 120 louvores encontrou 61 no primeiro resultado e 68 entre cinco resultados usando uma frase. Com duas frases, encontrou 78 de 120. No grupo de 20 músicas antigas e menos populares, apenas uma foi encontrada. Esse resultado mede texto já transcrito; não mede a qualidade do microfone nem do reconhecimento do canto.

### Transcrição

O navegador pode não oferecer reconhecimento de fala em todos os celulares. Mesmo quando oferece, canto prolongado, melodia, ruído, reverberação e acompanhamento fazem o texto chegar incompleto ou errado. Sem visualizar a transcrição capturada, não é possível saber se a falha aconteceu no microfone, no reconhecimento de voz ou na pesquisa.

### Busca web

Uma busca geral por Google, Bing ou outro mecanismo poderia ampliar a cobertura, mas as APIs oficiais exigem chave, possuem limites e podem ter custo. Scraping direto de resultados é instável. A busca precisa combinar várias frases, normalizar acentos e erros, pontuar correspondências parciais e priorizar links de cifras. Isso ainda precisa ser implementado e medido em produção.

### Detecção do tom

O detector atual analisa a distribuição de alturas da voz, mas uma melodia curta ou uma nota sustentada pode parecer uma tônica. Por isso, detectar o tom rapidamente não significa que ele esteja confirmado. Uma garantia de 100% não é possível a partir de qualquer trecho vocal; é preciso apresentar tom provável, alternativas e evidência acumulada.

Também existe ambiguidade entre tonalidades relativas, como Fá maior e Ré menor. A decisão depende de repouso, resolução de frases, duração das notas, terça maior ou menor e contexto harmônico. Esses sinais ainda precisam pesar mais no algoritmo.

### Cadências e acordes

O áudio de uma voz isolada fornece principalmente notas melódicas, não os acordes completos do acompanhamento. A sequência `Bb–C–Dm–Am`, quando representa raízes de acordes, sugere em Ré menor `VI–VII–i–v`. Porém, as mesmas notas melódicas podem pertencer a outros contextos.

O primeiro algoritmo privilegiava progressões genéricas, especialmente `I–V–vi–IV`, e errava progressões menores, relativos, dominantes secundárias, empréstimos modais, inversões e acordes de passagem. Foi adicionada uma base para graus menores, mas a análise real de acordes e a distinção automática entre maior e relativo menor ainda precisam ser conectadas ao fluxo principal.

### ACRCloud

A ACRCloud pode ajudar na identificação por humming, mas é um serviço pago ou limitado por conta. Ela não é necessária para detectar o tom. Como o foco do projeto é cantar uma frase, a arquitetura pode funcionar sem ACRCloud usando tom local, transcrição e busca textual. Remover a integração reduz custo e complexidade, mas elimina uma fonte adicional de reconhecimento acústico.

### Deploy e cache

Os túneis quick do Cloudflare são temporários, podem expirar e gerar `NXDOMAIN`. O PWA também pode manter bundles antigos pelo service worker, fazendo o celular mostrar uma versão diferente do build local. Para testes confiáveis é necessário deploy permanente no Render, com cache do `index.html` desativado ou controlado e atualização correta do service worker.

## Conclusão técnica

O projeto já prova o fluxo de tom, cifra e busca textual, mas ainda não prova identificação acústica no nível do Shazam. As próximas prioridades são registrar a transcrição capturada, melhorar a busca com múltiplas fontes, confirmar maior ou menor com evidência temporal e integrar progressões menores e funções harmônicas ao detector. A validação final precisa usar gravações reais do celular em ambiente de igreja.
