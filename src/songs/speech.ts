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

export function supportsSpeechRecognition() {
  const browser = window as SpeechWindow
  return Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition)
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
  let fallbackTimer = 0
  let interimTimer = 0
  let lastPhrase = ''
  const mobileBrowser =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  let diagnostics: SpeechDiagnostics = {
    speechStarts: 0,
    speechResults: 0,
    speechEnds: 0,
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

  const begin = (forcePlain = false) => {
    if (stopped || permanentlyStopped || track.readyState === 'ended') return
    const current = new Constructor()
    recognition = current
    current.lang = 'pt-BR'
    current.continuous = true
    current.interimResults = true
    current.maxAlternatives = 3
    diagnostics.startMethod = null
    emit()
    onState?.('starting')
    const resultsAtStart = diagnostics.speechResults

    current.onstart = () => {
      diagnostics.speechStarts++
      markEvent('start')
      onState?.('listening')
    }
    current.onresult = (event) => {
      clearTimeout(fallbackTimer)
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
      if (!stopped && !permanentlyStopped) {
        clearTimeout(restartTimer)
        restartTimer = setTimeout(begin, 350)
      }
    }
    current.onerror = (event) => {
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
      if (forcePlain || mobileBrowser) {
        current.start()
        diagnostics.startMethod = 'plain'
        emit()
      } else {
        current.start(track)
        diagnostics.startMethod = 'track'
        emit()
        // Some mobile Chromium builds accept start(track) but silently produce
        // no results. Fall back to the standard start() before restarting.
        fallbackTimer = setTimeout(() => {
          if (
            recognition === current &&
            diagnostics.speechResults === resultsAtStart &&
            !stopped &&
            !permanentlyStopped
          ) {
            current.onend = null
            try {
              current.abort()
            } catch {
              /* Already stopped. */
            }
            begin(true)
          }
        }, 1200)
      }
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

  begin()
  return () => {
    stopped = true
    clearTimeout(restartTimer)
    clearTimeout(fallbackTimer)
    if (interimTimer) clearTimeout(interimTimer)
    if (recognition) {
      recognition.onstart = null
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
