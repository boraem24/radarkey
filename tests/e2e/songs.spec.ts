import { test, expect, type Page } from '@playwright/test'
const url = 'https://www.cifraclub.com.br/artista-teste/cancao-teste/'
const song = {
  id: url,
  title: 'Canção Teste',
  artist: 'Artista Teste',
  source: 'cifraclub',
  sourceUrl: url,
}
const chart = {
  id: url,
  song,
  name: 'Principal',
  originalKey: 0,
  capo: 2,
  sections: [
    { id: 's0', name: 'Intro', lines: [['C', 'F7M/C', 'G/B']] },
    {
      id: 's1',
      name: 'Refrão',
      lines: [
        ['Am7', 'F', 'C', 'G'],
        ['Am7', 'F', 'C', 'G'],
      ],
    },
  ],
  searchText: '',
  sourceUrl: url,
  savedAt: 0,
}
async function mock(page: Page, recognition = false) {
  await page.route('**/api/music/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const body = path.endsWith('/status')
      ? { catalog: true, lyrics: false, recognition }
      : path.endsWith('/chart')
        ? {
            chart,
            versions: [
              { name: 'Principal', url },
              { name: 'Simplificada', url: url + 'simplificada.html' },
            ],
          }
        : { songs: [song] }
    await route.fulfill({ json: body })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Diagnóstico' }).click()
  await page.getByRole('button', { name: 'Abrir repertório ou corrigir música' }).click()
}
test('finds an arrangement, transposes capo correctly and reopens saved chords offline', async ({
  page,
  context,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await mock(page)
  await expect(page.getByRole('button', { name: 'Reconhecer cantando' })).toBeDisabled()
  await page.getByLabel('Nome da música, artista ou link do Cifra Club').fill('Canção Teste')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('button', { name: /01 Canção Teste/ }).click()
  await expect(page.getByRole('heading', { name: 'Qual arranjo você prefere?' })).toBeVisible()
  await page.getByRole('button', { name: /Principal 2 partes/ }).click()
  await expect(page.getByLabel('Transpor acordes')).toContainText('Capo 2 · soa em D')
  await expect(page.locator('.song-chord').first()).toHaveText('C')
  await page.getByLabel('Tom para tocar').selectOption('2')
  await expect(page.locator('.song-chord').first()).toHaveText('D')
  await expect(page.locator('.song-chord').nth(1)).toHaveText('G7M/D')
  await expect(page.locator('.song-chord').nth(2)).toHaveText('A/C#')
  await expect(page.getByLabel('Transpor acordes')).toContainText('TOCAR SEM CAPOTRASTE')
  await page.getByRole('button', { name: 'Restaurar cifra original' }).click()
  await expect(page.locator('.song-chord').first()).toHaveText('C')
  await page.getByRole('button', { name: 'Salvar cifra' }).click()
  await expect(page.getByRole('button', { name: 'Salva neste aparelho' })).toBeVisible()
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('button', { name: 'Aumentar acordes' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'artifacts/songs-reader-mobile.png', fullPage: true })
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await page.unrouteAll()
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: 'Diagnóstico' }).click()
  await page.getByRole('button', { name: 'Abrir repertório ou corrigir música' }).click()
  await page.getByRole('button', { name: /Canção Teste Artista Teste/ }).click()
  await expect(page.getByLabel('Acordes da música')).toContainText('F7M/C')
  expect(errors).toEqual([])
  await context.setOffline(false)
})
test('cancelled catalogue response cannot replace the current screen', async ({ page }) => {
  await mock(page)
  await page.route('**/api/music/chart?**', async (route) => {
    await new Promise((r) => setTimeout(r, 1000))
    await route.fulfill({ json: { chart, versions: [] } }).catch(() => {})
  })
  await page.getByLabel('Nome da música, artista ou link do Cifra Club').fill(url)
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.waitForTimeout(1300)
  await expect(page.getByRole('heading', { name: 'Qual é a música?' })).toBeVisible()
  await expect(page.getByLabel('Acordes da música')).toHaveCount(0)
})
test('recognition cancellation stops microphone tracks and sends no audio', async ({ page }) => {
  let uploads = 0
  await mock(page, true)
  await page.addInitScript(() => {})
  await page.evaluate(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await get(options)
      ;(window as unknown as { songStream: MediaStream }).songStream = stream
      return stream
    }
  })
  await page.route('**/api/music/recognize', async (route) => {
    uploads++
    await route.fulfill({ json: { songs: [] } })
  })
  await page.getByRole('button', { name: 'Reconhecer cantando' }).click()
  await expect(page.getByRole('heading', { name: 'Estou ouvindo você' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { songStream: MediaStream }).songStream
          .getTracks()
          .every((t) => t.readyState === 'ended'),
      ),
    )
    .toBe(true)
  expect(uploads).toBe(0)
})
test('recording produces one short sample and recognition candidates lead to catalogue versions', async ({
  page,
}) => {
  await mock(page, true)
  let uploadSize = 0
  await page.route('**/api/music/recognize', async (route) => {
    uploadSize = route.request().postDataBuffer()?.length || 0
    await route.fulfill({
      json: { songs: [{ ...song, source: 'acrcloud', sourceUrl: undefined }] },
    })
  })
  await page.getByRole('button', { name: 'Reconhecer cantando' }).click()
  await expect(page.getByRole('heading', { name: 'Esta é a sua música?' })).toBeVisible({
    timeout: 18000,
  })
  expect(uploadSize).toBeGreaterThan(1000)
  await page.getByRole('button', { name: /01 Canção Teste/ }).click()
  await expect(page.getByRole('heading', { name: 'Escolha a versão', exact: true })).toBeVisible()
})
test('catalogue failure keeps a useful recovery path', async ({ page }) => {
  await mock(page)
  await page.route('**/api/music/search?**', (route) =>
    route.fulfill({
      status: 502,
      json: { error: 'O catálogo está indisponível agora. Tente novamente em instantes.' },
    }),
  )
  await page.getByLabel('Nome da música, artista ou link do Cifra Club').fill('Teste')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('catálogo está indisponível')
  await expect(page.getByRole('button', { name: 'Buscar', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Voltar ao tom' }).click()
  await expect(page.getByRole('button', { name: 'Começar a ouvir' })).toBeVisible()
})
