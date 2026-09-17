import { useEffect, useState } from 'react'
import type { AudioFrame } from '../audio/audioEngine'
import { diagnoseSpeechFailure } from '../songs/speech'
import type { SpeechDiagnostics } from '../songs/speech'

type TrackSnapshot = { readyState: string; enabled: boolean; muted: boolean }
type SessionSpeechDiagnostics = SpeechDiagnostics & { trackSnapshot: TrackSnapshot }

export function Diagnostics({
  frame,
  speechDiagnostics,
  speechSupported,
  speechIsolation,
  speechExperiment,
  onIsolateSpeech,
  onRawSpeech,
  onEndExperiment,
  onResumeTone,
  onResetSpeechDiagnostics,
  active,
}: {
  frame: AudioFrame | null
  speechDiagnostics: SessionSpeechDiagnostics | null
  speechSupported: boolean
  speechIsolation: boolean
  speechExperiment: 'tone-off' | 'raw' | null
  onIsolateSpeech: () => void
  onRawSpeech: () => void
  onEndExperiment: () => void
  onResumeTone: () => void
  onResetSpeechDiagnostics: () => void
  active: boolean
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const lastEvent = speechDiagnostics?.lastSpeechEvent
  const age = lastEvent ? Math.max(0, Math.round((Date.now() - lastEvent.at) / 1000)) : null
  const displayMode =
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
      ? 'instalado (standalone)'
      : 'aba do navegador'
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
    'Eventos intermediários': speechDiagnostics
      ? `Áudio: ${speechDiagnostics.audioStarts} · Som: ${speechDiagnostics.soundStarts} · Fala detectada: ${speechDiagnostics.speechDetectStarts} · Sem correspondência: ${speechDiagnostics.noMatches}`
      : 'Áudio: 0 · Som: 0 · Fala detectada: 0 · Sem correspondência: 0',
    'Idioma ativo': speechDiagnostics?.activeLang || '—',
    'Sonda de rede': speechDiagnostics?.networkProbe ?? 'unknown',
    'Ciclo de idiomas': speechDiagnostics?.langCycleExhausted ? 'esgotado' : 'em andamento',
    'Desistência': speechDiagnostics?.recognitionGaveUp ? 'sim' : 'não',
    'Último erro': speechDiagnostics?.speechError ?? '—',
    'Último evento': lastEvent ? `${lastEvent.type} · há ${age}s` : '—',
    'Faixa readyState': speechDiagnostics?.trackSnapshot.readyState ?? '—',
    'Faixa enabled': speechDiagnostics ? String(speechDiagnostics.trackSnapshot.enabled) : '—',
    'Faixa muted': speechDiagnostics ? String(speechDiagnostics.trackSnapshot.muted) : '—',
    'Motivo de parada': speechDiagnostics?.stoppedReason ?? '—',
    'Modo de exibição': displayMode,
  }
  const hypothesis = speechDiagnostics ? diagnoseSpeechFailure(speechDiagnostics) : ''
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
          <button type="button" onClick={onResetSpeechDiagnostics}>Zerar contadores</button>
          {speechExperiment === 'raw' ? (
            <>
              <p className="muted">Testando sem cancelamento de eco/ruído — fale normalmente por 20 segundos e veja se Sem correspondência muda.</p>
              <button type="button" onClick={() => void onEndExperiment()}>Encerrar experimento</button>
            </>
          ) : speechIsolation ? (
            <>
              <p className="muted">Microfone de análise de tom desligado — fale agora para testar reconhecimento isolado.</p>
              <button type="button" onClick={() => void onResumeTone()}>Retomar análise de tom</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void onIsolateSpeech()}>
                Testar reconhecimento com microfone de tom desligado
              </button>
              <button type="button" onClick={() => void onRawSpeech()}>Testar com áudio não processado</button>
            </>
          )}
        </div>
      )}
      {hypothesis && <p className="muted" data-testid="speech-hypothesis">{hypothesis}</p>}
      <p className="muted">
        Se o problema persistir: em Configurações do Android, abra o app Google → Configurações → Voz,
        e confirme que o reconhecimento de voz está habilitado. Teste também sem VPN e trocando de Wi-Fi
        para dados móveis.
      </p>
    </>
  )
}
