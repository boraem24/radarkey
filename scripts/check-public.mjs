import { chromium } from '@playwright/test'
const url = process.argv[2]
if (!url?.startsWith('https://')) throw Error('Informe um endereço HTTPS.')
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await page.getByRole('button', { name: 'Começar a ouvir' }).waitFor()
  if (await page.getByRole('heading', { name: 'Notas ao vivo' }).count()) throw Error('Interface antiga ainda contém Notas ao vivo')
  await page.getByText('Áudio local · v0.4.0').waitFor()
  await page.getByRole('button', { name: 'Diagnóstico' }).click()
  await page.getByRole('button', { name: 'Testar seno de 440 Hz' }).click()
  await page.waitForFunction(
    () => document.querySelector('.diagnostics')?.textContent?.includes('A4'),
    {},
    { timeout: 15000 },
  )
  console.log(
    JSON.stringify(
      {
        url,
        version: '0.3.0',
        liveNotesRemoved: true,
        status: response.status(),
        secureContext: await page.evaluate(() => isSecureContext),
        microphoneAPI: await page.evaluate(() => typeof navigator.mediaDevices?.getUserMedia),
        pitch: await page.locator('.diagnostics').innerText(),
        errors,
      },
      null,
      2,
    ),
  )
  await page.getByRole('button', { name: 'Parar de ouvir' }).click()
  if (errors.length) process.exitCode = 1
} finally {
  await browser.close()
}


