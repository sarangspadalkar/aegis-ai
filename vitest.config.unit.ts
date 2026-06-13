import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    exclude: [
      'packages/infrastructure/src/**',
      'packages/*/src/**/*.integration.test.ts',
      '**/node_modules/**',
      '**/dist/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/*.test.ts',
        'packages/infrastructure/src/**',
        '**/node_modules/**',
        '**/dist/**',
      ],
      thresholds: {
        statements: 70,
        functions: 75,
        lines: 70,
        branches: 45,
      },
    },
  },
});
