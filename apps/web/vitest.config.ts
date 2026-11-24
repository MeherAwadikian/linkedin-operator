import { defineConfig } from 'vitest/config';

/** Unit tests only; the e2e specs in e2e/ belong to Playwright, not Vitest. */
export default defineConfig({
  test: {
    include: ['{app,components,lib}/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
