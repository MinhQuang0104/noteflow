import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const helperPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'db-helper.php')
const phpCommand = process.platform === 'win32' ? 'php.exe' : 'php'

function runGuard(environment: Record<string, string | undefined>): string {
  try {
    execFileSync(phpCommand, [helperPath, 'reset'], {
      env: environment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const processError = error as { stderr?: Buffer | string }
    return processError.stderr?.toString() ?? ''
  }

  throw new Error('db-helper unexpectedly accepted an unsafe environment')
}

test('db-helper rejects a non-testing database before PostgreSQL connection', () => {
  const stderr = runGuard({
    ...process.env,
    APP_ENV: 'local',
    DB_DATABASE: 'noteflow',
    DB_HOST: '127.0.0.1',
    DB_PORT: '5432',
    DB_USERNAME: 'noteflow',
    DB_PASSWORD: 'noteflow',
    DB_URL: '',
  })

  assert.match(stderr, /APP_ENV must be 'testing'/)
})

test('db-helper rejects missing identity variables before PostgreSQL connection', () => {
  const environment = { ...process.env }
  delete environment.APP_ENV
  delete environment.DB_DATABASE
  delete environment.DB_HOST
  delete environment.DB_PORT
  delete environment.DB_USERNAME
  delete environment.DB_PASSWORD

  const stderr = runGuard(environment)
  assert.match(stderr, /requires explicit test identity environment/)
})

test('db-helper rejects a non-empty DB_URL before PostgreSQL connection', () => {
  const stderr = runGuard({
    ...process.env,
    APP_ENV: 'testing',
    DB_DATABASE: 'noteflow_test',
    DB_HOST: '127.0.0.1',
    DB_PORT: '55414',
    DB_USERNAME: 'noteflow',
    DB_PASSWORD: 'noteflow',
    DB_URL: 'postgresql://noteflow:noteflow@127.0.0.1:55414/noteflow',
  })

  assert.match(stderr, /DB_URL to be empty/)
})

test('db-helper rejects a non-test PostgreSQL endpoint before connection', () => {
  const stderr = runGuard({
    ...process.env,
    APP_ENV: 'testing',
    DB_DATABASE: 'noteflow_test',
    DB_HOST: 'postgres',
    DB_PORT: '5432',
    DB_USERNAME: 'noteflow',
    DB_PASSWORD: 'noteflow',
    DB_URL: '',
  })

  assert.match(stderr, /test PostgreSQL endpoint/)
})
