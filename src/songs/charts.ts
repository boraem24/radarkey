import { mod } from '../music/notes'
import type { SongChart } from './types'
export function chordSequenceForSection(section: SongChart['sections'][number], shift: number, flats: boolean) {
  return section.lines.flatMap((line) => line.map((chord) => transposeChord(chord, shift, flats)))
}
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const CHORD =
  /^[A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M|ø|°|\+|-|\d|[#b]|\([\d,#b+\-/]+\))*(?:\/[A-G][#b]?)?$/
export function isChord(token: string) {
  return token === 'N.C.' || (token.length <= 32 && CHORD.test(token))
}
export function notePc(note: string) {
  const m = /^([A-G])([#b]?)$/.exec(note)
  return m ? mod(PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)) : null
}
export function transposeChord(chord: string, semitones: number, preferFlats = false) {
  if (!isChord(chord) || chord === 'N.C.') return chord
  if (mod(semitones) === 0) return chord
  const names = preferFlats ? FLATS : SHARPS
  return chord.replace(
    /^([A-G][#b]?)|\/([A-G][#b]?)$/g,
    (_whole, root: string | undefined, bass: string | undefined) =>
      `${bass ? '/' : ''}${names[mod(notePc(root ?? bass!)! + semitones)]}`,
  )
}


