import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: {
      port: 5173,
      // In dev, /api/* is proxied to the backend, so there is no CORS setup
      // and VITE_API_URL can stay empty.
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
