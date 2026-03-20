import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    root: '.',
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
  },
});
