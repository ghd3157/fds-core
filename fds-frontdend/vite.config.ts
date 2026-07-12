import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // sockjs-client는 Node.js의 `global`을 참조하므로 브라우저 환경에서 polyfill 필요
  define: {
    global: 'globalThis',
  },
})

