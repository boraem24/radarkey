import { describe, it, expect } from 'vitest'
import { frequencyToMidi, midiToNote, majorScale, NOTES, transpose } from '../src/music/notes'
import { detectPitch } from '../src/audio/pitchDetector'
import { PitchSmoother } from '../src/audio/pitchSmoother'
describe('musical fundamentals', () => {
  it.each([
    [440, 69, 'A4'],
    [261.63, 60, 'C4'],
    [392, 67, 'G4'],
  ])('%s Hz maps to MIDI/note', (hz, midi, name) => {
    expect(frequencyToMidi(Number(hz))).toBeCloseTo(Number(midi), 2)
    expect(midiToNote(Number(midi))).toBe(name)
  })
  it('builds scales and transposes', () => {
    expect(majorScale(7).map((n) => NOTES[n])).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#'])
    expect(majorScale(9).map((n) => NOTES[n])).toEqual(['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'])
    expect(transpose(11, 2)).toBe(1)
  })
})
describe('YIN', () => {
  for (const rate of [44100, 48000])
    for (const hz of [65.41, 110, 261.63, 293.66, 329.63, 392, 440, 880])
      it(`${hz}Hz at ${rate}`, () => {
        const signal = Float32Array.from(
          { length: 4096 },
          (_, i) =>
            0.3 * Math.sin((2 * Math.PI * hz * i) / rate) +
            0.12 * Math.sin((4 * Math.PI * hz * i) / rate),
        )
        const p = detectPitch(signal, rate)
        expect(Math.abs(1200 * Math.log2(p.frequency / hz))).toBeLessThan(8)
        expect(p.confidence).toBeGreaterThan(0.9)
      })
  it('rejects silence, noise and clipping', () => {
    expect(detectPitch(new Float32Array(4096), 48000).frequency).toBe(0)
    let seed = 42
    const noise = Float32Array.from({ length: 4096 }, () => {
      seed = (1664525 * seed + 1013904223) >>> 0
      return seed / 2 ** 32 - 0.5
    })
    expect(detectPitch(noise, 48000).frequency).toBe(0)
    expect(detectPitch(new Float32Array(4096).fill(1), 48000).frequency).toBe(0)
  })
  it('rejects short pitch excursions and resets after silence', () => {
    const s = new PitchSmoother()
    for (let t = 0; t <= 400; t += 50) s.push(392, 0.98, t)
    expect(s.push(415.3, 0.98, 450)?.pitchClass).toBe('G')
    expect(s.push(0, 0, 800)).toBeNull()
    expect(s.push(440, 0.99, 850)).toBeNull()
  })
})
import { ChromaHistory } from '../src/music/chroma'
import { KeyDetector } from '../src/music/keyDetector'
import { makePitch, midiToFrequency } from '../src/music/notes'
import { chordForDegree } from '../src/music/chordTheory'
import { estimateProgression } from '../src/music/progressionEstimator'
import { MAJOR_PROFILE, correlation } from '../src/music/keyProfiles'
import { chordForMinorDegree, MINOR_SPELLINGS } from '../src/music/chordTheory'
describe('key inference', () => {
  function run(notes: number[]) {
    const history = new ChromaHistory(),
      detector = new KeyDetector()
    let time = 0
    for (const pc of notes)
      for (let j = 0; j < 10; j++) {
        time += 50
        history.add(makePitch(midiToFrequency(60 + pc), 0.98, time), time)
        detector.detect(history, time)
      }
    return detector.detect(history, time)
  }
  it('does not infer a key from a single held note', () =>
    expect(run(Array(30).fill(0)).candidates).toHaveLength(0))
  it.each([
    [7, [7, 11, 2, 9, 11, 2, 0, 4, 7, 2, 6, 9, 7, 11, 2]],
    [9, [9, 1, 4, 11, 2, 6, 2, 6, 9, 4, 8, 11, 9, 1, 4]],
  ])('supports key %s', (root, notes) => {
    const result = run(notes as number[])
    expect(result.candidates[0].root).toBe(root)
    expect(result.candidates.reduce((s, c) => s + c.confidence, 0)).toBeCloseTo(1)
    expect(result.candidates[0].confidence).toBeLessThan(0.99)
  })
  it('expires evidence', () => {
    const h = new ChromaHistory()
    h.add(makePitch(440, 1, 50), 50)
    h.add(null, 16000)
    expect(h.events).toHaveLength(0)
  })
  it('profile self-correlation', () =>
    expect(correlation(MAJOR_PROFILE, MAJOR_PROFILE)).toBeCloseTo(1))
  it('detects a realistic D minor melody from ChromaHistory', () => {
    const history = new ChromaHistory(), detector = new KeyDetector()
    let time = 0
    for (const degree of [0, 4, 3, 5, 6, 2, 0, 4, 0])
      for (let j = 0; j < (degree === 0 ? 140 : degree === 4 ? 35 : 10); j++) {
        time += 50
        const pitch = makePitch(midiToFrequency(60 + chordForMinorDegree(2, degree).notes[j % 3]), 0.98, time)
        history.add(pitch, time)
      }
      time += 400
      history.add(null, time)
    const result = detector.detect(history, time - 200)
    expect(result.selected?.mode).toBe('minor')
    expect(result.selected?.root).toBe(2)
  })
  it('nomeia corretamente os sete graus menores em duas tônicas', () => {
    for (const root of [0, 5]) {
      const bases = Array.from({ length: 7 }, (_, degree) => chordForMinorDegree(root, degree).name.replace(/(?:m|dim)$/, ''))
      expect(new Set(bases).size).toBe(7)
      expect(bases[0]).toBe(MINOR_SPELLINGS[root][0])
    }
  })
})
describe('harmony', () => {
  it.each([
    [7, ['G', 'D', 'Em', 'C']],
    [9, ['A', 'E', 'F#m', 'D']],
  ])('transposes I V vi IV to %s', (root, names) =>
    expect([0, 4, 5, 3].map((d) => chordForDegree(root as number, d).name)).toEqual(names),
  )
  it('withholds progression with insufficient evidence', () =>
    expect(estimateProgression([], 7, 0.9)).toBeNull())
})
import type { Evidence } from '../src/music/chroma'
it('progression uses melodic evidence and can yield I V vi IV', () => {
  const events: Evidence[] = []
  let time = 0
  for (const degree of [0, 4, 5, 3])
    for (let j = 0; j < 60; j++) {
      time += 50
      events.push({
        pc: chordForDegree(7, degree).notes[Math.floor(j / 10) % 3],
        time,
        duration: 50,
        weight: 50,
      })
    }
  const result = estimateProgression(events, 7, 0.85)
  expect(result?.chords).toEqual(['G', 'D', 'Em', 'C'])
  expect(result!.confidence).toBeLessThanOrEqual(0.75)
})
it('all twelve transposed major melodies produce the expected major candidate', () => {
  const pattern = [7, 11, 2, 9, 11, 2, 0, 4, 7, 2, 6, 9, 7, 11, 2]
  for (let offset = 0; offset < 12; offset++) {
    const h = new ChromaHistory(),
      d = new KeyDetector()
    let time = 0
    for (const pc of pattern)
      for (let j = 0; j < 12; j++) {
        time += 50
        h.add(makePitch(midiToFrequency(60 + ((pc + offset) % 12)), 0.98, time), time)
        d.detect(h, time)
      }
    expect(d.detect(h, time).candidates[0]?.root).toBe((7 + offset) % 12)
  }
})
import { possibleCadence } from '../src/music/possibleCadence'
describe('early possible cadence', () => {
  it('appears immediately for a chosen key, even below 50%', () => {
    expect(possibleCadence(7, 0.49, null)?.chords).toEqual(['G', 'D', 'Em', 'C'])
    expect(possibleCadence(7, 0.2, null)?.chords).toEqual(['G', 'D', 'Em', 'C'])
    expect(possibleCadence(7, 0.501, null)?.chords).toEqual(['G', 'D', 'Em', 'C'])
  })
  it('labels a key-only suggestion without inventing confidence', () => {
    expect(possibleCadence(9, 0.6, null)).toMatchObject({
      chords: ['A', 'E', 'F#m', 'D'],
      basis: 'key',
      confidence: null,
    })
  })
  it('prefers melodic inference when available', () => {
    const inferred = { roman: ['IV', 'V', 'I'], chords: ['C', 'D', 'G'], confidence: 0.64 }
    expect(possibleCadence(7, 0.8, inferred)).toEqual({ ...inferred, basis: 'melody' })
  })
})
import { KeyLatch } from '../src/music/keyLatch'
import { analyzeSamples } from '../src/audio/analyzeSamples'
import type { KeyCandidate } from '../src/music/keyDetector'
const candidate = (root: number, score: number, confidence: number): KeyCandidate => ({
  root,
  name: NOTES[root],
  score,
  confidence,
})
describe('fast stable key selection', () => {
  it('acquires D early and keeps it during a brief competitor and silence', () => {
    const latch = new KeyLatch()
    const d = [candidate(2, 0.8, 0.3), candidate(7, 0.5, 0.2)]
    expect(latch.update(d, 800, 3, 1000, true)?.root).toBe(2)
    const g = [candidate(7, 0.9, 0.65), candidate(2, 0.2, 0.15)]
    expect(latch.update(g, 5000, 5, 7000, true)?.root).toBe(2)
    expect(latch.update(g, 5000, 5, 7250, true)?.root).toBe(2)
    expect(latch.update([], 0, 0, 25000, false)?.root).toBe(2)
  })
  it('switches only after a strong rival persists with live evidence', () => {
    const latch = new KeyLatch()
    latch.update([candidate(2, 0.8, 0.4), candidate(7, 0.4, 0.2)], 1000, 3, 1000, true)
    const g = [candidate(7, 0.9, 0.7), candidate(2, 0.2, 0.1)]
    for (let time = 6500; time < 9500; time += 250)
      expect(latch.update(g, 8000, 6, time, true)?.root).toBe(2)
    expect(latch.update(g, 8000, 6, 9500, true)?.root).toBe(7)
  })
  it('does not label a single note as a key', () => {
    expect(
      new KeyLatch().update([candidate(2, 0.9, 0.8), candidate(7, 0.1, 0.1)], 8000, 1, 8000, true),
    ).toBeUndefined()
  })
})
describe('lower CPU pitch analysis', () => {
  for (const rate of [44100, 48000])
    for (const hz of [65.41, 110, 261.63, 392, 440, 880])
      it(`${hz}Hz / ${rate}`, () => {
        const data = Float32Array.from(
          { length: 4096 },
          (_, i) =>
            0.2 * Math.sin((2 * Math.PI * hz * i) / rate) +
            0.1 * Math.sin((4 * Math.PI * hz * i) / rate),
        )
        const result = analyzeSamples(data, rate)
        expect(Math.abs(1200 * Math.log2(result.frequency / hz))).toBeLessThan(10)
      })
  it('preserves clipping rejection before filtering', () => {
    const data = Float32Array.from(
      { length: 4096 },
      (_, i) => 0.2 * Math.sin((2 * Math.PI * 440 * i) / 48000),
    )
    data[35] = 1
    expect(analyzeSamples(data, 48000).frequency).toBe(0)
  })
  it('accepts a quiet periodic voice without accepting silence', () => {
    const data = Float32Array.from(
      { length: 4096 },
        (_, i) => 0.0025 * Math.sin((2 * Math.PI * 220 * i) / 48000),
    )
    expect(analyzeSamples(data, 48000).frequency).toBeCloseTo(220, 0)
    expect(analyzeSamples(new Float32Array(4096), 48000).frequency).toBe(0)
  })
})
it('allows short vocal transitions but resets a challenger when its advantage disappears', () => {
  const latch = new KeyLatch()
  const d = [candidate(2, 0.8, 0.4), candidate(7, 0.4, 0.2)],
    g = [candidate(7, 0.9, 0.7), candidate(2, 0.2, 0.1)]
  latch.update(d, 1000, 3, 1000, true)
  latch.update(g, 8000, 6, 6500, true)
  latch.update(g, 8000, 6, 6750, true)
  latch.update(g, 8000, 6, 7000, false)
  latch.update(g, 8000, 6, 7250, true)
  latch.update(d, 8000, 6, 7500, true)
  for (let time = 7750; time < 10750; time += 250)
    expect(latch.update(g, 8000, 6, time, true)?.root).toBe(2)
  expect(latch.update(g, 8000, 6, 10750, true)?.root).toBe(7)
})
import { assessKeyEvidence } from '../src/music/keyEvidence'
function melodyEvidence(pattern: number[], duration = 10000): Evidence[] {
  return Array.from({ length: duration / 50 }, (_, i) => ({
    pc: pattern[i % pattern.length],
    time: (i + 1) * 50,
    duration: 50,
    weight: 50,
  }))
}
describe('key confirmation', () => {
  const selected = candidate(7, 0.9, 0.7),
    candidates = [selected, candidate(2, 0.5, 0.15)]
  const pattern = [7, 7, 7, 11, 2, 2, 9, 0, 4, 6, 7, 7, 11, 2, 9, 0]
  it('recognizes agreement between two distinct excerpts', () => {
    expect(assessKeyEvidence(melodyEvidence(pattern), 10000, selected, candidates).level).toBe(
      'strong',
    )
  })
  it('withholds strong evidence for short clips', () => {
    expect(
      assessKeyEvidence(melodyEvidence(pattern, 2000), 2000, selected, candidates).level,
    ).not.toBe('strong')
  })
  it('withholds strong evidence for repeated triads', () => {
    expect(
      assessKeyEvidence(melodyEvidence([7, 11, 2]), 10000, selected, candidates).level,
    ).not.toBe('strong')
  })
  it('identifies notes shared by G and D as ambiguous', () => {
    expect(
      assessKeyEvidence(melodyEvidence([7, 9, 11, 2, 4, 6]), 10000, selected, candidates).level,
    ).toBe('ambiguous')
  })
  it('does not confirm a locked key when the current winner differs', () => {
    expect(
      assessKeyEvidence(melodyEvidence(pattern), 10000, selected, [
        candidate(2, 0.95, 0.75),
        candidate(7, 0.3, 0.1),
      ]).level,
    ).toBe('ambiguous')
  })
  it('expires strong evidence during silence', () => {
    expect(assessKeyEvidence(melodyEvidence(pattern), 12500, selected, candidates).level).not.toBe(
      'strong',
    )
  })
  it('rejects incompatible melody even with a high candidate score', () => {
    expect(
      assessKeyEvidence(melodyEvidence([7, 8, 10, 1, 3, 6]), 10000, selected, candidates).level,
    ).toBe('ambiguous')
  })
  it('does not hide a conflicting earlier excerpt', () => {
    const events = [
      ...melodyEvidence([2, 2, 6, 9, 1, 4, 11], 6000),
      ...melodyEvidence(pattern, 4000).map((e) => ({ ...e, time: e.time + 6000 })),
    ]
    expect(assessKeyEvidence(events, 10000, selected, candidates).level).not.toBe('strong')
  })
})
