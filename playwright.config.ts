import { defineConfig, devices } from '@playwright/test';
import { configureE2E } from './scripts/e2e-env.mjs';

configureE2E();
const external = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  // The suite shares user preferences and mutates scheduling data.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    storageState: 'playwright/.auth/user.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.spec\.ts/, use: {
      ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] },
    } },
    ...['chromium', 'firefox', 'webkit'].map((name) => ({
      name, dependencies: ['setup'], testIgnore: /auth\.spec\.ts/,
      use: { ...devices[name === 'chromium' ? 'Desktop Chrome' : name === 'firefox' ? 'Desktop Firefox' : 'Desktop Safari'] },
    })),
  ],
  // The backend readiness endpoint becomes available only after migration/seeding.
  // Never reuse a developer process or an old database, including outside CI.
  webServer: external ? undefined : [
    { command: 'node scripts/e2e-server.mjs backend', url: 'http://127.0.0.1:18000/__e2e__/ready/',
      reuseExistingServer: false, stdout: 'pipe', timeout: 120_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } },
    { command: 'node scripts/e2e-server.mjs frontend', url: 'http://localhost:3000/login',
      reuseExistingServer: false, timeout: 120_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } },
  ],
});
