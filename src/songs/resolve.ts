import type { SongCandidate } from './types'
import { normalize } from './library'
export function rankCharts(song: SongCandidate, charts: SongCandidate[]) {
  const title = normalize(song.title),
    artist = normalize(song.artist)
  return charts
    .filter((c) => c.sourceUrl)
    .map((chart) => {
      const chartTitle = normalize(chart.title),
        chartArtist = normalize(chart.artist)
      const titleScore =
        chartTitle === title ? 5 : chartTitle.includes(title) || title.includes(chartTitle) ? 2 : 0
      const artistScore =
        chartArtist === artist
          ? 4
          : chartArtist.includes(artist) || artist.includes(chartArtist)
            ? 1
            : 0
      return { chart, score: titleScore + artistScore }
    })
    .filter((v) => v.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((v) => v.chart)
}
export function lyricSearchLink(phrase: string) {
  const url = new URL('https://www.google.com/search')
  url.search = new URLSearchParams({ q: `"${phrase}" música letra cifra` }).toString()
  return url.href
}
