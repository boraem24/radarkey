type SpeechAlternative = { transcript: string; confidence?: number }
type SpeechResult = {
  isFinal: boolean
  length?: number
  0: SpeechAlternative
  [index: number]: SpeechAlternative
}
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> }

export interface SpeechDiagnostics {
  speechStarts: number
  speechResults: number
  speechEnds: number
  audioStarts: number
  soundStarts: number
  speechDetectStarts: number
  noMatches: number
  activeLang: string
  networkProbe: 'online' | 'offline' | 'unknown'
  langCycleExhausted: boolean
  speechError: string | null
  lastSpeechEvent: { type: string; at: number } | null
  startMethod: 'track' | 'plain' | null
  startException: string | null
  stoppedReason: string | null
}

type BrowserRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart?: (() => void) | null
  onaudiostart?: (() => void) | null
  onaudioend?: (() => void) | null
  onsoundstart?: (() => void) | null
  onsoundend?: (() => void) | null
  onspeechstart?: (() => void) | null
  onspeechend?: (() => void) | null
  onnomatch?: (() => void) | null
  onresult: ((event: SpeechEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event?: { error?: string }) => void) | null
  start: (track?: MediaStreamTrack) => void
  abort: () => void
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserRecognition
  webkitSpeechRecognition?: new () => BrowserRecognition
}

const browserLanguage = typeof navigator !== 'undefined' ? navigator.language : ''
/** Ordered language fallback list; the final empty value lets Chrome choose. */
export const LANG_ATTEMPTS = [...new Set(['pt-BR', 'pt-PT', browserLanguage, ''])].filter(
  (language, index, list) => language !== '' || index === list.length - 1,
)

export function supportsSpeechRecognition() {
  const browser = window as SpeechWindow
  return Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition)
}

/**
 * A no-cors request can only show that some route to a Google domain works;
 * resolving does not guarantee that the speech service itself is reachable.
 */
export async function probeNetwork(): Promise<'online' | 'offline' | 'unknown'> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  let timeout = 0
  try {
    const controller = new AbortController()
    timeout = window.setTimeout(() => controller.abort(), 2500)
    await fetch('https://www.gstatic.com/generate_204', {
      mode: 'no-cors',
      signal: controller.signal,
      cache: 'no-store',
    })
    return 'online'
  } catch {
    return 'unknown'
  } finally {
    if (timeout) window.clearTimeout(timeout)
  }
}

export function diagnoseSpeechFailure(diagnostics: SpeechDiagnostics): string {
  if (diagnostics.audioStarts === 0 && diagnostics.speechStarts >= 3)
    return 'O navegador nunca confirmou receber áudio para reconhecimento. Pode ser bloqueio de permissão em segundo plano ou conflito com outro app usando o microfone.'
  if (diagnostics.audioStarts > 0 && diagnostics.soundStarts === 0)
    return 'O navegador recebe áudio, mas não detecta nenhum som acima do limiar interno dele. Fale mais perto do aparelho ou verifique o volume de captação.'
  if (diagnostics.soundStarts > 0 && diagnostics.speechDetectStarts === 0)
    return 'Som é detectado, mas o navegador não reconhece como fala humana. Pode ser ruído de fundo dominante ou o classificador de voz do aparelho.'
  if (
    diagnostics.speechDetectStarts > 0 &&
    diagnostics.speechResults === 0 &&
    diagnostics.noMatches === 0 &&
    diagnostics.speechError === null
  )
    return `O navegador reconheceu sua voz como fala, mas o serviço de transcrição nunca respondeu. Isso indica bloqueio de rede até o serviço de voz do Google, pacote de idioma pt-BR ausente no aparelho ou o serviço de voz do Android desligado nas configurações do sistema. Sonda de rede: ${diagnostics.networkProbe}.`
  if (diagnostics.noMatches > 0)
    return 'O serviço respondeu, mas não conseguiu transcrever nenhuma palavra. Tente falar mais devagar e mais perto do microfone.'
  return ''
}

