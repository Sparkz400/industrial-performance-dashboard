import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['src/test/setup.ts'],
      globals: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/test/**', 'src/**/*.test.*', 'src/**/*.stories.*', 'src/**/__stories__/**'],
        thresholds: {
          statements: 5,
          branches: 3,
          functions: 5,
          lines: 5,
        },
      },
    },
  }),
);
