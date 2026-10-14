import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({
      test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.test.{ts,tsx}'],
        css: false,
        // Hosted CI runners need more time for interaction-heavy jsdom tests.
        testTimeout: process.env.CI ? 15000 : 5000,
      },
    }),
  ),
);
