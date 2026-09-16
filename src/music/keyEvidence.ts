import type { Evidence } from './chroma'
import type { KeyCandidate } from './keyDetector'
import { MAJOR_PROFILE, MINOR_PROFILE, correlation } from './keyProfiles'
import { majorScale, mod } from './notes'
import { MINOR_SCALE_STEPS } from './chordTheory'
export interface KeyEvidence {
  level: 'checking' | 'ambiguous' | 'strong'
  explanation: string
}
export function scoreMajorChroma(chroma: number[], root: number) {
  const scale = majorScale(root)
  const profile = Array.from({ length: 12 }, (_, pc) => MAJOR_PROFILE[mod(pc - root)])
  return (
    correlation(chroma, profile) -
    1.8 * chroma.reduce((sum, n, pc) => sum + (scale.includes(pc) ? 0 : n), 0)
  )
}
export function scoreMinorChroma(chroma: number[], root: number) {
  const scale = MINOR_SCALE_STEPS.map((n) => mod(root + n))
  const profile = Array.from({ length: 12 }, (_, pc) => MINOR_PROFILE[mod(pc - root)])
  return correlation(chroma, profile) - 1.8 * chroma.reduce((sum, n, pc) => sum + (scale.includes(pc) ? 0 : n), 0)
}
function profile(events: Evidence[]) {
  const vector = Array<number>(12).fill(0)
  for (const event of events) vector[event.pc] += event.weight
  const total = vector.reduce((sum, n) => sum + n, 0)
  return vector.map((n) => (total ? n / total : 0))
}
export function assessKeyEvidence(
  events: Evidence[],
  time: number,
  selected: KeyCandidate,
  candidates: KeyCandidate[],
): KeyEvidence {
  const checking: KeyEvidence = {
    level: 'checking',
    explanation: 'Tom fixado · continue a frase para conferir.',
  }
  const recent = events.filter((e) => time - e.time <= 12000)
  if (!recent.length || time - recent.at(-1)!.time > 1000)
    return { level: 'checking', explanation: 'Último tom mantido · aguardando mais voz.' }
  const duration = recent.reduce((sum, e) => sum + e.duration, 0)
  if (duration < 4000) return checking
  const chroma = profile(recent),
    scale = majorScale(selected.root)
  const fit = chroma.reduce((sum, n, pc) => sum + (scale.includes(pc) ? n : 0), 0)
  const alternative = candidates.find((c) => c.root !== selected.root)
  if (candidates[0]?.root !== selected.root || fit < 0.85)
    return { level: 'ambiguous', explanation: 'A melodia ainda não confirma o tom fixado.' }
  if (!alternative) return checking
  const alternativeScale = majorScale(alternative.root)
  const distinguishing = chroma.reduce(
    (sum, n, pc) => sum + (scale.includes(pc) && !alternativeScale.includes(pc) ? n : 0),
    0,
  )
  if (selected.confidence - alternative.confidence < 0.12 || distinguishing < 0.05)
    return { level: 'ambiguous', explanation: 'Este trecho ainda combina com mais de um tom.' }
  if (
    duration < 6500 ||
    chroma.filter((n) => n > 0.025).length < 5 ||
    fit < 0.93 ||
    selected.confidence < 0.45
  )
    return checking
  // Two non-overlapping excerpts must independently support the same tonic.
  const excerpts = [
    recent.filter((e) => time - e.time <= 4000),
    recent.filter((e) => time - e.time > 4000),
  ]
  for (const excerpt of excerpts) {
    if (excerpt.reduce((sum, e) => sum + e.duration, 0) < 1500) return checking
    const vector = profile(excerpt)
    if (vector.filter((n) => n > 0.025).length < 3) return checking
    const ranked = Array.from({ length: 12 }, (_, root) => ({
      root,
      score: scoreMajorChroma(vector, root),
    })).sort((a, b) => b.score - a.score)
    if (ranked[0].root !== selected.root || ranked[0].score - ranked[1].score < 0.08)
      return checking
  }
  return { level: 'strong', explanation: 'Dois trechos concordam e as notas sustentam este tom.' }
}
