import { CadenceResult } from './components/CadenceResult'
import { useState } from 'react'
import type { SongChart } from './songs/types'
import { useSession } from './hooks/useSession'
import { Diagnostics } from './components/Diagnostics'
import { NOTES } from './music/notes'
import './App.css'
import { UpdateNotice } from './components/UpdateNotice'
import { SongExplorer } from './components/SongExplorer'
import { lyricSearchLink } from './songs/resolve'
import { supportsSpeechRecognition } from './songs/speech'
function Mic({ stop = false }: { stop?: boolean }) {
  return stop ? (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
    </svg>
  )
}
export default function App() {
  const session = useSession(),
    [diagnostics, setDiagnostics] = useState(false),
    [help, setHelp] = useState(false),
    [songsOpen, setSongsOpen] = useState(false),
    [songUrl, setSongUrl] = useState<string | undefined>(),
    [activeChart, setActiveChart] = useState<SongChart | null>(null),
    [frequency, setFrequency] = useState(440),
    [manualPhrase, setManualPhrase] = useState('')
  const { active, state, frame, key, progression } = session,
    top = key.selected,
    alternative = key.candidates.find((candidate) => candidate.root !== top?.root)
  const requesting = state === 'requestingPermission'
  const status = !active
    ? 'PRONTO PARA OUVIR'
    : requesting
      ? 'AGUARDANDO PERMISSÃO'
      : state === 'noSignal'
        ? 'AGUARDANDO SUA VOZ'
        : state === 'weakSignal'
          ? 'SINAL FRACO'
          : state === 'clipping'
            ? 'SINAL MUITO ALTO'
            : key.status === 'stable'
              ? key.evidence?.level === 'strong'
                ? 'TOM FIXADO · EVIDÊNCIA FORTE'
                : key.evidence?.level === 'ambiguous'
                  ? 'TOM FIXADO · AINDA INCERTO'
                  : 'TOM FIXADO · CONFERINDO'
              : 'OUVINDO E ANALISANDO'
  const signal = !active
    ? 'Microfone desligado'
    : state === 'clipping'
      ? 'Afaste o celular da fonte sonora'
      : state === 'weakSignal' || state === 'noSignal'
        ? 'Aproxime o celular de quem canta'
        : frame && !frame.pitch && frame.rms >= 0.0015
          ? 'Sinal sem altura clara · priorize uma voz'
          : 'Sinal bom · continue cantando'
  if (songsOpen)
    return (
      <main>
        <SongExplorer
          detectedKey={top?.root}
          initialUrl={songUrl}
          onChartChange={setActiveChart}
          onClose={() => {
            setSongsOpen(false)
            setSongUrl(undefined)
          }}
        />
      </main>
    )
  return (
    <main>
      <header>
        <a className="brand" href="./" aria-label="KeyRadar início">
          <span className="brand-icon">◎</span> KEY<span>RADAR</span>
          <sup>BETA</sup>
        </a>
        <button
          className="icon-button"
          onClick={() => setHelp(!help)}
          aria-label="Como usar"
          aria-expanded={help}
        >
          ?
        </button>
      </header>
      {help && (
        <aside className="help">
          <strong>Uma voz. Alguns segundos. Um tom provável.</strong>
          <p>
            Toque em Começar a ouvir, permita o microfone e cante uma frase curta. Mantenha a tela
            aberta e aproxime o celular da voz predominante.
          </p>
          <p>
            Os percentuais são confiança relativa do algoritmo entre 12 tons maiores, sem calibração
            estatística de acerto. Uma melodia pode admitir vários tons. A harmonia é uma sugestão
            experimental.
          </p>
          <p>
            Ao buscar a música, trechos curtos são enviados à ACRCloud. Em navegadores compatíveis,
            a transcrição das palavras pode usar o serviço remoto do próprio navegador. A análise do
            tom continua local.
          </p>
          <p>
            Para instalar: use “Adicionar à tela inicial” no menu do navegador (no iPhone, pelo menu
            Compartilhar do Safari).
          </p>
        </aside>
      )}
      <section className="intro">
        <div className="eyebrow">
          <span /> SEU OUVIDO MUSICAL, AMPLIADO
        </div>
        <h1>A voz revela o tom.</h1>
        <p>Cante. Escute. Encontre a tonalidade.</p>
      </section>
      <UpdateNotice listening={active} />
      <section className="auto-song" aria-label="Identificação da música">
        <div>
          <span aria-hidden="true">♫</span>
          <strong>
            {session.musicState === 'found'
              ? 'Música provável encontrada'
              : session.musicState === 'lyricsCandidates'
                ? 'Possíveis músicas pela frase'
                : session.musicState === 'identifying'
                  ? 'Identificando a música…'
                  : session.musicState === 'listening'
                    ? 'Também estou procurando a música'
                    : session.musicState === 'words'
                      ? 'Ouvi uma frase cantada'
                      : session.musicState === 'notFound'
                        ? 'Ainda não reconheci a música'
                        : 'Tom e música com a mesma escuta'}
          </strong>
          <small>
            {session.musicState === 'unavailable'
              ? 'Reconhecimento da música aguardando ativação'
              : session.musicState === 'listening'
                ? 'Continue cantando · analisando trechos da voz'
                : session.musicState === 'identifying'
                  ? 'Comparando o canto com o catálogo'
                  : session.musicState === 'lyricsCandidates'
                    ? 'Confira o artista · a melodia continua em análise'
                    : session.musicState === 'words'
                      ? 'Ainda sem cifra para essa frase · continue cantando'
                      : session.musicState === 'notFound'
                        ? 'Reanalise e aproxime o celular da voz'
                        : 'Toque em Começar a ouvir'}
          </small>
        </div>
        {session.showManualPhraseInput ? (
          <form
            className="manual-phrase"
            onSubmit={(event) => {
              event.preventDefault()
              session.submitManualPhrase(manualPhrase)
            }}
          >
            <label htmlFor="manual-phrase-input">Digite um trecho que você lembra</label>
            <input
              id="manual-phrase-input"
              value={manualPhrase}
              onChange={(event) => setManualPhrase(event.target.value)}
              placeholder="Ex.: tua bondade me seguirá"
            />
            <button type="submit" disabled={!manualPhrase.trim()}>Buscar por este trecho</button>
          </form>
        ) : <p className="heard-phrase" data-testid="transcription-captured" style={{ fontSize: 18 }}>
          Transcrição capturada: {session.heardPhrase ? `“${session.heardPhrase}”` : 'nenhum trecho recebido'}
          {session.active && (
            <small style={{ display: 'block', marginTop: 8, fontSize: 12, color: session.speechStatus === 'heard' ? '#b4f7d1' : '#9cada6' }}>
              {session.speechStatus === 'heard'
                ? 'Palavras recebidas pelo microfone.'
                : session.speechStatus === 'listening' || session.speechStatus === 'starting'
                  ? 'Escuta de palavras ativa. Cante uma frase.'
                  : session.speechStatus === 'unsupported'
                    ? 'Este navegador não oferece transcrição por voz.'
                    : session.speechStatus === 'error'
                      ? 'O navegador bloqueou a transcrição por voz.'
                      : 'Aguardando o reconhecimento de voz.'}
            </small>
          )}
        </p>}
        {active && session.speechDiagnostics && !session.heardPhrase && (
          <p className="muted" data-testid="speech-capture-status">
            {session.speechDiagnostics.speechError === 'not-allowed' ||
            session.speechDiagnostics.speechError === 'service-not-allowed'
              ? 'O navegador bloqueou o reconhecimento de voz. Verifique a permissão de microfone e o serviço de voz do aparelho.'
              : session.speechDiagnostics.speechStarts === 0
                ? 'O reconhecimento de voz ainda não foi iniciado.'
                : session.speechDiagnostics.speechResults === 0
                  ? 'Reconhecimento ativo, mas nenhuma palavra chegou ainda.'
                  : 'O reconhecimento recebeu eventos, mas ainda não formou uma frase.'}
          </p>
        )}
        {session.songMatches.slice(0, 3).map((song) =>
          song.sourceUrl ? (
            <div className="music-match" key={song.id}>
              <button
                onClick={() => {
                  session.stop()
                  setSongUrl(song.sourceUrl)
                  setSongsOpen(true)
                }}
              >
                <span>
                  <b>{song.title}</b>
                  <small>{song.artist}</small>
                </span>
                <span>Ver cifra →</span>
              </button>
              <a href={song.sourceUrl} target="_blank" rel="noopener noreferrer">
                Abrir direto no Cifra Club ↗
              </a>
            </div>
          ) : (
            <a
              className="auto-song-link"
              key={song.id}
              href={`https://www.cifraclub.com.br/?q=${encodeURIComponent(song.title + ' ' + song.artist)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <b>{song.title}</b>
                <small>{song.artist}</small>
              </span>
              <span>Buscar cifra ↗</span>
            </a>
          ),
        )}
        {session.heardPhrase && session.musicState === 'words' && (
          <a
            className="phrase-search"
            href={lyricSearchLink(session.heardPhrase)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver possíveis músicas pela frase ↗
          </a>
        )}
      </section>
      <div className="workspace">
        <section
          className={`radar-card ${active ? 'is-active' : ''}`}
          aria-label="Tonalidade estimada"
        >
          <div className="card-top">
            <span className="mode">
              <Mic /> MODO A CAPPELLA
            </span>
            <span className="tuning">
              A4 <b>440</b> Hz
            </span>
          </div>
          <div className={`status ${active ? 'live' : ''}`} role="status">
            <i />
            {status}
          </div>
          <div className="radar" style={{ display: 'none' }} aria-hidden="true">
            <div className="radar-grid" />
            <svg className="confidence-ring" viewBox="0 0 260 260" aria-hidden="true">
              <circle cx="130" cy="130" r="113" className="ring-base" />
              <circle
                cx="130"
                cy="130"
                r="113"
                className="ring-fill"
                strokeDasharray={`${(top?.confidence ?? 0) * 710} 710`}
              />
            </svg>
            <span className="radar-tick north" />
            <span className="radar-tick south" />
            <div className="key-display">
              <span className="key-caption">
                {top
                  ? key.status === 'stable'
                    ? key.evidence?.level === 'strong'
                      ? 'TOM FIXADO · EVIDÊNCIA FORTE'
                      : key.evidence?.level === 'ambiguous'
                        ? 'TOM FIXADO · AINDA INCERTO'
                        : 'TOM FIXADO · CONFERINDO'
                    : 'TOM PROVÁVEL'
                  : 'ENCONTRANDO O TOM'}
              </span>
              <div className={`key-name ${top ? '' : 'empty'}`}>{top ? `${top.name}${key.relative ? ` · ${key.relative.name}` : ''}` : '—'}</div>
              <span className="major">
                {top ? (top.mode === 'minor' ? 'MENOR' : 'MAIOR') : active ? 'ANALISANDO' : 'PRONTO PARA COMEÇAR'}
              </span>
              <div className="confidence">
                {top ? (
                  <>
                    <b>
                      {Math.round(top.confidence * 100)}
                      <small>%</small>
                    </b>
                    <span>de confiança relativa</span>
                  </>
                ) : (
                  <span>
                    {active ? 'Reunindo notas da melodia' : 'Sua próxima nota é o início'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <CadenceResult candidate={top} inferred={progression} chart={activeChart} />
          <div className="alternative">
            <span>Outro candidato</span>
            <strong>
              {alternative ? (
                <>
                  {alternative.name} maior <b>{Math.round(alternative.confidence * 100)}%</b>
                </>
              ) : (
                'Aguardando evidências'
              )}
            </strong>
          </div>
          <div className="listen-controls">
            <button
              className={`listen ${active ? 'stop' : ''}`}
              onClick={() => (active ? session.stop() : void session.start())}
            >
              <Mic stop={active} />
              {requesting ? 'Cancelar solicitação' : active ? 'Parar de ouvir' : 'Começar a ouvir'}
              <span>{active ? '■' : '↗'}</span>
            </button>
            <p>
              {active
                ? 'Cante uma frase curta · o tom permanece fixado'
                : 'Permita o microfone e deixe a música acontecer'}
            </p>
          </div>
          {active && top && (
            <button
              className="reanalyze"
              onClick={() => {
                session.stop()
                void session.start(session.synthetic)
              }}
            >
              Reanalisar tom
            </button>
          )}
          {session.message && (
            <p className="message" role="alert">
              {session.message}
            </p>
          )}
          {session.synthetic && active && (
            <div className="synthetic-label">TESTE SINTÉTICO · SEM MICROFONE</div>
          )}
        </section>
        <div className="side-panels">
          <section className="signal-panel">
            <div className={`signal-bars ${active ? 'on' : ''}`} aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height: 8 + (i % 4) * 5,
                    opacity: active && frame && i < Math.min(12, frame.rms * 600) ? 0.9 : 0.18,
                  }}
                />
              ))}
            </div>
            <div>
              <strong>
                {active
                  ? state === 'clipping'
                    ? 'SINAL MUITO ALTO'
                    : state === 'weakSignal' || state === 'noSignal'
                      ? 'SINAL FRACO'
                      : frame?.pitch
                        ? 'SINAL BOM'
                        : 'ESCUTANDO'
                  : 'TUDO PRONTO'}
              </strong>
              <p>{signal}</p>
            </div>
            <span className="signal-dot" />
          </section>
        </div>
      </div>
      <footer>
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
            <path d="m8 12 3 3 5-6" />
          </svg>
          Análise de tom local · v0.5.3
        </span>
        <button onClick={() => setDiagnostics(!diagnostics)} aria-expanded={diagnostics}>
          ⚙ Diagnóstico
        </button>
      </footer>
      {diagnostics && (
        <section className="panel debug">
          <h2>Diagnóstico de áudio</h2>
          <button
            onClick={() => {
              session.stop()
              setSongsOpen(true)
            }}
          >
            Abrir repertório ou corrigir música
          </button>
          <Diagnostics
            frame={frame}
            speechDiagnostics={session.speechDiagnostics}
            speechSupported={supportsSpeechRecognition()}
            speechIsolation={session.speechIsolation}
            speechExperiment={session.speechExperiment}
            onIsolateSpeech={session.isolateSpeech}
            onRawSpeech={session.testRawSpeech}
            onEndExperiment={session.endExperiment}
            onResumeTone={session.resumeTone}
            onResetSpeechDiagnostics={session.resetSpeechDiagnostics}
            active={active}
          />
          <h3>Perfil de notas · últimos 15 s</h3>
          <div className="chroma">
            {NOTES.map((n, i) => (
              <div key={n}>
                <div style={{ height: Math.max(2, key.chroma[i] * 140) }} />
                <small>{n}</small>
              </div>
            ))}
          </div>
          <div className="test-controls">
            <label>
              Sinal sintético{' '}
              <select
                value={frequency}
                onChange={(e) => {
                  setFrequency(Number(e.target.value))
                  session.setFrequency(Number(e.target.value))
                }}
              >
                {[261.63, 293.66, 329.63, 392, 440].map((f) => (
                  <option key={f} value={f}>
                    {f} Hz
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={active}
              onClick={() => {
                setFrequency(440)
                void session.start(true)
              }}
            >
              Testar seno de 440 Hz
            </button>
          </div>
          <p className="muted">
            Sinal gerado na Web Audio API, analisado pelo mesmo detector. Sem reprodução nos
            alto-falantes. Latência exibida não inclui estabilização nem atrasos do sistema.
          </p>
        </section>
      )}
      <div className="bottom-note">FEITO PARA A VOZ. AFINADO COM VOCÊ.</div>
    </main>
  )
}
