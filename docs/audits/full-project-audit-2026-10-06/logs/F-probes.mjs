// Read-only WS-F audit probes: no browser, database, subprocess, or dependency writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
const declarations = (files, regex) => files.map(file => ({
  file, declarations: [...read(file).matchAll(regex)].length,
}));

const groups = {
  backend_unit: declarations(walk('backend/tests/Unit').filter(p => p.endsWith('Test.php')), /^\s*(?:it|test)\s*\(/gm),
  backend_feature: declarations(walk('backend/tests/Feature').filter(p => p.endsWith('Test.php')), /^\s*(?:it|test)\s*\(/gm),
  backend_contract: declarations(walk('backend/tests/Contract').filter(p => p.endsWith('Test.php')), /^\s*(?:it|test)\s*\(/gm),
  frontend: declarations(walk('frontend/src').filter(p => p.endsWith('.spec.ts')), /^\s*(?:it|test)(?:\.(?:each|for))?\s*\(/gm),
  e2e: declarations(walk('tests/e2e').filter(p => p.endsWith('.spec.ts')), /^\s*test\s*\(/gm),
  e2e_helpers: declarations(walk('tests/e2e/helpers').filter(p => p.endsWith('.test.ts')), /^\s*test\s*\(/gm),
  bmad: declarations(walk('_bmad/scripts/tests').filter(p => p.endsWith('.py')), /^\s*def\s+test_[A-Za-z_0-9]+\s*\(/gm),
  control_plane: declarations(walk('.agents/scripts').filter(p => p.endsWith('.test.mjs')), /^\s*test\s*\(/gm),
};
console.log(JSON.stringify({ kind: 'inventory', method: 'source declarations, not executed tests or coverage', groups,
  totals: Object.fromEntries(Object.entries(groups).map(([name, files]) => [name, {
    files: files.length, declarations: files.reduce((sum, file) => sum + file.declarations, 0),
  }])) }, null, 2));

const configSource = read('tests/e2e/playwright.config.ts')
  .replace(/^import[^\n]+\n/, '').replace('export default defineConfig(', 'return defineConfig(');
const evaluateConfig = environment => new Function('process', 'defineConfig', 'devices', configSource)(
  { env: environment }, value => value, { 'Desktop Chrome': {}, 'Pixel 5': {} },
);
const fixtureEnvironment = { NOTEFLOW_E2E_MODE: 'native', DB_DATABASE: 'audit_non_test_fixture',
  DB_URL: 'postgresql://audit.invalid/audit_non_test_fixture' };
const nativeConfig = evaluateConfig(fixtureEnvironment);
const composeConfig = evaluateConfig({ NOTEFLOW_E2E_MODE: 'compose' });
assert.equal(nativeConfig.fullyParallel, true);
assert.equal(nativeConfig.workers, undefined);
assert.equal(composeConfig.fullyParallel, false);
assert.equal(composeConfig.workers, 1);
assert.equal(nativeConfig.webServer[0].env.APP_ENV, 'testing');
assert.equal(nativeConfig.webServer[0].env.DB_DATABASE, 'audit_non_test_fixture');
assert.equal(nativeConfig.webServer[0].env.DB_URL, fixtureEnvironment.DB_URL);
const { buildPhpInvocation } = await import(pathToFileURL(path.join(root, 'tests/e2e/helpers/php-runtime.ts')).href);
const invocation = buildPhpInvocation(['artisan', 'about'], 'backend', { rootDir: root, env: fixtureEnvironment });
assert.equal(invocation.env.DB_URL, fixtureEnvironment.DB_URL);
const xml = read('backend/phpunit.xml');
const dbVariables = [...xml.matchAll(/<env\s+name="(APP_ENV|DB_[A-Z_]+)"([^>]+)\/>/g)]
  .map(match => ({ name: match[1], force: /\bforce="true"/.test(match[2]) }));
assert.equal(dbVariables.length, 8);
assert.equal(dbVariables.some(variable => variable.force), false);
const testCase = read('backend/tests/TestCase.php');
assert.equal(/getenv|DB_|database|noteflow_test|setUp|createApplication/.test(testCase), false);
console.log(JSON.stringify({ kind: 'configuration_probe', actual_source_evaluated: true,
  defineConfig_and_devices_stubbed: true, browser_started: false, database_connected: false,
  native: { fullyParallel: nativeConfig.fullyParallel, workerLimitExplicit: nativeConfig.workers !== undefined,
    appEnv: nativeConfig.webServer[0].env.APP_ENV,
    inheritedDatabase: nativeConfig.webServer[0].env.DB_DATABASE,
    inheritedDbUrl: nativeConfig.webServer[0].env.DB_URL },
  compose: { fullyParallel: composeConfig.fullyParallel, workers: composeConfig.workers },
  nativePhpInvocationPreservesDbUrl: invocation.env.DB_URL === fixtureEnvironment.DB_URL,
  phpunitEnvironmentForceAttributes: dbVariables, baseTestCaseHasSafetyGuard: false }, null, 2));
