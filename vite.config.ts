import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  base: process.env['DSM_BASE_PATH'] ?? '/',
  build: { target: ['chrome120', 'edge120', 'firefox121', 'safari17'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
