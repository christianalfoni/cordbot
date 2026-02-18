import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // Strip guildId prefix before forwarding workspace API calls to the bot
      '/api/workspace': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/workspace\/[^/]+/, '/api/workspace'),
      },
    },
  },
})
