import type { Pitch } from './notes'
export interface Evidence {
  pc: number
  time: number
  duration: number
  weight: number
  phraseEnd?: boolean
}
export class ChromaHistory {
  events: Evidence[] = []
  private last = 0
  private phraseMarked = false
  add(pitch: Pitch | null, time: number) {
    this.events = this.events.filter((e) => time - e.time < 15000)
    if (pitch) {
      const duration = this.last ? Math.min(100, time - this.last) : 50
      this.events.push({ pc: pitch.pc, time, duration, weight: duration * pitch.confidence })
      this.last = time
      this.phraseMarked = false
    } else if (!this.phraseMarked && this.last && time - this.last > 350) {
      const last = this.events.at(-1)
      if (last) {
        last.weight *= 1.3
        last.phraseEnd = true
      }
      this.phraseMarked = true
      this.last = 0
    }
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400)
  }
  vector(time: number, window: number) {
    const v = Array<number>(12).fill(0)
    for (const e of this.events) if (time - e.time <= window) v[e.pc] += e.weight
    const total = v.reduce((a, b) => a + b, 0)
    return v.map((n) => (total ? n / total : 0))
  }
  get duration() {
    return this.events.reduce((sum, e) => sum + e.duration, 0)
  }
}
