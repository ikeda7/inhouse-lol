import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    // Proxy do /api evita CORS no dev e deixa o front usar caminho relativo.
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
  // O .env fica na raiz do repositorio, um nivel acima de client/.
  envDir: path.resolve(__dirname, '..'),
});
