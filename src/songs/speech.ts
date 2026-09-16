type SpeechAlternative = { transcript: string; confidence?: number }
type SpeechResult = { isFinal: boolean; length?: number; 0: SpeechAlternative; [index: number]: SpeechAlternative }
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> }
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
): () => void {
  const browser = window as SpeechWindow
  const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition
  if (!Constructor) return () => {}
  const recognition = new Constructor()
  recognition.lang = 'pt-BR'
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 3
  let stopped = false,
    interimTimer = 0,
    lastPhrase = ''
  const begin = () => {
    if (stopped || track.readyState === 'ended') return
    onState?.('starting')
    try {
      // Chromium can bind recognition directly to the live microphone track.
      recognition.start(track)
    } catch {
      try {
        // Older browsers do not accept the optional track argument.
        recognition.start()
      } catch {
        onState?.('error')
      }
    }
  }
  recognition.onstart = () => onState?.('listening')
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (!result.isFinal) {
        if (interimTimer) clearTimeout(interimTimer)
        const phrase = result[0]?.transcript?.replace(/\s+/g, ' ').trim().slice(0, 200) || ''
        interimTimer = window.setTimeout(() => {
          if (phrase && phrase !== lastPhrase) { lastPhrase = phrase; onPhrase([phrase]) }
          if (phrase) onState?.('heard')
        }, 800)
        continue
      }
      if (interimTimer) clearTimeout(interimTimer)
      const alternatives: string[] = []
      for (let a = 0; a < Math.min(3, result.length || 1); a++) {
        const phrase = result[a]?.transcript?.replace(/\s+/g, ' ').trim().slice(0, 200) || ''
        if (phrase) alternatives.push(phrase)
      }
      if (alternatives[0] && alternatives[0] !== lastPhrase) {
        lastPhrase = alternatives[0]
        onPhrase(alternatives)
        onState?.('heard')
      }
    }
  }
  recognition.onend = () => {
    if (!stopped) window.setTimeout(begin, 350)
  }
  recognition.onerror = () => {
    onState?.('error')
  }
  begin()
  return () => {
    stopped = true
    if (interimTimer) clearTimeout(interimTimer)
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
