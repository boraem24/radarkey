export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
export const mod = (n: number, m = 12) => ((n % m) + m) % m
export const frequencyToMidi = (hz: number, tuning = 440) => 69 + 12 * Math.log2(hz / tuning)
export const midiToFrequency = (midi: number, tuning = 440) => tuning * 2 ** ((midi - 69) / 12)
export const midiToNote = (midi: number) =>
  NOTES[mod(Math.round(midi))] + (Math.floor(Math.round(midi) / 12) - 1)
export const majorScale = (root: number) => [0, 2, 4, 5, 7, 9, 11].map((n) => mod(root + n))
export const transpose = (pitch: number, semitones: number) => mod(pitch + semitones)
export interface Pitch {
  frequencyHz: number
  midiNumber: number
  noteName: string
  pitchClass: string
  pc: number
  centsDeviation: number
  confidence: number
  timestamp: number
}
export function makePitch(frequencyHz: number, confidence: number, timestamp: number): Pitch {
  const midi = frequencyToMidi(frequencyHz),
    midiNumber = Math.round(midi),
    pc = mod(midiNumber)
  return {
    frequencyHz,
    midiNumber,
    noteName: midiToNote(midiNumber),
    pitchClass: NOTES[pc],
    pc,
    centsDeviation: (midi - midiNumber) * 100,
    confidence,
    timestamp,
  }
}
