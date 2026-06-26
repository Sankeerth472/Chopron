import { defineConfig } from 'vite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  cacheDir: join(tmpdir(), 'chopron-vite-cache'),
  plugins: [react(), tailwindcss()],
})
