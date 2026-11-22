import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/maps': 'http://127.0.0.1:4173',
      '/api/geocoding': 'http://127.0.0.1:4173',
      '/maps': 'http://127.0.0.1:4173',
    },
  },
})
