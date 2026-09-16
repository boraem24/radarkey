import { assessKeyEvidence, scoreMajorChroma, scoreMinorChroma } from './keyEvidence'
import type { KeyEvidence } from './keyEvidence'
import { KeyLatch } from './keyLatch'
import { ChromaHistory } from './chroma'

import { KEY_NAMES, mod } from './notes'
export interface KeyCandidate {
  root: number
  name: string
  mode: 'major' | 'minor'
  confidence: number
  score: number
}
export interface KeyResult {
  selected?: KeyCandidate
  relative?: KeyCandidate
  evidence?: KeyEvidence
  candidates: KeyCandidate[]
  status: 'analyzing' | 'probable' | 'stable'
  chroma: number[]
  duration: number
}
export class KeyDetector {
  private latch = new KeyLatch()
  detect(history: ChromaHistory, time: number): KeyResult {
    const vectors = [2000, 5000, 15000].map((w) => history.vector(time, w))
    const chroma = vectors[2],
      diversity = chroma.filter((n) => n > 0.025).length
    const candidates = Array.from({ length: 24 }, (_, index) => {
      const root = index % 12, mode: 'major' | 'minor' = index < 12 ? 'major' : 'minor'
      const score = vectors.reduce(
        (sum, v, i) => sum + [0.1, 0.25, 0.65][i] * (mode === 'major' ? scoreMajorChroma(v, root) : scoreMinorChroma(v, root)),
        0,
      )
      return { root, name: KEY_NAMES[root], mode, score, confidence: 0 }
    }).sort((a, b) => b.score - a.score)
    const evidence =
      Math.min(1, history.duration / 8000) * Math.min(1, Math.max(0, diversity - 1) / 5)
    const weights = candidates.map((c) => Math.exp((c.score - candidates[0].score) * 5)),
      sum = weights.reduce((a, b) => a + b, 0)
    candidates.forEach(
      (c, i) => (c.confidence = (1 - evidence) / candidates.length + (evidence * weights[i]) / sum),
    )
    const voiced = time - (history.events.at(-1)?.time ?? -Infinity) <= 200
    const selected = this.latch.update(candidates, history.duration, diversity, time, voiced)
    const relative = selected
      ? candidates.find((candidate) =>
          candidate.mode !== selected.mode &&
          candidate.root === mod(selected.root + (selected.mode === 'major' ? -3 : 3)) &&
          Math.abs(candidate.confidence - selected.confidence) < 0.12,
        )
      : undefined
    return {
      selected,
      relative,
      evidence: selected
        ? assessKeyEvidence(history.events, time, selected, candidates)
        : undefined,
      candidates: selected ? candidates : [],
      status: selected ? 'stable' : 'analyzing',
      chroma,
      duration: history.duration,
    }
  }
}

