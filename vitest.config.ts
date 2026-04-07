import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'results/coverage/js',
      include: ['src/constants/**/*.ts', 'src/auth/**/*.ts'],
    },
  },
});
