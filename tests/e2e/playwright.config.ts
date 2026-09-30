import { defineConfig, devices } from '@playwright/test'

const composeMode = process.env.NOTEFLOW_E2E_MODE === 'compose'
const backendOrigin = composeMode ? 'http://127.0.0.1:8001' : 'http://127.0.0.1:8000'

export default defineConfig({
  testDir: '.',
  fullyParallel: !composeMode,
  workers: composeMode ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  testIgnore: ['**/helpers/php-runtime.test.ts', '**/helpers/db-helper-guard.test.ts'],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'laptop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        timezoneId: 'America/Los_Angeles',
      },
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo' },
    },
  ],
  webServer: [
    ...(composeMode
      ? []
      : [{
        command: 'php artisan serve --host=127.0.0.1 --port=8000',
        cwd: '../../backend',
        port: 8000,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          APP_ENV: 'testing',
          CACHE_STORE: 'array',
          CACHE_DRIVER: 'array',
          DB_CONNECTION: 'pgsql',
          DB_HOST: process.env.DB_HOST || '127.0.0.1',
          DB_PORT: process.env.DB_PORT || '55414',
          DB_DATABASE: process.env.DB_DATABASE || 'noteflow_test',
          DB_USERNAME: process.env.DB_USERNAME || 'noteflow',
          DB_PASSWORD: process.env.DB_PASSWORD || 'noteflow',
        },
      }]),
    {
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
      cwd: '../../frontend',
      port: 4173,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_BACKEND_ORIGIN: backendOrigin,
      },
    },
  ],
})
