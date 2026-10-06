import { getRuntimeMode, runTestPhp } from './php-runtime'

const composeMode = getRuntimeMode() === 'compose'

const testEnv = {
  ...process.env,
  APP_ENV: 'testing',
  CACHE_STORE: 'array',
  CACHE_DRIVER: 'array',
  DB_CONNECTION: 'pgsql',
  DB_HOST: composeMode ? 'postgres-test' : (process.env.DB_HOST || '127.0.0.1'),
  DB_PORT: composeMode ? '5432' : (process.env.DB_PORT || '55414'),
  DB_DATABASE: 'noteflow_test',
  DB_USERNAME: process.env.DB_USERNAME || 'noteflow',
  DB_PASSWORD: process.env.DB_PASSWORD || 'noteflow',
  DB_URL: composeMode ? '' : (process.env.DB_URL || ''),
}

export function resetTestDatabase(): void {
  runTestPhp(['db-helper.php', 'reset'], 'helpers', testEnv)
  runTestPhp(['artisan', 'cache:clear'], 'backend', testEnv)
}

export interface TestJournalState {
  challenge_id: string
  local_date: string
  start_date: string
  journal: string | null
  journal_version: number
  completion_version: number
  is_done: boolean
  account_revision: number
  journal_commands: number
}

export function getTestJournalState(challengeId: string, localDate: string): TestJournalState | null {
  return JSON.parse(runTestPhp(['db-helper.php', 'get-journal-state', challengeId, localDate], 'helpers', testEnv)) as TestJournalState | null
}

export function setTestAccountWriteState(state: 'open' | 'locked_for_import'): void {
  runTestPhp(['db-helper.php', 'set-write-state', state], 'helpers', testEnv)
}

export function getTestAccountRevision(): number {
  const output = runTestPhp(['db-helper.php', 'get-revision'], 'helpers', testEnv)
  const parsed = JSON.parse(output) as { account_revision: number }
  return parsed.account_revision
}

export function getTestAccountEpoch(): number {
  const output = runTestPhp(['db-helper.php', 'get-epoch'], 'helpers', testEnv)
  const parsed = JSON.parse(output) as { data_epoch: number }
  return parsed.data_epoch
}

export function bumpTestAccountRevision(): number {
  const output = runTestPhp(['db-helper.php', 'bump-revision'], 'helpers', testEnv)
  const parsed = JSON.parse(output) as { account_revision: number }
  return parsed.account_revision
}