export function listenForWords(
  track: MediaStreamTrack,
  onPhrase: (phrases: string[]) => void,
  onState?: (state: 'starting' | 'listening' | 'heard' | 'error') => void,
  onDiagnostics?: (diagnostics: SpeechDiagnostics) => void,
): () => void {
  const browser = window as SpeechWindow
  const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition
  if (!Constructor) return () => {}

  let recognition: BrowserRecognition | null = null
  let stopped = false
  let permanentlyStopped = false
  let restartTimer = 0
  let interimTimer = 0
  let lastPhrase = ''
  let languageIndex = 0
  let consecutiveSilentSessions = 0
  const testedLanguages = new Set<string>()
  let diagnostics: SpeechDiagnostics = {
    speechStarts: 0,
    speechResults: 0,
    speechEnds: 0,
    audioStarts: 0,
    soundStarts: 0,
    speechDetectStarts: 0,
    noMatches: 0,
    activeLang: LANG_ATTEMPTS[0] || '',
    networkProbe: 'unknown',
    langCycleExhausted: false,
    speechError: null,
    lastSpeechEvent: null,
    startMethod: null,
    startException: null,
    stoppedReason: null,
  }

  const emit = () => onDiagnostics?.({ ...diagnostics })
  const markEvent = (type: string) => {
    diagnostics.lastSpeechEvent = { type, at: Date.now() }
    emit()
  }
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 200)

  const begin = () => {
    if (stopped || permanentlyStopped || track.readyState === 'ended') return
    const current = new Constructor()
    recognition = current
    current.lang = diagnostics.activeLang
    testedLanguages.add(current.lang)
    current.continuous = false
    current.interimResults = true
    current.maxAlternatives = 3
    diagnostics.startMethod = null
    emit()
    onState?.('starting')

    current.onstart = () => {
      diagnostics.speechStarts++
      markEvent('start')
      onState?.('listening')
    }
    let sessionAudioStarted = false
    let sessionSpeechDetected = false
    let sessionResult = false
    let sessionError = false
    current.onaudiostart = () => {
      sessionAudioStarted = true
      diagnostics.audioStarts++
      markEvent('audiostart')
    }
    current.onaudioend = () => markEvent('audioend')
    current.onsoundstart = () => {
      diagnostics.soundStarts++
      markEvent('soundstart')
    }
    current.onsoundend = () => markEvent('soundend')
    current.onspeechstart = () => {
      sessionSpeechDetected = true
      diagnostics.speechDetectStarts++
      markEvent('speechstart')
    }
    current.onspeechend = () => markEvent('speechend')
    current.onnomatch = () => {
      diagnostics.noMatches++
      markEvent('nomatch')
    }
    current.onresult = (event) => {
      sessionResult = true
      consecutiveSilentSessions = 0
      diagnostics.speechResults++
      markEvent('result')
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result.isFinal) {
          if (interimTimer) clearTimeout(interimTimer)
          const phrase = normalize(result[0]?.transcript || '')
          interimTimer = setTimeout(() => {
            if (phrase && phrase !== lastPhrase) {
              lastPhrase = phrase
              onPhrase([phrase])
              onState?.('heard')
            }
          }, 800)
          continue
        }
        if (interimTimer) clearTimeout(interimTimer)
        const alternatives: string[] = []
        for (let a = 0; a < Math.min(3, result.length || 1); a++) {
          const phrase = normalize(result[a]?.transcript || '')
          if (phrase) alternatives.push(phrase)
        }
        if (alternatives[0] && alternatives[0] !== lastPhrase) {
          lastPhrase = alternatives[0]
          onPhrase(alternatives)
          onState?.('heard')
        }
      }
    }
    current.onend = () => {
      diagnostics.speechEnds++
      markEvent('end')
      if (sessionAudioStarted && !sessionSpeechDetected && !sessionResult && !sessionError) {
        consecutiveSilentSessions++
        if (consecutiveSilentSessions >= 3) {
          consecutiveSilentSessions = 0
          if (!diagnostics.langCycleExhausted) {
            if (testedLanguages.size >= LANG_ATTEMPTS.length) {
              diagnostics.langCycleExhausted = true
            } else {
              languageIndex = (languageIndex + 1) % LANG_ATTEMPTS.length
              diagnostics.activeLang = LANG_ATTEMPTS[languageIndex] || ''
            }
            emit()
          }
        }
      } else {
        consecutiveSilentSessions = 0
      }
      if (!stopped && !permanentlyStopped) {
        clearTimeout(restartTimer)
        restartTimer = setTimeout(begin, 250)
      }
    }
    current.onerror = (event) => {
      sessionError = true
      const error = event?.error || 'unknown'
      diagnostics.speechError = error
      markEvent('error')
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        permanentlyStopped = true
        diagnostics.stoppedReason = error
      }
      onState?.('error')
    }

    try {
      current.start()
      diagnostics.startMethod = 'plain'
      emit()
    } catch (exception) {
      diagnostics.startException = String(exception)
      emit()
      try {
        current.start()
        diagnostics.startMethod = 'plain'
        emit()
      } catch {
        onState?.('error')
      }
    }
  }

  void probeNetwork().then((status) => {
    if (stopped) return
    diagnostics.networkProbe = status
    emit()
  })
  begin()
  return () => {
    stopped = true
    clearTimeout(restartTimer)
    if (interimTimer) clearTimeout(interimTimer)
    if (recognition) {
      recognition.onstart = null
      recognition.onaudiostart = null
      recognition.onaudioend = null
      recognition.onsoundstart = null
      recognition.onsoundend = null
      recognition.onspeechstart = null
      recognition.onspeechend = null
      recognition.onnomatch = null
      recognition.onresult = null
      recognition.onend = null
      recognition.onerror = null
      try {
        recognition.abort()
      } catch {
        /* Already stopped. */
      }
    }
  }
}
