import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import viteSitemap from 'vite-plugin-sitemap';

export default defineConfig({
  plugins: [
    react(),
    viteSitemap({
      hostname: 'https://www.recebimentosmart.com.br',
      generateRobotsTxt: false, // Desativado para evitar erro de build
      robots: [
        {
          userAgent: '*',
          disallow: '',
        },
      ],
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react', 'pagarme'],
  },
  build: {
    rollupOptions: {
      external: ['pagarme'],
    },
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