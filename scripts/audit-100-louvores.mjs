import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { load } from 'cheerio'
import { searchLyrics } from '../server/api.mjs'

const BASE = 'https://www.cifraclub.com.br'
const OUT = new URL('../artifacts/audit-louvores-2026-09-15.json', import.meta.url)
const REPORT = new URL('../artifacts/audit-louvores-2026-09-15.md', import.meta.url)
const SOURCES = {
  ranking: `${BASE}/mais-acessadas/gospelreligioso/`,
  harpa: `${BASE}/harpa-crista/musicas.html?order=alphabetical`,
  voz: `${BASE}/voz-da-verdade/musicas.html`,
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const normalized = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\b\d{1,3}\b/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const coreTitle = (s) => normalized(String(s).replace(/\s+-\s+\d{1,3}\s*$/, ''))
const titleMatches = (wanted, got) => {
  const a = coreTitle(wanted)
  const b = coreTitle(got)
  if (!a || !b) return false
  if (a === b || (a.length > 9 && b.startsWith(`${a} `))) return true
  const aw = a.split(' ')
  const bw = new Set(b.split(' '))
  return aw.length >= 3 && aw.filter((word) => word.length > 2 && bw.has(word)).length >= Math.ceil(aw.length * 0.8)
}
async function html(url, tries = 2) {
  let last
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: { Accept: 'text/html' },
      })
      if (!response.ok || !new URL(response.url).hostname.endsWith('cifraclub.com.br'))
        throw Error(`HTTP ${response.status}`)
      const body = await response.text()
      if (body.length > 3_000_000) throw Error('Página maior que 3 MB')
      return body
    } catch (error) {
      last = error
      await sleep(700 * (attempt + 1))
    }
  }
  throw last
}
function rankedSongs(page) {
  const $ = load(page)
  return $('#js-sng_list > li > a')
    .map((i, el) => ({
      rank: i + 1,
      group: 'Ranking gospel semanal',
      title: $(el).find('strong').first().text().trim(),
      artist: $(el).find('.top-txt_secondary').first().text().trim(),
      url: new URL($(el).attr('href'), BASE).href,
    }))
    .get()
    .filter((song) => song.title && song.artist && /^https:\/\/www\.cifraclub\.com\.br\/[a-z0-9-]+\/[a-z0-9-]+\/$/.test(song.url))
}
function artistSongs(page, slug, artist) {
  const $ = load(page)
  const seen = new Set()
  return $('a')
    .map((_, el) => ({ href: $(el).attr('href'), text: $(el).text().trim() }))
    .get()
    .filter((entry) => new RegExp(`^/${slug}/[a-z0-9-]+/$`).test(entry.href || ''))
    .filter((entry) => {
      if (seen.has(entry.href)) return false
      seen.add(entry.href)
      return true
    })
    .map((entry, i) => ({
      artist,
      title: entry.text.replace(/^\d{1,3}(?=\D)/, '').trim(),
      url: new URL(entry.href, BASE).href,
      artistPosition: i + 1,
    }))
    .filter((song) => song.title)
}
function chosen(list, positions, group, used) {
  const result = []
  for (const position of positions) {
    const song = list[position - 1]
    if (!song || used.has(song.url)) continue
    used.add(song.url)
    result.push({ ...song, group })
  }
  return result
}
function words(text) {
  return text.match(/[\p{L}]+(?:[’'-][\p{L}]+)*/gu) || []
}
function excerpt(page, title, rank, second = false) {
  const $ = load(page)
  let plain = $('pre').first().text()
  if (!plain) {
    const article = $('article [data-chord-content]').first().clone()
    article.find('br').replaceWith('\n')
    article.find('p').after('\n')
    plain = article.text()
  }
  if (!plain) return null
  const titleWords = new Set(coreTitle(title).split(' ').filter((word) => word.length > 3))
  const candidates = []
  const shortLines = []
  const seen = new Set()
  for (const raw of plain.split('\n')) {
    const line = raw.replace(/\[[^\]]+\]/g, ' ').replace(/[\u0332_]/g, '').replace(/\s+/g, ' ').trim()
    if (!line || /^(?:[EADGB][|]|Parte \d|[A-G][#b]?(?:m|\d|sus|add|maj|dim|aug)?(?:\s+[A-G][#b]?\S*){1,})/.test(line)) continue
    const tokens = words(line)
    if (tokens.length >= 2 && tokens.length <= 18 && !/[|]{2,}/.test(line)) shortLines.push(tokens)
    if (tokens.length < 6 || tokens.length > 18 || line.length < 20 || /[|]{2,}/.test(line)) continue
    const phrase = tokens.slice(0, 6).join(' ')
    const phraseWords = normalized(phrase).split(' ')
    const titleOverlap = phraseWords.filter((word) => titleWords.has(word)).length
    if (titleOverlap >= 2 || seen.has(normalized(phrase))) continue
    seen.add(normalized(phrase))
    candidates.push(phrase)
  }
  if (!candidates.length) {
    for (let i = 0; i < shortLines.length; i++) {
      const combined = [...shortLines[i]]
      for (let j = i + 1; j < Math.min(i + 4, shortLines.length) && combined.length < 6; j++)
        combined.push(...shortLines[j])
      if (combined.length < 6) continue
      const phrase = combined.slice(0, 6).join(' ')
      const titleOverlap = normalized(phrase).split(' ').filter((word) => titleWords.has(word)).length
      if (titleOverlap >= 2 || seen.has(normalized(phrase))) continue
      seen.add(normalized(phrase))
      candidates.push(phrase)
    }
  }
  if (!candidates.length) return null
  const first = (rank * 17 + 11) % candidates.length
  return candidates[(first + (second ? Math.max(1, Math.floor(candidates.length / 2)) : 0)) % candidates.length]
}
async function concurrent(items, workers, task) {
  let cursor = 0
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        await task(items[index], index)
      }
    }),
  )
}
async function save(data) {
  await writeFile(OUT, JSON.stringify(data, null, 2), 'utf8')
}
function summarize(rows) {
  const tested = rows.filter((row) => row.excerpt && !row.error)
  return {
    total: rows.length,
    tested: tested.length,
    top1: tested.filter((row) => row.top1).length,
    top5: tested.filter((row) => row.top5).length,
    missed: tested.filter((row) => !row.top5).length,
    noExcerpt: rows.filter((row) => !row.excerpt).length,
    providerError: rows.filter((row) => row.excerpt && row.error).length,
  }
}
function summarizeTwo(rows) {
  return {
    total: rows.length,
    secondAvailable: rows.filter((row) => row.secondExcerpt).length,
    secondTop5: rows.filter((row) => row.secondTop5).length,
    eitherTop5: rows.filter((row) => row.top5 || row.secondTop5).length,
    missedBoth: rows.filter((row) => !row.top5 && !row.secondTop5).length,
    secondError: rows.filter((row) => row.secondExcerpt && row.secondError).length,
  }
}
function markdown(data) {
  const main = summarize(data.rows.filter((row) => row.cohort === 'principal'))
  const extra = summarize(data.rows.filter((row) => row.cohort === 'desafio'))
  const all = summarize(data.rows)
  const mainTwo = summarizeTwo(data.rows.filter((row) => row.cohort === 'principal'))
  const extraTwo = summarizeTwo(data.rows.filter((row) => row.cohort === 'desafio'))
  const allTwo = summarizeTwo(data.rows)
  const lines = [
    '# Auditoria de reconhecimento por trechos de louvores',
    '',
    `Data: ${data.startedAt}. Fonte do ranking: [Cifra Club — gospel semanal](${SOURCES.ranking}).`,
    '',
    `O ranking gospel público exibiu ${data.rankingCount} músicas. A amostra principal contém as ${data.rankingCount} do ranking e ${100 - data.rankingCount} títulos adicionais da Harpa Cristã/Voz da Verdade. O grupo de desafio adiciona músicas antigas e menos acessadas das [listas da Harpa](${SOURCES.harpa}) e [Voz da Verdade](${SOURCES.voz}).`,
    '',
    'Cada trecho tem seis palavras consecutivas da página de cifra ou, quando ela contém só tablatura, da aba Letra do Cifra Club. Alguns trechos atravessam uma quebra de linha do mesmo verso. A escolha é determinística, exclui linhas com o título e não foi feita para favorecer resultados. O teste começa **depois da transcrição**: ele mede a busca gratuita por letra e não mede o microfone, o tom ou a precisão do reconhecimento de voz cantada.',
    '',
    '| Amostra | Total | Testados | Música correta em 1º | Correta entre 5 | Não encontrada entre 5 | Sem trecho | Erro do provedor |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| Principal | ${main.total} | ${main.tested} | ${main.top1} | ${main.top5} | ${main.missed} | ${main.noExcerpt} | ${main.providerError} |`,
    `| Desafio | ${extra.total} | ${extra.tested} | ${extra.top1} | ${extra.top5} | ${extra.missed} | ${extra.noExcerpt} | ${extra.providerError} |`,
    `| Total | ${all.total} | ${all.tested} | ${all.top1} | ${all.top5} | ${all.missed} | ${all.noExcerpt} | ${all.providerError} |`,
    '',
    '## Segunda frase da mesma música',
    '',
    `Uma segunda frase diferente foi obtida para ${allTwo.secondAvailable} das ${allTwo.total} músicas. “Encontrada em alguma das duas” significa que o título apareceu entre cinco candidatos em pelo menos uma consulta; essa medida representa a oportunidade de continuar ouvindo, não a precisão do reconhecimento de voz.`,
    '',
    '| Amostra | Segunda frase disponível | Correta na segunda | Encontrada em alguma das duas | Não encontrada nas duas | Erro na segunda |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| Principal | ${mainTwo.secondAvailable} | ${mainTwo.secondTop5} | ${mainTwo.eitherTop5} | ${mainTwo.missedBoth} | ${mainTwo.secondError} |`,
    `| Desafio | ${extraTwo.secondAvailable} | ${extraTwo.secondTop5} | ${extraTwo.eitherTop5} | ${extraTwo.missedBoth} | ${extraTwo.secondError} |`,
    `| Total | ${allTwo.secondAvailable} | ${allTwo.secondTop5} | ${allTwo.eitherTop5} | ${allTwo.missedBoth} | ${allTwo.secondError} |`,
    '',
    '## Cobertura por origem',
    '',
    '| Origem | Músicas | Encontradas na 1ª | Encontradas em alguma das duas |',
    '| --- | ---: | ---: | ---: |',
    ...[...new Set(data.rows.map((row) => row.group))].map((group) => {
      const rows = data.rows.filter((row) => row.group === group)
      return `| ${group} | ${rows.length} | ${rows.filter((row) => row.top5).length} | ${rows.filter((row) => row.top5 || row.secondTop5).length} |`
    }),
    '',
    '“Encontrada” significa que o título correto apareceu entre os cinco primeiros resultados da busca por letra. Outro artista cantando a mesma música conta como acerto de identificação do título. Medleys e versões com título diferente podem ser penalizados por esse critério. A cifra original de cada linha foi verificada como página de origem, mas a abertura automática de todas as cifras dentro do app não faz parte desta auditoria.',
    '',
    '## Resultado por música',
    '',
    '| Nº | Grupo | Música / artista | 1º resultado | 1ª frase | 2ª frase |',
    '| ---: | --- | --- | --- | --- | --- |',
  ]
  for (const [index, row] of data.rows.entries()) {
    const outcome = !row.excerpt
      ? 'Sem trecho'
      : row.error
        ? 'Erro do provedor'
        : row.top1
          ? 'Acerto em 1º'
          : row.top5
            ? 'Acerto entre 5'
            : 'Não encontrou'
    const secondOutcome = !row.secondExcerpt
      ? 'Sem 2º trecho'
      : row.secondError
        ? 'Erro'
        : row.secondTop5
          ? 'Encontrou'
          : 'Não encontrou'
    lines.push(`| ${index + 1} | ${row.group} | [${row.title.replace(/\|/g, '/')} — ${row.artist.replace(/\|/g, '/')}](${row.url}) | ${(row.hits?.[0]?.title || '—').replace(/\|/g, '/')} | ${outcome} | ${secondOutcome} |`)
  }
  lines.push('', `Os trechos usados e até cinco candidatos de cada consulta estão em [dados da auditoria](./audit-louvores-2026-09-15.json).`)
  return lines.join('\n') + '\n'
}

await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true })
const startedAt = new Date().toISOString()
const [rankPage, harpaPage, vozPage] = await Promise.all([
  html(SOURCES.ranking),
  html(SOURCES.harpa),
  html(SOURCES.voz),
])
const ranked = rankedSongs(rankPage)
const harpa = artistSongs(harpaPage, 'harpa-crista', 'Harpa Cristã')
const voz = artistSongs(vozPage, 'voz-da-verdade', 'Voz da Verdade')
if (ranked.length !== 90 || harpa.length < 600 || voz.length < 300)
  throw Error(`Fontes inesperadas: ranking=${ranked.length}, Harpa=${harpa.length}, Voz=${voz.length}`)
