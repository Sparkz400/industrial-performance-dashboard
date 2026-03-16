import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 15000,
    setupFiles: ['src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/**/*.test.ts', 'src/database/seed.ts'],
      thresholds: {
        statements: 10,
        branches: 5,
        functions: 5,
        lines: 10,
      },
    },
  },
});
