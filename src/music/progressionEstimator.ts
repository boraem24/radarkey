import type { Evidence } from './chroma'
import { chordForDegree, PROGRESSIONS } from './chordTheory'
export interface Progression {
  roman: string[]
  chords: string[]
  confidence: number
}
// Heuristic template alignment, not polyphonic chord detection. No assumed tempo.
export function estimateProgression(
  events: Evidence[],
  root: number,
  keyConfidence: number,
): Progression | null {
  if (keyConfidence < 0.35 || events.length < 80) return null
  const end = events.at(-1)!.time,
    start = events[0].time
  if (end - start < 6500) return null
  const ranked = PROGRESSIONS.map((degrees) => {
    let best = 0
    for (const span of [8000, 12000, 15000]) {
      const beginning = Math.max(start, end - span),
        bins = degrees.map(() => ({ hit: 0, total: 0, count: 0, pcs: new Set<number>() }))
      for (const event of events) {
        if (event.time < beginning) continue
        const i = Math.min(
          degrees.length - 1,
          Math.floor(((event.time - beginning) / (end - beginning + 1)) * degrees.length),
        )
        const chord = chordForDegree(root, degrees[i])
        const w = event.weight * (event.phraseEnd ? 1.2 : 1)
        bins[i].total += w
        bins[i].count++
        bins[i].pcs.add(event.pc)
        if (chord.notes.includes(event.pc)) bins[i].hit += w
      }
      if (bins.some((b) => b.count < 8 || b.pcs.size < 2)) continue
      best = Math.max(best, bins.reduce((sum, b) => sum + b.hit / b.total, 0) / bins.length)
    }
    return { degrees, score: best }
  }).sort((a, b) => b.score - a.score)
  const best = ranked[0],
    gap = best.score - ranked[1].score
  if (best.score < 0.78 || gap < 0.06) return null
  const chords = best.degrees.map((d) => chordForDegree(root, d))
  return {
    roman: chords.map((c) => c.roman),
    chords: chords.map((c) => c.name),
    confidence: Math.min(0.75, best.score * keyConfidence * (0.5 + Math.min(0.5, gap * 3))),
  }
}
