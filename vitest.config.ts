import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The pure, Node-testable layer (TECH_PLAN C.1.2). React/Skia layers are
      // covered by the jest integration suite and the qa/ checklists.
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/__tests__/**', 'src/core/**/__fixtures__/**'],
      reporter: ['text-summary', 'text'],
      // CI gate: TECH_PLAN target is ≥ 90 % lines for core/.
      thresholds: { lines: 90, statements: 90, branches: 80, functions: 85 },
    },
  },
});
