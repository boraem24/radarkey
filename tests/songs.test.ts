import { describe, it, expect, vi, afterEach } from 'vitest'
import { isChord, transposeChord } from '../src/songs/charts'
import { loadCharts, saveCharts, searchLibrary, mergeSongCandidates } from '../src/songs/library'
import type { SongChart } from '../src/songs/types'
import { chordSequenceForSection } from '../src/songs/charts'
afterEach(() => vi.unstubAllGlobals())
describe('chords from Brazilian charts', () => {
  it('transposes bass and extended chords without flattening their character', () => {
    expect(isChord('F7M/C')).toBe(true)
    expect(transposeChord('F7M/C', 2)).toBe('G7M/D')
    expect(transposeChord('G/B', 2)).toBe('A/C#')
    expect(transposeChord('C7(9)', -2, true)).toBe('Bb7(9)')
    expect(transposeChord('Bm7(b5)', 1)).toBe('Cm7(b5)')
    expect(transposeChord('F#', 0, true)).toBe('F#')
    expect(isChord('Amem')).toBe(false)
  })
  it('restores every root and slash bass after a round trip', () => {
    for (const c of ['C', 'D7', 'F#sus4', 'Am7', 'G/B', 'F7M/C', 'C#dim'])
      for (let i = -12; i <= 12; i++) expect(transposeChord(transposeChord(c, i), -i)).toBe(c)
  })
})
const chart: SongChart = {
  id: 'test',
  name: 'Principal',
  song: { id: 'song', title: 'Canção Teste', artist: 'Artista Teste', source: 'cifraclub' },
  originalKey: 0,
  capo: 2,
  sections: [{ id: 's1', name: 'Intro', lines: [['C', 'G/B']] }],
  sourceUrl: 'https://www.cifraclub.com.br/artista-teste/cancao-teste/',
  searchText: '',
  savedAt: 1,
}
it('saves and reopens the original chart, including an unknown key', () => {
  const values = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k),
    setItem: (k: string, v: string) => values.set(k, v),
  })
  saveCharts([chart, { ...chart, id: 'unknown', originalKey: null }])
  expect(loadCharts()).toHaveLength(2)
  expect(searchLibrary(loadCharts(), 'cancao')[0].song.title).toBe('Canção Teste')
  saveCharts([{ ...chart, sourceUrl: 'javascript:alert(1)' }])
  expect(loadCharts()).toEqual([])
})
it('recovers from corrupted or unavailable storage', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => '{bad',
    setItem: () => {
      throw Error('quota')
    },
  })
  expect(loadCharts()).toEqual([])
  expect(() => saveCharts([chart])).toThrow(/Não foi possível salvar/)
})
it('acumula correspondências de consultas e prioriza quem aparece nas duas', () => {
  const first = { id: '1', title: 'Bondade de Deus', artist: 'Isaias Saad', source: 'cifraclub' as const }
  const second = { id: '2', title: 'Outra música', artist: 'Outro artista', source: 'cifraclub' as const }
  const afterFirstPhrase = mergeSongCandidates([], [first, second])
  const merged = mergeSongCandidates(afterFirstPhrase, [{ ...first, id: '1b' }])
  expect(merged[0].matchCount).toBe(2)
  expect(merged[0].title).toBe('Bondade de Deus')
})
it('extrai e transpõe os acordes da seção ativa da cifra', () => {
  const section = { id: 's', name: 'Refrão', lines: [['C', 'G/B']] }
  expect(chordSequenceForSection(section, 2, false)).toEqual(['D', 'A/C#'])
  expect(chordSequenceForSection(section, 0, false)).toEqual(['C', 'G/B'])
})
