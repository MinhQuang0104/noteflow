import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const backendRoutes = [
  '^/api(?:/|$)',
  '^/sanctum(?:/|$)',
  '^/login$',
  '^/logout$',
  '^/up$',
] as const

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:8000'
  const backendProxy = Object.fromEntries(
    backendRoutes.map((route) => [route, { target, changeOrigin: false } satisfies ProxyOptions]),
  )

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: { proxy: backendProxy },
    preview: { proxy: backendProxy },
  }
})
