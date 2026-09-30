import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type PhpWorkingDirectory = 'backend' | 'helpers'
export type PhpRuntimeMode = 'native' | 'compose'

export interface PhpInvocation {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string | undefined>
}

export interface PhpRuntimeOptions {
  rootDir?: string
  env?: Record<string, string | undefined>
}

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const defaultRootDir = path.resolve(currentDir, '../../..')
const backendDirName = 'backend'
const helperScriptName = 'db-helper.php'

const composeIdentity: Record<string, string> = {
  APP_ENV: 'testing',
  DB_HOST: 'postgres-test',
  DB_PORT: '5432',
  DB_DATABASE: 'noteflow_test',
  DB_URL: '',
}

export function getRuntimeMode(environment: Record<string, string | undefined> = process.env): PhpRuntimeMode {
  const mode = (environment.NOTEFLOW_E2E_MODE ?? 'native').trim().toLowerCase()
  if (mode === '' || mode === 'native') {
    return 'native'
  }

  if (mode === 'compose') {
    return 'compose'
  }

  throw new Error(`NOTEFLOW_E2E_MODE must be 'native' or 'compose'; received '${mode}'.`)
}

function assertComposeIdentity(environment: Record<string, string | undefined>): void {
  for (const [name, expected] of Object.entries(composeIdentity)) {
    if (environment[name] !== expected) {
      throw new Error(`Compose test runtime requires ${name}=${expected || "<empty>"}; received ${environment[name] ?? '<missing>'}.`)
    }
  }
}

function mapPhpArguments(args: string[], workingDirectory: PhpWorkingDirectory, rootDir: string, mode: PhpRuntimeMode): string[] {
  if (args.length === 0) {
    throw new Error('PHP runtime requires at least one argument.')
  }

  const firstArgument = args[0]
  if (workingDirectory === 'helpers' && path.basename(firstArgument) === helperScriptName) {
    if (mode === 'compose') {
      return ['/workspace/tests/e2e/helpers/db-helper.php', ...args.slice(1)]
    }

    return [path.join(rootDir, 'tests', 'e2e', 'helpers', helperScriptName), ...args.slice(1)]
  }

  return [...args]
}

function sanitizeComposeEnvironment(environment: Record<string, string | undefined>): Record<string, string | undefined> {
  const childEnvironment: Record<string, string | undefined> = { ...environment }

  for (const name of Object.keys(childEnvironment)) {
    if (name.startsWith('LOCAL_') || name.startsWith('COMPOSE_')) {
      delete childEnvironment[name]
    }
  }

  return {
    ...childEnvironment,
    ...composeIdentity,
    NOTEFLOW_E2E_MODE: 'compose',
  }
}

export function buildPhpInvocation(
  args: string[],
  workingDirectory: PhpWorkingDirectory,
  options: PhpRuntimeOptions = {},
): PhpInvocation {
  const rootDir = path.resolve(options.rootDir ?? defaultRootDir)
  const environment = options.env ?? process.env
  const mode = getRuntimeMode(environment)

  if (workingDirectory !== 'backend' && workingDirectory !== 'helpers') {
    throw new Error(`Unsupported PHP working directory '${workingDirectory}'.`)
  }

  if (mode === 'native') {
    return {
      command: process.platform === 'win32' ? 'php.exe' : 'php',
      args: mapPhpArguments(args, workingDirectory, rootDir, mode),
      cwd: workingDirectory === 'backend' ? path.join(rootDir, backendDirName) : rootDir,
      env: { ...environment },
    }
  }

  assertComposeIdentity(environment)

  return {
    command: process.platform === 'win32' ? 'docker.exe' : 'docker',
    args: [
      '--context',
      'desktop-linux',
      'compose',
      '--profile',
      'test',
      '--project-directory',
      rootDir,
      '--file',
      path.join(rootDir, 'compose.local.yaml'),
      '--env-file',
      path.join(rootDir, 'deploy', 'local', '.env'),
      '--project-name',
      'noteflow-local',
      'exec',
      '-T',
      'backend-test',
      'php',
      ...mapPhpArguments(args, workingDirectory, rootDir, mode),
    ],
    cwd: rootDir,
    env: sanitizeComposeEnvironment(environment),
  }
}

export function runTestPhp(
  args: string[],
  workingDirectory: PhpWorkingDirectory,
  environment: Record<string, string | undefined> = process.env,
): string {
  const invocation = buildPhpInvocation(args, workingDirectory, { env: environment })
  return execFileSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: invocation.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}
