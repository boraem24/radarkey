import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { musicApi } from './server/api.mjs'
export default defineConfig({
  test: { environment: 'jsdom', setupFiles: './tests/setup.ts' },
  plugins: [
    react(),
    musicApi(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: { enabled: false },
      manifest: {
        name: 'KeyRadar — Encontre o tom',
        short_name: 'KeyRadar',
        description: 'Análise local de voz a cappella e estimativa de tonalidade.',
        lang: 'pt-BR',
        theme_color: '#0b1012',
        background_color: '#0b1012',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
      interval: 500,
      ignored: ['**/tools/**', '**/artifacts/**', '**/test-results/**', '**/scripts/**'],
    },
    strictPort: true,
    allowedHosts: ['.trycloudflare.com', '.lhr.life', '.localhost.run'],
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com', '.lhr.life', '.localhost.run'],
  },
})

