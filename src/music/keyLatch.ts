import type { KeyCandidate } from './keyDetector'
// Acquire quickly, then keep the chosen key through rests and competing short phrases.
export class KeyLatch {
  selected: KeyCandidate | undefined
  private acquiredAt = 0
  private challenger = -1
  private challengerSince = 0
  private lastEvidence = 0
  update(
    candidates: KeyCandidate[],
    duration: number,
    diversity: number,
    time: number,
    voiced: boolean,
  ) {
    if (!voiced) {
      if (time - this.lastEvidence > 800) this.challenger = -1
      return this.selected
    }
    if (time - this.lastEvidence > 800) this.challenger = -1
    this.lastEvidence = time
    const best = candidates[0]
    if (!best) return this.selected
    if (!this.selected) {
      if (duration < 800 || diversity < 3)
        return undefined
      this.selected = { ...best }
      this.acquiredAt = time
      return this.selected
    }
    const current = candidates.find((c) => c.root === this.selected!.root)!
    this.selected = { ...current }
    if (
      best.root === current.root ||
      time - this.acquiredAt < 5000 ||
      best.score - current.score < 0.18 ||
      best.confidence < 0.25
    ) {
      this.challenger = -1
      return this.selected
    }
    if (this.challenger !== best.root) {
      this.challenger = best.root
      this.challengerSince = time
    }
    if (time - this.challengerSince >= 3000) {
      this.selected = { ...best }
      this.acquiredAt = time
      this.challenger = -1
    }
    return this.selected
  }
}


