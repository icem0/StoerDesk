import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { resolveAppVersion } from './app-version.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // The application version comes from the development workflow: the tracked
  // `VERSION` file (present in every commit and image build), a CI override or
  // the nearest git tag. It is never the frontend stack version; only a checkout
  // without any of those falls back to `dev`.
  const appVersion = resolveAppVersion(env.APP_VERSION) ?? 'dev'

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'StörDesk',
          short_name: 'StörDesk',
          description: 'Malfunction desk — report and track malfunctions',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          lang: 'de',
          icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
        },
      }),
    ],
    resolve: {
      alias: {
        '@stoerdesk/shared': fileURLToPath(
          new URL('../../packages/shared/src/index.ts', import.meta.url),
        ),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: `http://localhost:${process.env.API_PORT ?? 3000}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
    },
  }
})
