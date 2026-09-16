import { test, expect } from '@playwright/test'
test('background during pending song permission releases the late microphone without uploading', async ({
  page,
}) => {
  let uploads = 0
  await page.route('**/api/music/status', (route) =>
    route.fulfill({ json: { catalog: true, lyrics: false, recognition: true } }),
  )
  await page.route('**/api/music/recognize', (route) => {
    uploads++
    return route.fulfill({ json: { songs: [] } })
  })
  await page.goto('/')
  await page.evaluate(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await get(options)
      ;(window as unknown as { lateSongStream: MediaStream }).lateSongStream = stream
      await new Promise((resolve) => setTimeout(resolve, 700))
      return stream
    }
  })
  await page.getByRole('button', { name: 'Diagnóstico' }).click()
  await page.getByRole('button', { name: 'Abrir repertório ou corrigir música' }).click()
  await page.getByRole('button', { name: 'Reconhecer cantando' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => !!(window as unknown as { lateSongStream?: MediaStream }).lateSongStream),
    )
    .toBe(true)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { lateSongStream: MediaStream }).lateSongStream
          .getTracks()
          .every((t) => t.readyState === 'ended'),
      ),
    )
    .toBe(true)
  await expect(page.getByRole('button', { name: 'Reconhecer cantando' })).toBeEnabled()
  expect(uploads).toBe(0)
})
