import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 90000,
  expect: { timeout: 20000 }, reporter: [['list'], ['html', { open: 'never' }]],
  use: { actionTimeout: 20000, navigationTimeout: 30000, baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
    permissions: ['microphone', 'camera'],
  },
  webServer: { command: 'node --import tsx tests/support/runtime.ts', url: 'http://127.0.0.1:3100/api/health', timeout: 120000, reuseExistingServer: false },
});