const used = new Set(ranked.map((song) => song.url))
const mainHard = [
  ...chosen(harpa, [20, 145, 270, 395, 520], 'Harpa adicional', used),
  ...chosen(voz, [8, 35, 90, 180, 310], 'Voz adicional', used),
]
const extraHard = [
  ...chosen(harpa, [35, 90, 180, 240, 330, 420, 475, 560, 600, 630], 'Harpa pouco usual', used),
  ...chosen(voz, [25, 55, 110, 140, 205, 235, 270, 320, 345, 375], 'Voz menos acessada', used),
]
const rows = [
  ...ranked.map((song) => ({ ...song, cohort: 'principal' })),
  ...mainHard.map((song) => ({ ...song, cohort: 'principal' })),
  ...extraHard.map((song) => ({ ...song, cohort: 'desafio' })),
]
if (rows.filter((row) => row.cohort === 'principal').length !== 100 || rows.length !== 120)
  throw Error(`A seleção não fechou 100 + 20: ${rows.length}`)
const data = process.argv.includes('--resume')
  ? JSON.parse(await readFile(OUT, 'utf8'))
  : { startedAt, sources: SOURCES, rankingCount: ranked.length, rows }
if (data.rows.length !== rows.length || data.rows.some((row, i) => row.url !== rows[i].url))
  throw Error('A amostra salva não corresponde às listas atuais; crie uma nova auditoria.')
