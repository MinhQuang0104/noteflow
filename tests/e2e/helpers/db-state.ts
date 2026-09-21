import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(currentDir, '../../..')
const backendDir = path.resolve(rootDir, 'backend')
const dbHelperScript = path.resolve(currentDir, 'db-helper.php')

const testEnv = {
  ...process.env,
  APP_ENV: process.env.APP_ENV || 'testing',
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: process.env.DB_PORT || '55414',
  DB_DATABASE: process.env.DB_DATABASE || 'noteflow_test',
  DB_USERNAME: process.env.DB_USERNAME || 'noteflow',
  DB_PASSWORD: process.env.DB_PASSWORD || 'noteflow',
}

export function resetTestDatabase(): void {
  execSync(`php "${dbHelperScript}" reset`, { cwd: rootDir, env: testEnv })
  execSync('php artisan cache:clear', { cwd: backendDir, env: testEnv })
}

export function setTestAccountWriteState(state: 'open' | 'locked_for_import'): void {
  execSync(`php "${dbHelperScript}" set-write-state ${state}`, { cwd: rootDir, env: testEnv })
}

export function getTestAccountRevision(): number {
  const output = execSync(`php "${dbHelperScript}" get-revision`, { cwd: rootDir, env: testEnv }).toString()
  const parsed = JSON.parse(output) as { account_revision: number }
  return parsed.account_revision
}

export function getTestAccountEpoch(): number {
  const output = execSync(`php "${dbHelperScript}" get-epoch`, { cwd: rootDir, env: testEnv }).toString()
  const parsed = JSON.parse(output) as { data_epoch: number }
  return parsed.data_epoch
}

export function bumpTestAccountRevision(): number {
  const output = execSync(`php "${dbHelperScript}" bump-revision`, { cwd: rootDir, env: testEnv }).toString()
  const parsed = JSON.parse(output) as { account_revision: number }
  return parsed.account_revision
}
