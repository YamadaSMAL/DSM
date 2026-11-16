import { execFileSync } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  define: {__APP_VERSION__:JSON.stringify(pkg.version),__APP_COMMIT__:JSON.stringify(process.env['GITHUB_SHA'] ?? (()=>{try{return execFileSync('git',['describe','--always','--dirty'],{encoding:'utf8'}).trim();}catch{return 'unknown';}})())},
  optimizeDeps: { include: ['papaparse', 'fflate', 'xlsx'] },
  base: process.env['DSM_BASE_PATH'] ?? '/',
  build: { target: ['chrome120', 'edge120', 'firefox121', 'safari17'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
