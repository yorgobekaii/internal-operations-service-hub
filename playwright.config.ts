import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'line',
  // The release gate owns its production servers. When this command is run
  // directly, start the local development servers so the smoke suite is
  // independently runnable instead of failing with connection refused.
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: 'npm run build:backend && npm run test:backend:e2e && npm run start:prod --workspace=@internal/backend',
          url: 'http://127.0.0.1:3000/health',
          env: {
            PORT: '3000',
            DATABASE_URL: 'file:./test.db',
            AI_PROVIDER: 'mock',
          },
          timeout: 120_000,
          reuseExistingServer: true,
        },
        {
          command: 'npm run build --workspace=frontend && npm run start --workspace=frontend -- -p 3001',
          url: 'http://127.0.0.1:3001/select-role',
          env: {
            NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3000',
          },
          timeout: 120_000,
          reuseExistingServer: true,
        },
      ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3001',
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure',
  },
});
