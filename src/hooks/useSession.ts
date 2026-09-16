import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from '../audio/audioEngine'
import type { AudioFrame } from '../audio/audioEngine'
import { microphoneError } from '../audio/microphone'
import { ChromaHistory } from '../music/chroma'
import { KeyDetector } from '../music/keyDetector'
import type { KeyResult } from '../music/keyDetector'
import { estimateProgression } from '../music/progressionEstimator'
import type { Progression } from '../music/progressionEstimator'
import type { SongCandidate } from '../songs/types'
import { rankCharts } from '../songs/resolve'
import { listenForWords, supportsSpeechRecognition } from '../songs/speech'
import type { SpeechDiagnostics } from '../songs/speech'
import { acousticDecision } from '../songs/consensus'
import { API_BASE } from '../songs/api'
import { mergeSongCandidates } from '../songs/library'

const EMPTY: KeyResult = {
  candidates: [],
  status: 'analyzing',
  chroma: Array(12).fill(0),
  duration: 0,
}
type TrackSnapshot = { readyState: string; enabled: boolean; muted: boolean }
type SessionSpeechDiagnostics = SpeechDiagnostics & { trackSnapshot: TrackSnapshot }
export function useSession() {
  const [state, setState] = useState('idle'),
    [message, setMessage] = useState(''),
    [frame, setFrame] = useState<AudioFrame | null>(null),
    [key, setKey] = useState(EMPTY),
    [progression, setProgression] = useState<Progression | null>(null),
    [synthetic, setSynthetic] = useState(false),
    [musicState, setMusicState] = useState<
      | 'idle'
      | 'listening'
      | 'identifying'
      | 'found'
      | 'unavailable'
      | 'notFound'
      | 'words'
      | 'lyricsCandidates'
    >('idle'),
    [songMatches, setSongMatches] = useState<SongCandidate[]>([]),
    [heardPhrase, setHeardPhrase] = useState(''),
    [speechDiagnostics, setSpeechDiagnostics] = useState<SessionSpeechDiagnostics | null>(null),
    [speechStatus, setSpeechStatus] = useState<'idle' | 'starting' | 'listening' | 'heard' | 'unsupported' | 'error'>('idle'),
    [speechIsolation, setSpeechIsolation] = useState(false),
    [metrics, setMetrics] = useState({ ttfh: null as number | null, ttfi: null as number | null, ttfc: null as number | null })
  const engine = useRef<AudioEngine | null>(null),
    generation = useRef(0),
    stopSpeech = useRef<(() => void) | null>(null),
    restartSpeech = useRef<(() => void) | null>(null),
    activeRequest = useRef<AbortController | null>(null)
  const stop = useCallback((reason = '') => {
    generation.current++
    stopSpeech.current?.()
    stopSpeech.current = null
    restartSpeech.current = null
    activeRequest.current?.abort()
    activeRequest.current = null
    engine.current?.stop()
    engine.current = null
    setState('idle')
    setMessage(reason)
    setFrame(null)
    setSpeechIsolation(false)
  }, [])
  useEffect(() => {
    const visibility = () => {
      if (document.hidden && engine.current)
        stop('Escuta pausada ao sair da tela. Toque para retomar.')
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      stop()
    }
  }, [stop])
  const start = async (test = false) => {
    if (engine.current) return
    const id = ++generation.current,
      audio = new AudioEngine()
    engine.current = audio
    setState('requestingPermission')
    setMessage('')
    setKey(EMPTY)

    setProgression(null)
    setFrame(null)
    setSynthetic(test)
    setSongMatches([])
    setHeardPhrase('')
    setSpeechDiagnostics(null)
    setSpeechStatus(!test && supportsSpeechRecognition() ? 'starting' : test ? 'idle' : 'unsupported')
    setMetrics({ ttfh: null, ttfi: null, ttfc: null })
    const startedAt = performance.now()
    let recognition = false
    let lyrics = false
    const request = new AbortController()
    activeRequest.current = request
    const browserWords = !test && supportsSpeechRecognition()
    if (!test) {
      // Do not wait for a sleeping Render instance before opening the mic. On
      // mobile that delay can also make the browser reject speech recognition
      // because the original tap is no longer considered a user gesture.
      setMusicState(browserWords ? 'listening' : 'unavailable')
      void fetch(`${API_BASE}/api/music/status`, {
        cache: 'no-store',
        signal: request.signal,
      })
        .then((response) => response.json())
        .then((status) => {
          if (generation.current !== id) return
          recognition = Boolean(status.recognition)
          lyrics = Boolean(status.lyrics)
          if (!browserWords && !recognition) setMusicState('unavailable')
        })
        .catch(() => {
          /* tone detection and browser speech remain local */
        })
    } else setMusicState('idle')
    const history = new ChromaHistory(),
      detector = new KeyDetector()
    let lastUI = 0,
      lastKey = 0
    let result = EMPTY,
      inferred: Progression | null = null
    let foundSong = false,
      excerpts = 0,
      tentative: SongCandidate[] = [],
      latestPhrase = '',
      phraseBuffer: string[] = [],
      lyricQueries = 0,
      lyricSearchPending = false,
      queuedPhrases: string[] = [],
      lyricCandidates: SongCandidate[] = [],
      sampleQueue = Promise.resolve()
    const fetchSongs = async (
      query: string,
      mode: 'title' | 'lyrics',
    ): Promise<SongCandidate[]> => {
      const response = await fetch(
        `${API_BASE}/api/music/search?q=${encodeURIComponent(query)}&mode=${mode}`,
        { cache: 'no-store', signal: request.signal },
      )
      const body = await response.json()
      if (!response.ok) throw Error(body.error)
      return body.songs as SongCandidate[]
    }
    const resolveSong = async (song: SongCandidate) => {
      const combined = await fetchSongs(`${song.title} ${song.artist}`, 'title').catch(() => [])
      const charts = rankCharts(song, combined)
      if (charts.length) return charts
      return rankCharts(song, await fetchSongs(song.title, 'title').catch(() => []))
    }
    const accept = async (song: SongCandidate, knownCharts?: SongCandidate[]) => {
      if (foundSong || generation.current !== id) return
      foundSong = true
      setMetrics((current) => ({ ...current, ttfc: current.ttfc ?? performance.now() - startedAt }))
      audio.stopSamples()
      stopSpeech.current?.()
      stopSpeech.current = null
      const charts = knownCharts || (await resolveSong(song))
      if (generation.current !== id) return
      const combined = [...(charts.length ? charts : [song]), ...lyricCandidates]
      setSongMatches(
        combined
          .filter((item, index) => combined.findIndex((other) => other.id === item.id) === index)
          .slice(0, 6),
      )
      setMusicState('found')
    }
    const lookupPhrase = async (phrase: string) => {
      lyricSearchPending = true
      lyricQueries++
      try {
        const songs = await fetchSongs(phrase, 'lyrics')
        if (generation.current !== id || foundSong) return
        const resolved: Array<SongCandidate | undefined> = Array(Math.min(songs.length, 5))
        await Promise.allSettled(
          songs.slice(0, 5).map(async (song, index) => {
            const charts = await resolveSong(song)
            if (generation.current !== id || foundSong || !charts.length) return
            resolved[index] = charts[0]
            const latest = resolved.filter((candidate): candidate is SongCandidate => Boolean(candidate))
            lyricCandidates = mergeSongCandidates(lyricCandidates, latest).slice(0, 5)
            setSongMatches(lyricCandidates)
            setMetrics((current) => ({ ...current, ttfi: current.ttfi ?? performance.now() - startedAt }))
            setMusicState('lyricsCandidates')
          }),
        )
      } catch {
        /* Continue with the next spoken phrase or acoustic excerpt. */
      } finally {
        lyricSearchPending = false
        if (generation.current === id && !foundSong) {
          if (!lyricCandidates.length) setMusicState('words')
          while (queuedPhrases.length && lyricQueries < 3) void lookupPhrase(queuedPhrases.shift()!)
        }
      }
    }
    const onPhrase = (phrases: string[]) => {
      if (generation.current !== id || foundSong) return
      const phrase = phrases[0]?.trim()
      if (!phrase) return
      latestPhrase = phrase
      phraseBuffer = [...phraseBuffer.filter((item) => item !== phrase), phrase].slice(-4)
      setHeardPhrase(phraseBuffer.join(' / '))
      if (!lyrics) {
        setMusicState('words')
        return
      }
      if (lyricQueries >= 3) return
      const combined = phraseBuffer.slice(-2).join(' ')
      const queries = combined === phrase ? [phrase] : [phrase, combined]
      if (lyricSearchPending) queuedPhrases.push(...queries)
      else {
        for (const query of queries) {
          if (lyricQueries >= 3) break
          void lookupPhrase(query)
        }
      }
    }
    const identifyExcerpt = async (blob: Blob, number: number) => {
      if (generation.current !== id || foundSong) return
      setMusicState('identifying')
      try {
        const response = await fetch(`${API_BASE}/api/music/recognize`, {
          method: 'POST',
          body: blob,
          headers: { 'Content-Type': blob.type },
          signal: request.signal,
        })
        const body = await response.json()
        if (!response.ok) throw Error(body.error)
        const songs = body.songs as SongCandidate[]
        if (generation.current !== id || foundSong) return
        if (songs.length)
          setMetrics((current) => ({ ...current, ttfi: current.ttfi ?? performance.now() - startedAt }))
        const accepted = acousticDecision(songs, tentative, number)
        if (accepted) {
          await accept(accepted)
          return
        }
        if (number === 1) {
          tentative = songs
          setMusicState(lyricCandidates.length ? 'lyricsCandidates' : 'listening')
          return
        }
      } catch {
        /* A second excerpt or a word result may still find the song. */
      }
      if (number === 2 && generation.current === id && !foundSong)
        setMusicState(
          lyricCandidates.length ? 'lyricsCandidates' : latestPhrase ? 'words' : 'notFound',
        )
    }
    try {
      await audio.start(
        (f) => {
          if (generation.current !== id) return
          history.add(f.pitch, f.timestamp)
          if (f.timestamp - lastKey > 250) {
            lastKey = f.timestamp
            result = detector.detect(history, f.timestamp)
            inferred = result.selected
              ? estimateProgression(
                  history.events,
                  result.selected.root,
                  result.selected.confidence,
                )
              : null
          }
          if (f.timestamp - lastUI < 100) return
          lastUI = f.timestamp
          setFrame(f)
          setKey(result)
          if (result.selected)
            setMetrics((current) => ({ ...current, ttfh: current.ttfh ?? performance.now() - startedAt }))
          setProgression(inferred)
          setState(
            f.peak >= 0.995
              ? 'clipping'
              : f.rms < 0.00035
                ? 'noSignal'
                : f.rms < 0.0008
                  ? 'weakSignal'
                  : result.status === 'stable'
                    ? 'stable'
                    : f.pitch
                      ? 'analyzing'
                      : 'listening',
          )
        },
        () => stop('O áudio foi interrompido. Toque em Começar a ouvir para retomar.'),
        test,
        !test
          ? (blob) => {
              if (!recognition) return
              const number = ++excerpts
              sampleQueue = sampleQueue.then(() => identifyExcerpt(blob, number))
            }
          : undefined,
        !test
          ? (track) => {
              if (track) {
                const trackSnapshot: TrackSnapshot = {
                  readyState: track.readyState,
                  enabled: track.enabled,
                  muted: track.muted,
                }
                setSpeechDiagnostics({
                   speechStarts: 0,
                   speechResults: 0,
                   speechEnds: 0,
                   audioStarts: 0,
                   soundStarts: 0,
                   speechDetectStarts: 0,
                   noMatches: 0,
                   activeLang: 'pt-BR',
                   networkProbe: 'unknown',
                   langCycleExhausted: false,
                   speechError: null,
                  lastSpeechEvent: null,
                  startMethod: null,
                  startException: null,
                  stoppedReason: null,
                  trackSnapshot,
                })
                if (track.readyState !== 'live') {
                  if (generation.current === id) setSpeechStatus('error')
                  return
                }
                restartSpeech.current = () => {
                  stopSpeech.current?.()
                  stopSpeech.current = listenForWords(track, onPhrase, (status) => {
                    if (generation.current === id) setSpeechStatus(status)
                  }, (diagnostics) => {
                    if (generation.current === id) setSpeechDiagnostics({ ...diagnostics, trackSnapshot })
                  })
                }
                restartSpeech.current()
              } else if (generation.current === id) {
                setSpeechStatus('error')
              }
            }
          : undefined,
      )
      if (generation.current === id) setState('listening')
    } catch (error) {
      audio.stop()
      if (generation.current === id) {
        engine.current = null
        const info = microphoneError(error)
        setState(info.state)
        setMessage(info.message)
      }
    }
  }
  const isolateSpeech = async () => {
    if (!engine.current) return
    stopSpeech.current?.()
    stopSpeech.current = null
    await engine.current.suspendAnalysis()
    setSpeechIsolation(true)
    restartSpeech.current?.()
  }
  const resumeTone = async () => {
    if (!engine.current) return
    await engine.current.resumeAnalysis()
    setSpeechIsolation(false)
    restartSpeech.current?.()
  }
  return {
    state,
    message,
    frame,
    key,

    progression,
    synthetic,
    start,
    stop,
    setFrequency: (hz: number) => engine.current?.setFrequency(hz),
    musicState,
    songMatches,
    heardPhrase,
    speechDiagnostics,
    speechStatus,
    speechIsolation,
    isolateSpeech,
    resumeTone,
    metrics,
    active: [
      'requestingPermission',
      'listening',
      'analyzing',
      'stable',
      'noSignal',
      'weakSignal',
      'clipping',
    ].includes(state),
  }
}
