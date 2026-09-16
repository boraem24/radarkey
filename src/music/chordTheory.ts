import { majorScale } from './notes'
export const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
export const MINOR_SCALE_STEPS = [0, 2, 3, 5, 7, 8, 10]
const MINOR_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
export const MINOR_SPELLINGS = Array.from({ length: 12 }, (_, root) =>
  MINOR_SCALE_STEPS.map((step) => MINOR_NOTE_NAMES[(root + step) % 12]),
)
const SPELLINGS = [
  ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'],
  ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
  ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'],
  ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
  ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
  ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'],
  ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
  ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'],
  ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
  ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],
  ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
]
export function chordForDegree(root: number, degree: number) {
  const scale = majorScale(root)
  return {
    name: SPELLINGS[root][degree] + ['', 'm', 'm', '', '', 'm', 'dim'][degree],
    notes: [scale[degree], scale[(degree + 2) % 7], scale[(degree + 4) % 7]],
    roman: ROMAN[degree],
  }
}
export function chordForMinorDegree(root: number, degree: number) {
  const scale = MINOR_SCALE_STEPS.map((n) => (root + n) % 12)
  const romanNames = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']
  const suffix = ['', 'dim', '', 'm', 'm', '', '']
  return {
    name: MINOR_SPELLINGS[root][degree] + suffix[degree],
    notes: [scale[degree], scale[(degree + 2) % 7], scale[(degree + 4) % 7]],
    roman: romanNames[degree],
  }
}
export const MINOR_PROGRESSIONS = [[5, 6, 0, 4], [0, 5, 6, 4], [0, 3, 6, 4], [5, 3, 0, 6]]
export const PROGRESSIONS = [
  [0, 4, 5, 3],
  [0, 5, 3, 4],
  [5, 3, 0, 4],
  [3, 0, 4, 5],
  [0, 3, 4],
  [0, 4, 3],
  [1, 4, 0],
  [3, 4, 0],
  [0, 3, 0, 4],
  [5, 4, 3],
  [3, 4, 5],
  [0, 2, 3, 4],
]
