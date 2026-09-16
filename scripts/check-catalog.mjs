// Optional live smoke check. Requires a running KeyRadar server; no service credentials.
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(process.env.KEYRADAR_CHECK_URL || 'http://localhost:4173')
  await page.getByRole('button', { name: 'Encontre a música.' }).click()
  await page.screenshot({ path: 'artifacts/catalog-search-mobile.png', fullPage: true })
  await page.getByLabel('Nome da música, artista ou link do Cifra Club').fill('Bondade de Deus')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  const choice = page.getByRole('button', { name: /Bondade de Deus Isaías Saad/ }).first()
  await choice.waitFor({ timeout: 25000 })
  await page.screenshot({ path: 'artifacts/catalog-versions-mobile.png', fullPage: true })
  await choice.click()
  await page.getByRole('button', { name: /Principal 7 partes/ }).waitFor({ timeout: 25000 })
  await page.screenshot({ path: 'artifacts/catalog-arrangements-mobile.png', fullPage: true })
  await page.getByRole('button', { name: /Principal 7 partes/ }).click()
  const count = await page.locator('.song-chord').count()
  if (count < 50) throw Error('Unexpectedly short real chart')
  await page.getByLabel('Tom para tocar').selectOption('2')
  if ((await page.locator('.song-chord').first().textContent()) !== 'D')
    throw Error('Capo transposition failed')
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)))
    throw Error('Mobile overflow')
  await page.screenshot({ path: 'artifacts/catalog-reader-mobile.png', fullPage: true })
  if (errors.length) throw Error(errors.join('; '))
  console.log(
    JSON.stringify({
      liveCatalog: true,
      artist: 'Isaías Saad',
      chart: 'Principal',
      chords: count,
      transposedTo: 'D',
      mobileOverflow: false,
      browserErrors: errors,
    }),
  )
} finally {
  await browser.close()
}
