type SpeechAlternative = { transcript: string; confidence?: number }
type SpeechResult = { isFinal: boolean; length?: number; 0: SpeechAlternative; [index: number]: SpeechAlternative }
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> }
type BrowserRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
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
    try {
      recognition.start(track)
    } catch {
      try {
        recognition.start()
      } catch {
        /* Browser refused transcription; melody keeps working. */
      }
    }
  }
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (!result.isFinal) {
        if (interimTimer) clearTimeout(interimTimer)
        const phrase = result[0]?.transcript?.replace(/\s+/g, ' ').trim().slice(0, 200) || ''
        interimTimer = window.setTimeout(() => {
          if (phrase && phrase !== lastPhrase) { lastPhrase = phrase; onPhrase([phrase]) }
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
      }
    }
  }
  recognition.onend = () => {
    if (!stopped) window.setTimeout(begin, 350)
  }
  recognition.onerror = () => {
    /* ACRCloud and pitch detection remain active. */
  }
  begin()
  return () => {
    stopped = true
    if (interimTimer) clearTimeout(interimTimer)
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
