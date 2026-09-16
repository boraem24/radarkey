import { test, expect, chromium } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
test('melody through getUserMedia → YIN worker → G major', async () => {
  test.setTimeout(60000)
  const rate = 48000,
    pcs = [7, 11, 2, 9, 11, 2, 0, 4, 7, 2, 6, 9, 7, 11, 2, 7, 7, 7],
    samplesPerNote = rate * 0.65,
    total = pcs.length * samplesPerNote
  const wav = Buffer.alloc(44 + total * 2)
  wav.write('RIFF')
  wav.writeUInt32LE(36 + total * 2, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(total * 2, 40)
  for (let i = 0; i < total; i++) {
    const index = Math.floor(i / samplesPerNote),
      local = i % samplesPerNote,
      hz = 440 * 2 ** ((60 + pcs[index] - 69) / 12),
      envelope = Math.min(1, local / 1200, (samplesPerNote - local) / 1200)
    wav.writeInt16LE(
      Math.round(
        envelope *
          (0.3 * Math.sin((2 * Math.PI * hz * local) / rate) +
            0.12 * Math.sin((4 * Math.PI * hz * local) / rate)) *
          32767,
      ),
      44 + i * 2,
    )
  }
  mkdirSync('artifacts', { recursive: true })
  const file = path.resolve('artifacts/g-major.wav')
  writeFileSync(file, wav)
  const browser = await chromium.launch({
    channel: 'chrome',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${file}`,
    ],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto('http://localhost:4173')
    await page.getByRole('button', { name: 'Começar a ouvir' }).click()
    await expect(page.locator('.key-name')).toHaveText('G', { timeout: 20000 })
    await expect(page.getByRole('heading', { name: 'Notas ao vivo' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Possível cadência' })).toContainText(
      'G → D → Em → C',
    )
    await page.screenshot({ path: 'artifacts/mobile-listening.png', fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: 'artifacts/desktop-listening.png', fullPage: true })
    await page.getByRole('button', { name: 'Parar de ouvir' }).click()
  } finally {
    await browser.close()
  }
})
