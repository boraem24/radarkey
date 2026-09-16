import { test, expect } from '@playwright/test'

test('one listen identifies the key and automatically searches the recognized song', async ({
  page,
}) => {
  let uploads = 0
  await page.route('**/api/music/status', (route) =>
    route.fulfill({ json: { catalog: true, lyrics: false, recognition: true } }),
  )
  await page.route('**/api/music/recognize', async (route) => {
    uploads++
    expect(route.request().postDataBuffer()?.length).toBeGreaterThan(1000)
    await route.fulfill({
      json: {
        songs: [
          { id: 'recognized', title: 'Canção Teste', artist: 'Artista Teste', source: 'acrcloud' },
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
  await page.route('**/api/music/chart?**', (route) =>
    route.fulfill({
      json: {
        chart: {
          id: 'chart',
          song: {
            id: 'chart',
            title: 'Canção Teste',
            artist: 'Artista Teste',
            source: 'cifraclub',
            sourceUrl: 'https://www.cifraclub.com.br/artista-teste/cancao-teste/',
          },
          name: 'Principal',
          originalKey: 0,
          capo: 0,
          sections: [{ id: 's1', name: 'Refrão', lines: [['C', 'G', 'Am', 'F']] }],
          sourceUrl: 'https://www.cifraclub.com.br/artista-teste/cancao-teste/',
          searchText: '',
          savedAt: 0,
        },
        versions: [
          { name: 'Principal', url: 'https://www.cifraclub.com.br/artista-teste/cancao-teste/' },
        ],
      },
    }),
  )
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Encontre a música.' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Começar a ouvir' }).click()
  await expect(page.getByLabel('Identificação da música')).toContainText(
    'Também estou procurando a música',
  )
  await expect(page.getByLabel('Identificação da música')).toContainText(
    'Música provável encontrada',
    { timeout: 18000 },
  )
  await expect(page.getByRole('button', { name: /Canção Teste.*Ver cifra/ })).toBeVisible()
  await page.getByRole('button', { name: /Canção Teste.*Ver cifra/ }).click()
  await expect(page.getByLabel('Acordes da música')).toContainText('C')
  await expect(page.getByLabel('Acordes da música')).toContainText('Am')
  expect(uploads).toBe(1)
})
