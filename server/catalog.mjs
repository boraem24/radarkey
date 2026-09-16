import { load } from 'cheerio'
const BASE = 'https://www.cifraclub.com.br'
export function chartUrl(input) {
  let url
  try {
    url = new URL(input)
  } catch {
    throw Error('Cole um link de cifra válido do Cifra Club.')
  }
  if (
    url.protocol !== 'https:' ||
    !['www.cifraclub.com.br', 'cifraclub.com.br'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !/^\/[a-z0-9-]+\/[a-z0-9-]+\/(?:[a-z0-9-]+\.html)?$/.test(url.pathname)
  )
    throw Error('Use o link HTTPS de uma música no Cifra Club.')
  return BASE + url.pathname
}
export async function fetchText(url, fetcher = fetch, max = 3_000_000) {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
    headers: { Accept: 'text/html,application/json' },
  })
  if (!response.ok)
    throw Error(
      response.status === 404
        ? 'Esta cifra não foi encontrada no catálogo.'
        : 'O catálogo está indisponível agora. Tente novamente em instantes.',
    )
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) throw Error('A resposta do catálogo excedeu o limite.')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  return Buffer.concat(chunks).toString('utf8')
}
export async function searchCatalog(query, fetcher = fetch) {
  const url = new URL('https://solr.sscdn.co/cc/c7/')
  url.search = new URLSearchParams({ q: query, wt: 'json', rows: '40' }).toString()
  const data = JSON.parse(await fetchText(url, fetcher, 500000))
  if (!Array.isArray(data.response?.docs))
    throw Error('O formato da busca mudou. Você ainda pode colar o link da cifra.')
  const seen = new Set()
  return data.response.docs
    .filter(
      (d) =>
        String(d.tipo) === '2' &&
        typeof d.art === 'string' &&
        typeof d.txt === 'string' &&
        /^[a-z0-9-]+$/.test(d.dns) &&
        /^[a-z0-9-]+$/.test(d.url),
    )
    .map((d) => {
      const sourceUrl = `${BASE}/${d.dns}/${d.url}/`
      return {
        id: sourceUrl,
        title: d.txt.slice(0, 180),
        artist: d.art.slice(0, 180),
        source: 'cifraclub',
        sourceUrl,
      }
    })
    .filter((d) => {
      if (seen.has(d.id)) return false
      seen.add(d.id)
      return true
    })
    .slice(0, 24)
}
function flightText($) {
  let text = ''
  $('script').each((_, e) => {
    const match = /^self\.__next_f\.push\((\[.*\])\)$/.exec($(e).text())
    if (match) {
      try {
        const v = JSON.parse(match[1])
        if (typeof v[1] === 'string') text += v[1]
      } catch {
        /* no executable script evaluation */
      }
    }
  })
  return text
}
const pc = (n) => {
  const m = /^([A-G])([#b]?)$/.exec(n || '')
  return m
    ? ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] +
        (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) +
        12) %
        12
    : null
}
export function parseCatalog(html, sourceUrl) {
  sourceUrl = chartUrl(sourceUrl)
  const $ = load(html)
  const schemas = $('script[type="application/ld+json"]')
    .map((_, el) => {
      try {
        return JSON.parse($(el).text())
      } catch {
        return null
      }
    })
    .get()
  const title = schemas.find((s) => s['@type'] === 'MusicComposition')?.name
  const artist = schemas.find((s) => s.byArtist?.name)?.byArtist.name
  if (!title || !artist || !$('pre').length)
    throw Error('Não foi possível ler os acordes desta página. Abra a fonte ou tente outra versão.')
  const pre = $('pre').first().clone()
  pre.find('script,style').remove()
  pre.find('b').each((_, e) => {
    const chord = $(e).attr('data-chord-name') || $(e).text().trim()
    $(e).replaceWith(`\uE000${chord}\uE001`)
  })
  pre.find('br').replaceWith('\n')
  const sections = []
  let current = { id: 'section-0', name: 'Música', lines: [] }
  const push = () => {
    if (current.lines.length) sections.push(current)
  }
  for (const line of pre.text().split(/\r?\n/)) {
    const heading = /\[([^\]\n]{1,60})\]/.exec(line)
    if (heading) {
      push()
      current = { id: `section-${sections.length}`, name: heading[1], lines: [] }
    }
    const chords = [...line.matchAll(/\uE000([^\uE001]{1,32})\uE001/g)].map((m) => m[1])
    if (
      chords.some(
        (c) =>
          !/^[A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M|ø|°|\+|-|\d|[#b]|\([\d,#b+\-/]+\))*(?:\/[A-G][#b]?)?$/.test(
            c,
          ),
      )
    )
      throw Error(
        'Esta cifra contém uma notação ainda não suportada. Abra a fonte para conferir ou escolha outra versão.',
      )
    if (chords.length) {
      const repeat = /(?:\(|\s)([2-8])\s*x\)?\s*$/i.exec(line)
      for (let i = 0; i < Number(repeat?.[1] || 1); i++) current.lines.push(chords)
    }
  }
  push()
  // A lone Intro label cannot describe the rest of an unsectioned chart.
  if (sections.length === 1 && /^intro/i.test(sections[0].name) && sections[0].lines.length > 3)
    sections[0].name = 'Sequência completa'
  const count = sections.reduce((n, s) => n + s.lines.flat().length, 0)
  if (!count || count > 2000)
    throw Error('Esta versão não contém uma sequência de acordes compatível. Escolha outra cifra.')
  const flight = flightText($)
  const configMatch = /"config":(\{[^{}]{0,600}\})/.exec(flight)
  let config = {}
  try {
    config = JSON.parse(configMatch?.[1] || '{}')
  } catch {
    /* metadata can change */
  }
  const originalKey = pc(config.keyShape)
  const capo =
    Number.isInteger(config.capo) && config.capo >= 0 && config.capo <= 12 ? config.capo : 0
  const basePath = new URL(sourceUrl).pathname.split('/').slice(0, 3).join('/') + '/'
  const versions = [{ name: 'Principal', url: BASE + basePath }]
  $('a[href]').each((_, e) => {
    const href = $(e).attr('href')
    const name = $(e).text().trim()
    if (
      href?.startsWith(basePath) &&
      /^.{1,50}$/.test(name) &&
      /simplificada|versão|versao/i.test(name)
    ) {
      try {
        const url = chartUrl(new URL(href, BASE).href)
        if (!versions.some((v) => v.url === url)) versions.push({ name, url })
      } catch {
        /* non-chart link */
      }
    }
  })
  const name =
    versions.find((v) => v.url === sourceUrl)?.name ||
    (sourceUrl.endsWith('simplificada.html') ? 'Simplificada' : 'Versão do catálogo')
  if (!versions.some((v) => v.url === sourceUrl)) versions.push({ name, url: sourceUrl })
  return {
    chart: {
      id: sourceUrl,
      song: {
        id: BASE + basePath,
        title: String(title).slice(0, 180),
        artist: String(artist).slice(0, 180),
        source: 'cifraclub',
        sourceUrl: BASE + basePath,
      },
      name,
      originalKey,
      capo,
      sections,
      sourceUrl,
      searchText: '',
      savedAt: 0,
    },
    versions: versions.slice(0, 12),
  }
}
export async function getChart(url, fetcher = fetch) {
  const safe = chartUrl(url)
  return parseCatalog(await fetchText(safe, fetcher), safe)
}
