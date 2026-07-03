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
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.error('[Vite Proxy Error]:', err.message);
            if ('writeHead' in res && typeof res.writeHead === 'function' && !res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Servidor local temporariamente indisponível.' }));
            }
          });
        },
      },
    },
  },
});