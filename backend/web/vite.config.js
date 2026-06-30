import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// 开发时把 /api 代理到本地 Node 后端（默认 8787，可用 BACKEND_PORT 覆盖）。
// 构建产物直接输出到 backend/public/，由 Node 后端托管。
const backendPort = process.env.BACKEND_PORT ?? '8787'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${backendPort}`,
      '/health': `http://127.0.0.1:${backendPort}`,
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
})