await save(data)
console.log(`Amostra: ${rows.length} músicas (${ranked.length} ranking, 10 adicionais, 20 desafio).`)
let done = 0
await concurrent(data.rows.filter((row) => !row.excerpt), 3, async (row) => {
  try {
    const rank = data.rows.indexOf(row) + 1
    row.excerpt = excerpt(await html(row.url), row.title, rank)
    if (!row.excerpt) {
      const lyricUrl = new URL('letra/', row.url).href
      row.excerpt = excerpt(await html(lyricUrl), row.title, rank)
      if (row.excerpt) row.lyricSourceUrl = lyricUrl
    }
  } catch (error) {
    row.excerptError = String(error.message || error)
    row.excerpt = null
  }
  done++
  if (done % 10 === 0) {
    await save(data)
    console.log(`Trechos novos: ${done}, disponíveis=${data.rows.filter((r) => r.excerpt).length}`)
  }
  await sleep(180)
})
await save(data)
done = 0
await concurrent(data.rows.filter((row) => row.excerpt && !row.hits && !row.error), 3, async (row) => {
  try {
    const songs = await searchLyrics(row.excerpt, {}, fetch)
    row.hits = songs.slice(0, 5).map(({ title, artist }) => ({ title, artist }))
    row.top1 = Boolean(songs[0] && titleMatches(row.title, songs[0].title))
    row.top5 = songs.slice(0, 5).some((song) => titleMatches(row.title, song.title))
  } catch (error) {
    row.error = String(error.message || error)
  }
  done++
  if (done % 10 === 0) {
    await save(data)
    const result = summarize(data.rows)
    console.log(`Consultas: ${done}, acertos entre 5=${result.top5}, erros=${result.providerError}`)
  }
  await sleep(260)
})
if (process.argv.includes('--second')) {
  done = 0
  await concurrent(data.rows.filter((row) => !row.secondExcerpt), 3, async (row) => {
    try {
      const source = row.lyricSourceUrl || row.url
      const candidate = excerpt(await html(source), row.title, data.rows.indexOf(row) + 1, true)
      row.secondExcerpt = candidate && normalized(candidate) !== normalized(row.excerpt) ? candidate : null
    } catch (error) {
      row.secondExcerptError = String(error.message || error)
    }
    done++
    if (done % 20 === 0) {
      await save(data)
      console.log(`Segundos trechos: ${done}, disponíveis=${data.rows.filter((r) => r.secondExcerpt).length}`)
    }
    await sleep(180)
  })
  await save(data)
  done = 0
  await concurrent(data.rows.filter((row) => row.secondExcerpt && !row.secondHits && !row.secondError), 3, async (row) => {
    try {
      const songs = await searchLyrics(row.secondExcerpt, {}, fetch)
      row.secondHits = songs.slice(0, 5).map(({ title, artist }) => ({ title, artist }))
      row.secondTop5 = songs.slice(0, 5).some((song) => titleMatches(row.title, song.title))
    } catch (error) {
      row.secondError = String(error.message || error)
    }
    done++
    if (done % 20 === 0) {
      await save(data)
      const result = summarizeTwo(data.rows)
      console.log(`Segundas consultas: ${done}, encontrados em alguma=${result.eitherTop5}`)
    }
    await sleep(260)
  })
}
data.finishedAt = new Date().toISOString()
await save(data)
await writeFile(REPORT, markdown(data), 'utf8')
console.log(`Concluído: ${JSON.stringify(summarize(data.rows))}`)
