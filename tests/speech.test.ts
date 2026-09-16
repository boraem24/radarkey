import { afterEach, expect, it, vi } from 'vitest'
import { listenForWords } from '../src/songs/speech'
import { rankCharts, lyricSearchLink } from '../src/songs/resolve'
import { acousticDecision } from '../src/songs/consensus'
import type { SongCandidate } from '../src/songs/types'
afterEach(() => vi.unstubAllGlobals())
it('uses a live audio track, accepts a five-word final phrase and stops cleanly', () => {
  let recognition:
    | {
        onresult: ((value: unknown) => void) | null
        onend: (() => void) | null
        abort: () => void
        start: (track?: MediaStreamTrack) => void
        lang: string
        continuous: boolean
        interimResults: boolean
        maxAlternatives: number
      }
    | undefined
  let receivedTrack: MediaStreamTrack | undefined,
    aborted = false
  class FakeRecognition {
    onresult = null
    onend = null
    onerror = null
    lang = ''
    continuous = false
    interimResults = true
    maxAlternatives = 0
    constructor() {
      recognition = this as typeof recognition
    }
    start(track?: MediaStreamTrack) {
      receivedTrack = track
    }
    abort() {
      aborted = true
    }
  }
  vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition })
  const track = { readyState: 'live' } as MediaStreamTrack,
    phrases: string[][] = []
  const stop = listenForWords(track, (phrase) => phrases.push(phrase))
  expect(recognition?.lang).toBe('pt-BR')
  expect(receivedTrack).toBeUndefined()
  expect(recognition?.continuous).toBe(false)
  expect(recognition?.interimResults).toBe(true)
  expect(recognition?.maxAlternatives).toBe(3)
  recognition?.onresult?.({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: 'A luz guia minha jornada hoje' } }],
  })
  recognition?.onresult?.({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: 'A luz guia minha jornada hoje' } }],
  })
  recognition?.onresult?.({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: 'A luz guia' } }],
  })
  expect(phrases).toEqual([['A luz guia minha jornada hoje'], ['A luz guia']])
  stop()
  expect(aborted).toBe(true)
  expect(recognition?.onresult).toBeNull()
})
it('ranks only plausible Cifra Club charts before showing a direct chart link', () => {
  const detected: SongCandidate = {
    id: 'a',
    title: 'Canção Teste',
    artist: 'Artista Teste',
    source: 'acrcloud',
  }
  const charts: SongCandidate[] = [
    {
      id: 'wrong',
      title: 'Canção Teste',
      artist: 'Outro Artista',
      source: 'cifraclub',
      sourceUrl: 'https://www.cifraclub.com.br/outro/cancao/',
    },
    {
      id: 'best',
      title: 'Canção Teste',
      artist: 'Artista Teste',
      source: 'cifraclub',
      sourceUrl: 'https://www.cifraclub.com.br/artista/cancao/',
    },
    { id: 'nochart', title: 'Canção Teste', artist: 'Artista Teste', source: 'cifraclub' },
  ]
  expect(rankCharts(detected, charts).map((c) => c.id)).toEqual(['best', 'wrong'])
  expect(new URL(lyricSearchLink('a luz guia hoje')).hostname).toBe('www.google.com')
})
it('requires a second agreeing excerpt for tentative acoustic matches', () => {
  const first: SongCandidate = {
    id: 'one',
    title: 'Canção Teste',
    artist: 'Artista Teste',
    source: 'acrcloud',
    recognitionScore: 0.45,
  }
  const same: SongCandidate = { ...first, id: 'two', recognitionScore: 0.43 }
  const other: SongCandidate = {
    ...first,
    id: 'other',
    title: 'Outra Canção',
    recognitionScore: 0.5,
  }
  expect(acousticDecision([first], [], 1)).toBeNull()
  expect(acousticDecision([same], [first], 2)).toEqual(same)
  expect(acousticDecision([other], [first], 2)).toBeNull()
  expect(acousticDecision([{ ...first, recognitionScore: 0.62 }], [], 1)?.title).toBe(first.title)
})

