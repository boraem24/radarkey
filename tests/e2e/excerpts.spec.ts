import { test, expect } from '@playwright/test'
test('tentative match appears only when a second sung excerpt agrees', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(),
        oscillator = context.createOscillator(),
        output = context.createMediaStreamDestination()
      oscillator.frequency.value = 220
      oscillator.connect(output)
      oscillator.start()
      ;(window as Window & { soundContext?: AudioContext }).soundContext = context
      return output.stream
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined })
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: undefined,
    })
  })
  let calls = 0
  await page.route('**/api/music/status', (route) =>
    route.fulfill({ json: { catalog: true, recognition: true, lyrics: false } }),
  )
  await page.route('**/api/music/recognize', (route) => {
    calls++
    return route.fulfill({
      json: {
        songs: [
          {
            id: String(calls),
            title: 'Canção Teste',
            artist: 'Artista Teste',
            source: 'acrcloud',
            recognitionScore: calls === 1 ? 0.45 : 0.46,
          },
        ],
      },
    })
  })
  await page.route('**/api/music/search?**', (route) =>
    route.fulfill({
      json: {
        songs: [
          {
            id: 'chart',
            title: 'Canção Teste',
            artist: 'Artista Teste',
            source: 'cifraclub',
            sourceUrl: 'https://www.cifraclub.com.br/artista-teste/cancao-teste/',
          },
        ],
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Começar a ouvir' }).click()
  await expect.poll(() => calls, { timeout: 15000 }).toBe(1)
  await expect(page.getByLabel('Identificação da música')).not.toContainText(
    'Música provável encontrada',
  )
  await expect.poll(() => calls, { timeout: 15000 }).toBe(2)
  await expect(page.getByLabel('Identificação da música')).toContainText(
    'Música provável encontrada',
    { timeout: 5000 },
  )
  await expect(page.getByRole('button', { name: /Canção Teste.*Ver cifra/ })).toBeVisible()
})
