import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm.cmd run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