it('expõe contadores, método e alternativas dos eventos de voz', () => {
  const instances: Array<{
    onstart: (() => void) | null
    onresult: ((event: any) => void) | null
    onend: (() => void) | null
    onerror: ((event?: { error?: string }) => void) | null
    start: (track?: MediaStreamTrack) => void
    abort: () => void
  }> = []
  class FakeRecognition {
    onstart = null
    onresult = null
    onend = null
    onerror = null
    lang = ''
    continuous = false
    interimResults = false
    maxAlternatives = 0
    constructor() {
      instances.push(this as (typeof instances)[number])
    }
    start() {}
    abort() {}
  }
  vi.useFakeTimers()
  vi.stubGlobal('window', {
    webkitSpeechRecognition: FakeRecognition,
    setTimeout,
    clearTimeout,
  })
  const track = { readyState: 'live' } as MediaStreamTrack
  let latest: any
  const phrases: string[][] = []
  const stop = listenForWords(
    track,
    (value) => phrases.push(value),
    undefined,
    (value) => {
      latest = value
    },
  )
  const first = instances[0]
  first.onstart?.()
  first.onresult?.({
    resultIndex: 0,
    results: [
      {
        isFinal: true,
        length: 2,
        0: { transcript: 'Graça sobre graça' },
        1: { transcript: 'Graça e paz' },
      },
    ],
  })
  expect(latest.speechStarts).toBe(1)
  expect(latest.speechResults).toBe(1)
  expect(latest.startMethod).toBe('plain')
  expect(phrases).toEqual([['Graça sobre graça', 'Graça e paz']])
  first.onerror?.({ error: 'no-speech' })
  expect(latest.speechError).toBe('no-speech')
  expect(latest.stoppedReason).toBeNull()
  first.onend?.()
  expect(latest.speechEnds).toBe(1)
  vi.advanceTimersByTime(250)
  expect(instances).toHaveLength(2)
  stop()
  vi.useRealTimers()
})

it('não reinicia depois de not-allowed e expõe o motivo de parada', () => {
  const instances: any[] = []
  class FakeRecognition {
    onstart = null
    onresult = null
    onend = null
    onerror = null
    lang = ''
    continuous = false
    interimResults = false
    maxAlternatives = 0
    constructor() {
      instances.push(this)
    }
    start() {}
    abort() {}
  }
  vi.useFakeTimers()
  vi.stubGlobal('window', {
    webkitSpeechRecognition: FakeRecognition,
    setTimeout,
    clearTimeout,
  })
  let latest: any
  const first = listenForWords(
    { readyState: 'live' } as MediaStreamTrack,
    () => {},
    undefined,
    (value) => {
      latest = value
    },
  )
  instances[0].onerror?.({ error: 'not-allowed' })
  instances[0].onend?.()
  vi.advanceTimersByTime(1000)
  expect(instances).toHaveLength(1)
  expect(latest.speechError).toBe('not-allowed')
  expect(latest.stoppedReason).toBe('not-allowed')
  first()
  vi.useRealTimers()
})

it('reinicia depois de 250 ms e não cria instância após stop explícito', () => {
  const instances: any[] = []
  class FakeRecognition {
    onstart = null
    onresult = null
    onend = null
    onerror = null
    lang = ''
    continuous = false
    interimResults = false
    maxAlternatives = 0
    constructor() {
      instances.push(this)
    }
    start() {}
    abort() {}
  }
  vi.useFakeTimers()
  vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition })
  let latest: any
  const stop = listenForWords(
    { readyState: 'live' } as MediaStreamTrack,
    () => {},
    undefined,
    (value) => {
      latest = value
    },
  )
  instances[0].onend?.()
  vi.advanceTimersByTime(250)
  expect(instances).toHaveLength(2)
  stop()
  instances[1].onend?.()
  vi.advanceTimersByTime(500)
  expect(instances).toHaveLength(2)
  vi.useRealTimers()
})
