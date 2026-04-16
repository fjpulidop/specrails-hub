/**
 * Vite config for the static demo build.
 *
 * Uses demo-entry.tsx as the entry point which patches fetch and WebSocket
 * so the hub UI runs entirely from static fixtures — no backend needed.
 *
 * Output goes to dist-demo/ and is intended to be copied into
 * specrails-web/public/hub-demo/ for iframe embedding.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    // Empty WS URL — WebSocket is mocked in demo-entry.tsx
    __WS_URL__: JSON.stringify(''),
  },
  base: '/hub-demo/',
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Use demo.html which points to demo-entry.tsx instead of main.tsx
        main: resolve(__dirname, 'demo.html'),
      },
    },
  },
})
