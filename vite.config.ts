/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pagesCspPlugin } from './build/csp';

export default defineConfig({
  base: './',
  plugins: [react(), pagesCspPlugin()],
  resolve: {
    // One copy of CodeMirror even though vanilla-jsoneditor also depends on it.
    dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language'],
  },
  build: { manifest: true, target: 'es2022' },
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/tools/*/logic.ts'],
      exclude: ['**/*.test.*', '**/*.worker.ts', '**/types.ts', '**/protocol.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 90 },
    },
  },
});
