import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const originOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

/**
 * S08 (D15.4): the Content-Security-Policy of the production build (not the dev server, whose
 * React refresh needs inline scripts). connect-src adds the API and Supabase origins. Two
 * additions beyond D15.4 keep merged features working: img-src has the Supabase origin (S04's
 * shop logo is a signed Storage link) and connect-src has the Sentry origin when Q02 is on.
 */
function contentSecurityPolicy(env: Record<string, string>): Plugin {
  const supabase = originOf(env.VITE_SUPABASE_URL);
  const connect = ["'self'", originOf(env.VITE_API_URL), supabase, originOf(env.VITE_SENTRY_DSN)];
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    `connect-src ${connect.filter(Boolean).join(' ')}`,
    `img-src 'self' data:${supabase ? ` ${supabase}` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
  return {
    name: 'ecofin-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:3001';
  const supabase = originOf(env.VITE_SUPABASE_URL);
  return {
    plugins: [
      react(),
      tailwindcss(),
      contentSecurityPolicy(env),
      // S08 (D15.1): the app shell is cached so the POS opens offline; API and Supabase calls
      // never are. A new version waits for the POS to be idle (OfflineController, D15.2).
      VitePWA({
        strategies: 'generateSW',
        registerType: 'prompt',
        injectRegister: false,
        devOptions: { enabled: false },
        includeAssets: ['favicon.ico', 'favicon.svg'],
        manifest: {
          name: 'EcoFin Pro',
          short_name: 'EcoFin',
          lang: 'ar',
          dir: 'rtl',
          start_url: '/sales/pos',
          scope: '/',
          display: 'standalone',
          theme_color: '#0b6b60',
          background_color: '#ffffff',
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
          // The main bundle (about 1.8 MB) must be precached or the POS can't start offline.
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            { urlPattern: /\/api\//, handler: 'NetworkOnly' },
            ...(supabase
              ? [
                  {
                    urlPattern: new RegExp(`^${escapeRegExp(supabase)}/`),
                    handler: 'NetworkOnly' as const,
                  },
                ]
              : []),
          ],
        },
      }),
    ],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    // S08 (D15.4): fonts are files, never data: URLs, so the CSP needs no font-src exception.
    build: {
      assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    },
    server: {
      port: 5173,
      // In dev, /api/* is proxied to the backend, so there is no CORS setup
      // and VITE_API_URL can stay empty.
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    // S08 (§6.4): the offline e2e runs against `vite preview`, with the same /api proxy.
    preview: {
      port: 4173,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
  };
});
