import { chordForDegree, chordForMinorDegree } from './chordTheory'
import type { Progression } from './progressionEstimator'
export function possibleCadence(root: number, keyConfidence: number, inferred: Progression | null) {
  if (keyConfidence <= 0) return null
  if (inferred) return { ...inferred, basis: 'melody' as const }
  const choices: readonly (readonly [string, readonly number[]])[] = [
    ['Verso', [0, 5, 3, 4]],
    ['Pré-refrão', [1, 4, 0, 0]],
    ['Refrão', [0, 4, 5, 3]],
  ] as const
  const suggestions = choices.map(([label, degrees]) => {
    const chords = degrees.map((degree) => chordForDegree(root, degree))
    return { label, roman: chords.map((c) => c.roman), chords: chords.map((c) => c.name) }
  })
  const minor = [5, 6, 0, 4].map((degree) => chordForMinorDegree(root, degree))
  suggestions.push({ label: 'Menor · provável', roman: minor.map((c) => c.roman), chords: minor.map((c) => c.name) })
  const chords = suggestions[2]
  return {
    roman: chords.roman,
    chords: chords.chords,
    suggestions,
    confidence: null,
    basis: 'key' as const,
  }
}
