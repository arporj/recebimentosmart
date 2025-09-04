import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import viteSitemap from 'vite-plugin-sitemap';

export default defineConfig({
  plugins: [
    react(),
    viteSitemap({
      hostname: 'https://www.recebimentosmart.com.br',
      robots: [], // Adicionado para evitar que o plugin gerencie o robots.txt
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
