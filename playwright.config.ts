import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testIgnore: '**/subpath.spec.ts', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', viewport: { width: 1360, height: 1000 }, trace: 'retain-on-failure',
    launchOptions: process.env['DSM_BROWSER_EXECUTABLE'] ? { executablePath: process.env['DSM_BROWSER_EXECUTABLE'] } : {},
  },
  webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
  reporter: [['list']],
});
