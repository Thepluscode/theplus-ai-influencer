import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 'server-only' is a Next.js boundary marker that throws outside RSC.
      // Stub it in tests so we can unit-test functions that live in
      // server-only modules (e.g. prompt builders).
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
    },
  },
});
