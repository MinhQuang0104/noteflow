import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import path from 'node:path'
import { buildPhpInvocation, getRuntimeMode } from './php-runtime.ts'

const rootDir = 'C:\\workspace with spaces\\noteflow'
const composeEnvironment = {
  NOTEFLOW_E2E_MODE: 'compose',
  APP_ENV: 'testing',
  DB_CONNECTION: 'pgsql',
  DB_HOST: 'postgres-test',
  DB_PORT: '5432',
  DB_DATABASE: 'noteflow_test',
  DB_URL: '',
}

const nativeEnvironment = {
  NOTEFLOW_E2E_MODE: 'native',
  APP_ENV: 'testing',
  DB_CONNECTION: 'pgsql',
  DB_HOST: '127.0.0.1',
  DB_PORT: '55414',
  DB_DATABASE: 'noteflow_test',
  DB_URL: '',
}

test('native mode invokes PHP with argv and the selected working directory', () => {
  const invocation = buildPhpInvocation(['db-helper.php', 'set-write-state', 'open'], 'helpers', {
    rootDir,
    env: nativeEnvironment,
  })

  assert.match(invocation.command, /php(?:\.exe)?$/)
  assert.deepEqual(invocation.args, [path.join(rootDir, 'tests', 'e2e', 'helpers', 'db-helper.php'), 'set-write-state', 'open'])
  assert.equal(invocation.cwd, rootDir)
})

test('compose mode invokes the fixed backend-test service without a shell', () => {
  const invocation = buildPhpInvocation(['db-helper.php', 'reset'], 'helpers', {
    rootDir,
    env: composeEnvironment,
  })

  assert.match(invocation.command, /docker(?:\.exe)?$/)
  assert.deepEqual(invocation.args.slice(-4), ['backend-test', 'php', '/workspace/tests/e2e/helpers/db-helper.php', 'reset'])
  assert.equal(invocation.args.includes('exec'), true)
  assert.equal(invocation.args.includes('-T'), true)
  assert.equal(invocation.cwd, rootDir)
})

test('arguments containing spaces remain one argument', () => {
  const invocation = buildPhpInvocation(['artisan', 'test --filter=space value'], 'backend', {
    rootDir,
    env: nativeEnvironment,
  })

  assert.deepEqual(invocation.args, ['artisan', 'test --filter=space value'])
})

test('invalid mode and mixed compose identity are rejected before execution', () => {
  assert.throws(() => getRuntimeMode({ NOTEFLOW_E2E_MODE: 'dev' }), /native.*compose/)
  assert.throws(
    () => buildPhpInvocation(['artisan', 'about'], 'backend', {
      rootDir,
      env: { ...composeEnvironment, DB_HOST: 'postgres' },
    }),
    /DB_HOST=postgres-test/,
  )
})

test('native mode rejects a non-empty DB_URL before execution', () => {
  assert.throws(
    () => buildPhpInvocation(['db-helper.php', 'reset'], 'helpers', {
      rootDir,
      env: { ...nativeEnvironment, DB_URL: 'postgresql://noteflow/noteflow' },
    }),
    /DB_URL=<empty>/,
  )
})
