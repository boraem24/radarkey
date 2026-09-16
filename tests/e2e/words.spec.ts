import { test, expect } from '@playwright/test'
test('six sung words can locate a chart through free lyric search', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext()
      const oscillator = context.createOscillator()
      const output = context.createMediaStreamDestination()
      oscillator.frequency.value = 220
      oscillator.connect(output)
      oscillator.start()
      ;(window as Window & { fakeAudioContext?: AudioContext }).fakeAudioContext = context
      return output.stream
    }
    class FakeSpeechRecognition {
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 1
      onresult: ((event: unknown) => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      start() {
        ;(window as Window & { fakeSpeechStarts?: number }).fakeSpeechStarts =
          ((window as Window & { fakeSpeechStarts?: number }).fakeSpeechStarts || 0) + 1
        setTimeout(
          () =>
            this.onresult?.({
              resultIndex: 0,
              results: [{ isFinal: true, 0: { transcript: 'A luz guia minha jornada hoje' } }],
            }),
          450,
        )
        setTimeout(
          () =>
            this.onresult?.({
              resultIndex: 0,
              results: [{ isFinal: true, 0: { transcript: 'Bondade me segue por toda vida' } }],
            }),
          1800,
        )
      }
      abort() {
        this.onresult = null
      }
    }
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition,
    })
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition,
    })
  })
  let acousticCalls = 0
  let lyricCalls = 0
  await page.route('**/api/music/status', (route) =>
    route.fulfill({ json: { catalog: true, recognition: true, lyrics: true } }),
  )
  await page.route('**/api/music/recognize', (route) => {
    acousticCalls++
    return route.fulfill({ json: { songs: [] } })
  })
  await page.route('**/api/music/search?**', (route) => {
    const params = new URL(route.request().url()).searchParams
    const mode = params.get('mode')
    const songs =
      mode === 'lyrics'
        ? (lyricCalls++, params.get('q')?.startsWith('A luz')
            ? [{ id: 'wrong', title: 'Outra Canção', artist: 'Outro Artista', source: 'genius' }]
            : [{ id: 'lyrics', title: 'Canção Teste', artist: 'Artista Teste', source: 'genius' }])
        : [
            {
              id: params.get('q')?.startsWith('Outra') ? 'wrong-chart' : 'chart',
              title: params.get('q')?.startsWith('Outra') ? 'Outra Canção' : 'Canção Teste',
              artist: params.get('q')?.startsWith('Outra') ? 'Outro Artista' : 'Artista Teste',
              source: 'cifraclub',
              sourceUrl: params.get('q')?.startsWith('Outra')
                ? 'https://www.cifraclub.com.br/outro-artista/outra-cancao/'
                : 'https://www.cifraclub.com.br/artista-teste/cancao-teste/',
            },
          ]
    return route.fulfill({ json: { songs } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Começar a ouvir' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { fakeSpeechStarts?: number }).fakeSpeechStarts || 0),
    )
    .toBeGreaterThan(0)
  await expect(page.getByLabel('Identificação da música')).toContainText(
    'Ouvi: “Bondade me segue por toda vida”',
  )
  await expect(page.getByLabel('Identificação da música')).toContainText(
    'Possíveis músicas pela frase',
    { timeout: 5000 },
  )
  await expect(page.getByRole('button', { name: /Canção Teste.*Ver cifra/ })).toBeVisible()
  await expect(page.locator('.music-match').first()).toContainText('Canção Teste')
  expect(lyricCalls).toBe(2)
  expect(acousticCalls).toBe(0)
})
