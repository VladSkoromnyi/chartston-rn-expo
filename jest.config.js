/**
 * jest — `<Chart/>` integration tests (TECH_PLAN C.1.2, `react/` layer).
 * `core/` is unit-tested with vitest (`*.test.ts`); jest owns `*.test.tsx`.
 */
module.exports = {
  preset: '@react-native/jest-preset',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.tsx'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // A recording canvas instead of native Skia: tests assert what was drawn.
    '^@shopify/react-native-skia$': '<rootDir>/src/react/__tests__/skia-mock.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|react-native-reanimated|react-native-worklets|react-native-gesture-handler|@gorhom)/)',
  ],
};
