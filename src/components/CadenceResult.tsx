import { possibleCadence } from '../music/possibleCadence'
import { chordSequenceForSection } from '../songs/charts'
import type { SongChart } from '../songs/types'
import { mod } from '../music/notes'
import type { KeyCandidate } from '../music/keyDetector'
import type { Progression } from '../music/progressionEstimator'
export function CadenceResult({ candidate, inferred, chart }: { candidate?: KeyCandidate; inferred: Progression | null; chart?: SongChart | null }) {
  if (!candidate) return null
  if (chart) {
    const shift = chart.originalKey === null ? 0 : mod(candidate.root - chart.originalKey)
    const flats = [1, 3, 5, 6, 8, 10].includes(candidate.root)
    const suggestions = chart.sections.slice(0, 3).map((section) => ({ label: section.name, roman: [] as string[], chords: chordSequenceForSection(section, shift, flats) }))
    return <section className="cadence-result" aria-label="Acordes da cifra"><div className="section-heading"><h2>Acordes da cifra</h2></div><div className="harmonic-suggestions">{suggestions.map((s) => <div className="harmonic-suggestion" key={s.label}><b>{s.label}</b><div className="chords">{s.chords.join(' → ')}</div></div>)}</div><p className="muted">Acordes de {chart.song.title} · {chart.song.artist} — Cifra Club</p></section>
  }
  const cadence = possibleCadence(candidate.root, candidate.confidence, inferred)
  if (!cadence) return null
  const suggestions = 'suggestions' in cadence && cadence.suggestions ? cadence.suggestions : [{ label: 'Melodia', roman: cadence.roman, chords: cadence.chords }]
  return <section className="cadence-result" aria-label="Possível cadência"><div className="section-heading"><h2>Possível cadência</h2><span className="experiment">EXPERIMENTAL</span></div><p className="muted">Campo harmônico estimado (a partir da melodia)</p><div className="harmonic-suggestions">{suggestions.map((s) => <div className="harmonic-suggestion" key={s.label}><b>{s.label}</b>{s.roman.length > 0 && <div className="roman">{s.roman.join(' → ')}</div>}<div className="chords">{s.chords.join(' → ')}</div></div>)}</div><p className="muted">{cadence.basis === 'melody' ? `Inferida da melodia · confiança heurística: ${Math.round(cadence.confidence! * 100)}%` : 'Sequência comum neste tom; ainda não confirmada pela melodia.'}</p></section>
}
