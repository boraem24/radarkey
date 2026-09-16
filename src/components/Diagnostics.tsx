import type { AudioFrame } from '../audio/audioEngine'
export function Diagnostics({ frame }: { frame: AudioFrame | null }) {
  const values: Record<string, string | number> = {
    'Sample rate': frame ? `${frame.sampleRate} Hz` : '—',
    RMS: frame?.rms.toFixed(4) ?? '—',
    Peak: frame?.peak.toFixed(4) ?? '—',
    Frequency: frame?.frequency ? `${frame.frequency.toFixed(2)} Hz` : '—',
    Pitch: frame?.pitch?.noteName ?? '—',
    MIDI: frame?.pitch?.midiNumber ?? '—',
    Confidence: frame ? `${(frame.confidence * 100).toFixed(1)}%` : '—',
    Cents: frame?.pitch?.centsDeviation.toFixed(1) ?? '—',
    AudioContext: frame?.contextState ?? 'closed',
    'Latência base + janela': frame ? `${Math.round(frame.latency)} ms` : '—',
    'Frames processados': frame?.processed ?? 0,
    'Frames descartados': frame?.discarded ?? 0,
  }
  return (
    <dl className="diagnostics">
      {Object.entries(values).map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
