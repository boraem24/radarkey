import { makePitch, frequencyToMidi, midiToFrequency } from '../music/notes'
import type { Pitch } from '../music/notes'
export class PitchSmoother {
  private recent: number[] = []
  private candidate = -1
  private since = 0
  private accepted = -1
  private last = 0
  reset() {
    this.recent = []
    this.candidate = -1
    this.accepted = -1
    this.since = 0
    this.last = 0
  }
  push(hz: number, confidence: number, time: number): Pitch | null {
    // A distant phone voice can have lower YIN confidence; temporal smoothing
    // still rejects isolated noise, so do not discard every quiet frame.
    if (!hz || confidence < 0.72) {
      if (time - this.last > 250) this.reset()
      return null
    }
    if (this.last && time - this.last > 250) this.reset()
    this.last = time
    this.recent.push(frequencyToMidi(hz))
    if (this.recent.length > 3) this.recent.shift()
    const sorted = [...this.recent].sort((a, b) => a - b),
      median = sorted[Math.floor(sorted.length / 2)]
    let note = Math.round(median)
    if (this.accepted >= 0 && Math.abs(median - this.accepted) < 0.65) note = this.accepted
    if (note !== this.candidate) {
      this.candidate = note
      this.since = time
    }
    if (time - this.since < 80 || this.recent.length < 3) return null
    this.accepted = note
    const result = makePitch(midiToFrequency(median), confidence, time)
    return {
      ...result,
      midiNumber: note,
      noteName: makePitch(midiToFrequency(note), confidence, time).noteName,
      pc: ((note % 12) + 12) % 12,
      pitchClass: makePitch(midiToFrequency(note), confidence, time).pitchClass,
      centsDeviation: 100 * (median - note),
    }
  }
}
