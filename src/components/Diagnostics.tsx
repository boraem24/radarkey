import { useEffect, useState } from 'react'
import type { AudioFrame } from '../audio/audioEngine'
import type { SpeechDiagnostics } from '../songs/speech'

type TrackSnapshot = { readyState: string; enabled: boolean; muted: boolean }
type SessionSpeechDiagnostics = SpeechDiagnostics & { trackSnapshot: TrackSnapshot }

export function Diagnostics({
  frame,
  speechDiagnostics,
  speechSupported,
  speechIsolation,
  onIsolateSpeech,
  onResumeTone,
  active,
}: {
  frame: AudioFrame | null
  speechDiagnostics: SessionSpeechDiagnostics | null
  speechSupported: boolean
  speechIsolation: boolean
  onIsolateSpeech: () => void
  onResumeTone: () => void
  active: boolean
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const lastEvent = speechDiagnostics?.lastSpeechEvent
  const age = lastEvent ? Math.max(0, Math.round((Date.now() - lastEvent.at) / 1000)) : null
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
  const speechValues: Record<string, string | number> = {
    Suporte: speechSupported ? 'Disponível' : 'Não oferecido pelo navegador',
    'Método usado para iniciar':
      speechDiagnostics?.startMethod === 'track'
        ? 'com faixa'
        : speechDiagnostics?.startMethod === 'plain'
          ? 'padrão'
          : '—',
    'Exceção no primeiro método': speechDiagnostics?.startException ?? '—',
    'Contadores': speechDiagnostics
      ? `Início: ${speechDiagnostics.speechStarts} · Resultado: ${speechDiagnostics.speechResults} · Fim: ${speechDiagnostics.speechEnds}`
      : 'Início: 0 · Resultado: 0 · Fim: 0',
    'Último erro': speechDiagnostics?.speechError ?? '—',
    'Último evento': lastEvent ? `${lastEvent.type} · há ${age}s` : '—',
    'Faixa readyState': speechDiagnostics?.trackSnapshot.readyState ?? '—',
    'Faixa enabled': speechDiagnostics ? String(speechDiagnostics.trackSnapshot.enabled) : '—',
    'Faixa muted': speechDiagnostics ? String(speechDiagnostics.trackSnapshot.muted) : '—',
    'Motivo de parada': speechDiagnostics?.stoppedReason ?? '—',
  }
  return (
    <>
      <dl className="diagnostics">
        {Object.entries(values).map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3>Reconhecimento de voz</h3>
      <dl className="diagnostics" data-testid="speech-diagnostics">
        {Object.entries(speechValues).map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {active && (
        <div className="test-controls">
          {speechIsolation ? (
            <>
              <p className="muted">Análise de tom pausada — cante ou fale agora para testar reconhecimento isolado.</p>
              <button type="button" onClick={() => void onResumeTone()}>
                Retomar análise de tom
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void onIsolateSpeech()}>
              Testar sem análise de tom
            </button>
          )}
        </div>
      )}
    </>
  )
}
