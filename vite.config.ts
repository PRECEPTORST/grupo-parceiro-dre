import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Em dev, as funções serverless rodam na produção do Vercel.
      // Troque o target pela URL do deploy assim que publicar o projeto.
      '/api': {
        target: 'https://grupo-parceiro-dre.vercel.app',
        changeOrigin: true,
      },
    },
  },
})
