import type { SongChart, SongCandidate } from './types'
export const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
export function mergeSongCandidates(current: SongCandidate[], incoming: SongCandidate[]) {
  const merged = new Map<string, SongCandidate>()
  for (const song of [...current, ...incoming]) {
    const key = `${normalize(song.title)}|${normalize(song.artist)}`
    const previous = merged.get(key)
    merged.set(key, previous ? { ...previous, matchCount: (previous.matchCount ?? 1) + 1 } : { ...song, matchCount: song.matchCount ?? 1 })
  }
  return [...merged.values()].sort((a, b) => (b.matchCount ?? 1) - (a.matchCount ?? 1))
}
const KEY = 'keyradar.charts.v1'
function validChart(value: unknown): value is SongChart {
  if (!value || typeof value !== 'object') return false
  const c = value as SongChart
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.song?.title === 'string' &&
    typeof c.song?.artist === 'string' &&
    (c.originalKey === null ||
      (Number.isInteger(c.originalKey) && c.originalKey >= 0 && c.originalKey < 12)) &&
    Number.isInteger(c.capo) &&
    c.capo >= 0 &&
    c.capo <= 12 &&
    typeof c.sourceUrl === 'string' &&
    /^https:\/\/www\.cifraclub\.com\.br\/[a-z0-9-]+\/[a-z0-9-]+\/(?:[a-z0-9-]+\.html)?$/.test(
      c.sourceUrl,
    ) &&
    Array.isArray(c.sections) &&
    c.sections.length > 0 &&
    c.sections.length <= 200 &&
    c.sections.every(
      (s) =>
        s &&
        typeof s.id === 'string' &&
        typeof s.name === 'string' &&
        Array.isArray(s.lines) &&
        s.lines.every(
          (line) =>
            Array.isArray(line) && line.every((n) => typeof n === 'string' && n.length <= 32),
        ),
    ) &&
    c.sections.reduce((n, s) => n + s.lines.flat().length, 0) <= 2000
  )
}
export function loadCharts(): SongChart[] {
  try {
    const raw = localStorage.getItem(KEY) || '[]'
    if (raw.length > 3_000_000) return []
    const data: unknown = JSON.parse(raw)
    return Array.isArray(data) ? data.filter(validChart).slice(0, 100) : []
  } catch {
    return []
  }
}
export function saveCharts(charts: SongChart[]) {
  if (charts.length > 100)
    throw Error('Seu repertório atingiu 100 cifras. Remova uma para adicionar outra.')
  try {
    localStorage.setItem(KEY, JSON.stringify(charts))
  } catch {
    throw Error(
      'Não foi possível salvar neste navegador. Libere espaço ou desative o modo privado.',
    )
  }
}
export function matchingCharts(charts: SongChart[], song: SongCandidate) {
  return charts.filter(
    (c) =>
      c.song.id === song.id ||
      (normalize(c.song.title) === normalize(song.title) &&
        normalize(c.song.artist) === normalize(song.artist)),
  )
}
export function searchLibrary(charts: SongChart[], query: string) {
  const q = normalize(query),
    words = q.split(' ').filter((w) => w.length > 2)
  if (!q) return charts
  return charts
    .map((chart) => {
      const title = normalize(chart.song.title + ' ' + chart.song.artist),
        lyrics = normalize(chart.searchText || '')
      const score = title.includes(q)
        ? 2
        : lyrics.includes(q)
          ? 1
          : words.length >= 3 && words.every((w) => (title + ' ' + lyrics).includes(w))
            ? 0.5
            : 0
      return { chart, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.chart)
}

