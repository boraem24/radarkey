import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CadenceResult } from '../src/components/CadenceResult'
import type { SongChart, SongCandidate } from '../src/songs/types'
const candidate: SongCandidate = { id: 'c', title: 'Teste', artist: 'Artista', source: 'cifraclub' }
const chart: SongChart = {
  id: 'chart', name: 'Principal', song: candidate, originalKey: 0, capo: 0,
  sections: [{ id: 'intro', name: 'Intro', lines: [['C', 'G']] }, { id: 'chorus', name: 'Refrão', lines: [['Am', 'F']] }],
  searchText: '', sourceUrl: 'https://www.cifraclub.com.br/artista/teste/', savedAt: 0,
}
describe('CadenceResult', () => {
  afterEach(cleanup)
  it('prioriza a cifra ativa', () => {
    render(<CadenceResult candidate={{ root: 2, name: 'D', mode: 'major', confidence: 0.8, score: 1 }} inferred={null} chart={chart} />)
    expect(screen.getByText('Acordes da cifra')).toBeInTheDocument()
    expect(screen.queryByText('Campo harmônico estimado (a partir da melodia)')).not.toBeInTheDocument()
    expect(screen.queryByText('EXPERIMENTAL')).not.toBeInTheDocument()
  })
  it('usa o campo harmônico quando não há cifra', () => {
    render(<CadenceResult candidate={{ root: 2, name: 'D', mode: 'major', confidence: 0.8, score: 1 }} inferred={null} chart={null} />)
    expect(screen.getByText('Campo harmônico estimado (a partir da melodia)')).toBeInTheDocument()
    expect(screen.queryByText('Acordes da cifra')).not.toBeInTheDocument()
    expect(screen.getByText('EXPERIMENTAL')).toBeInTheDocument()
  })
  it('renderiza os acordes da cifra transpostos', () => {
    render(<CadenceResult candidate={{ root: 2, name: 'D', mode: 'major', confidence: 0.8, score: 1 }} inferred={null} chart={chart} />)
    expect(screen.getAllByText('D → A').length).toBeGreaterThan(0)
    expect(screen.getByText('Bm → G')).toBeInTheDocument()
  })
})
