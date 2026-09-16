import { test, expect } from '@playwright/test'
test('mobile layout and real worker synthetic signal', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Começar a ouvir' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'artifacts/mobile-idle.png', fullPage: true })
  await page.getByRole('button', { name: 'Diagnóstico' }).click()
  await page.getByRole('button', { name: 'Testar seno de 440 Hz' }).click()
  await expect(page.locator('.diagnostics')).toContainText('A4', { timeout: 10000 })
  await expect(page.locator('.synthetic-label')).toBeVisible()
  await page.locator('select').selectOption('261.63')
  await expect(page.locator('.diagnostics')).toContainText('C4')
  await expect(page.locator('.key-name')).toHaveText('—')
  await page.getByRole('button', { name: 'Parar de ouvir' }).click()
  await expect(page.locator('.status')).toHaveText('PRONTO PARA OUVIR')
  expect(errors).toEqual([])
})
test('getUserMedia microphone path starts and stops', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Começar a ouvir' }).click()
  await expect(page.getByRole('button', { name: 'Parar de ouvir' })).toBeVisible()
  await page.getByRole('button', { name: 'Diagnóstico' }).click()
  await expect(page.locator('.diagnostics')).toContainText('running')
  await expect(page.locator('.synthetic-label')).toHaveCount(0)
  await page.getByRole('button', { name: 'Parar de ouvir' }).click()
  await expect(page.locator('.diagnostics')).toContainText('closed')
})
test('permission errors provide recovery', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('denied', 'NotAllowedError')
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Começar a ouvir' }).click()
  await expect(page.getByRole('alert')).toContainText('Microfone não autorizado')
  await expect(page.getByRole('button', { name: 'Começar a ouvir' })).toBeVisible()
})
test('background pauses capture', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Começar a ouvir' }).click()
  await expect(page.getByRole('button', { name: 'Parar de ouvir' })).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('alert')).toContainText('Escuta pausada')
  await expect(page.getByRole('button', { name: 'Começar a ouvir' })).toBeVisible()
})
test('PWA installs service worker and loads offline', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Começar a ouvir' })).toBeVisible()
  await page.getByRole('button', { name: 'Diagnóstico' }).click()
  await page.getByRole('button', { name: 'Testar seno de 440 Hz' }).click()
  await expect(page.locator('.diagnostics')).toContainText('A4')
  await context.setOffline(false)
})
test('cancel during a pending microphone request releases late stream', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints)
      ;(window as unknown as { lateStream: MediaStream }).lateStream = stream
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return stream
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Começar a ouvir' }).click()
  await page.getByRole('button', { name: 'Cancelar solicitação' }).click()
  await expect(page.getByRole('button', { name: 'Começar a ouvir' })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { lateStream?: MediaStream }).lateStream
          ?.getTracks()
          .every((t) => t.readyState === 'ended'),
      ),
    )
    .toBe(true)
})
test('missing microphone explains the problem', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('missing', 'NotFoundError')
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Começar a ouvir' }).click()
  await expect(page.getByRole('alert')).toContainText('Nenhum microfone disponível')
})
test('recovers a short AudioContext suspension without stopping listening', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.AudioContext
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options)
        ;(window as unknown as { testContext: AudioContext }).testContext = this
      }
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Diagnóstico' }).click()
  await page.getByRole('button', { name: 'Testar seno de 440 Hz' }).click()
  await expect(page.locator('.diagnostics')).toContainText('A4')
  await page.evaluate(() =>
    (window as unknown as { testContext: AudioContext }).testContext.suspend(),
  )
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { testContext: AudioContext }).testContext.state),
    )
    .toBe('running')
  await expect(page.getByRole('button', { name: 'Parar de ouvir' })).toBeVisible()
  await expect(page.locator('.diagnostics')).toContainText('A4')
})
test('restarts a stalled DSP worker automatically', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker
    let count = 0
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        if (++count === 1) this.postMessage = () => {}
      }
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Diagnóstico' }).click()
  await page.getByRole('button', { name: 'Testar seno de 440 Hz' }).click()
  await expect(page.locator('.diagnostics')).toContainText('A4', { timeout: 12000 })
  await expect(page.getByRole('button', { name: 'Parar de ouvir' })).toBeVisible()
})
