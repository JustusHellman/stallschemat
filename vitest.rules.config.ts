import { defineConfig } from 'vitest/config';

// Runs against the Firestore emulator (see `npm run test:rules`).
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    fileParallelism: false,
  },
});
