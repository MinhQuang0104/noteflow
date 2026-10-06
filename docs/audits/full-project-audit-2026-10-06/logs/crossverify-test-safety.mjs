import assert from 'node:assert/strict'
import fs from 'node:fs'
const source = fs.readFileSync('tests/e2e/playwright.config.ts','utf8')
const compiled = source.replace(/^import .*\r?\n/gm,'').replace('export default defineConfig(', 'return defineConfig(')
const fixtureEnv = { DB_DATABASE: 'dev_fixture', DB_URL: 'postgresql://audit.invalid/dev_fixture' }
const evaluate = env => new Function('defineConfig','devices','process', compiled)(x=>x, {'Desktop Chrome':{},'Pixel 5':{}}, {env})
const native = evaluate(fixtureEnv)
const compose = evaluate({...fixtureEnv, NOTEFLOW_E2E_MODE:'compose'})
assert.equal(native.fullyParallel,true)
assert.equal(native.workers,undefined)
assert.equal(native.webServer[0].env.DB_DATABASE,fixtureEnv.DB_DATABASE)
assert.equal(native.webServer[0].env.DB_URL,fixtureEnv.DB_URL)
assert.equal(compose.workers,1)
assert.equal(compose.fullyParallel,false)
const phpunit = fs.readFileSync('backend/phpunit.xml','utf8')
const protectedNames = ['APP_ENV','DB_CONNECTION','DB_HOST','DB_PORT','DB_DATABASE','DB_USERNAME','DB_PASSWORD','DB_URL']
const envs = [...phpunit.matchAll(/<env\s+([^>]+)\/>/g)].map(m=>({name:m[1].match(/name="([^"]+)"/)?.[1],force:m[1].includes('force="true"')}))
const dbEnv = envs.filter(x=>protectedNames.includes(x.name))
assert.equal(dbEnv.length,8)
assert.equal(dbEnv.every(x=>x.force===false),true)
const caseSource = fs.readFileSync('backend/tests/TestCase.php','utf8')
assert.match(caseSource,/abstract class TestCase extends BaseTestCase\s*\{\s*\/\/\s*\}/)
const concurrency = fs.readFileSync('backend/tests/Feature/ChallengeConcurrencyTest.php','utf8')
assert.ok(concurrency.includes("DB::table('challenges')->delete()"))
assert.ok(concurrency.includes("DB::table('users')->delete()"))
const journal = fs.readFileSync('backend/tests/Feature/JournalConflictConcurrencyTest.php','utf8')
assert.ok(journal.includes("DB::table('challenge_daily_records')->delete()"))
const database = fs.readFileSync('backend/config/database.php','utf8')
assert.match(database,/'pgsql'\s*=>\s*\[[\s\S]*?'url'\s*=>\s*env\('DB_URL'\)/)
console.log(JSON.stringify({independent_lead_probe:true, native:{parallel:native.fullyParallel,workers:'default',non_test_database_inherited:true,url_inherited:true},
compose:{parallel:compose.fullyParallel,workers:compose.workers},phpunit_db_entries:dbEnv,test_case_preconnection_guard:false,unscoped_delete_setup:true,
runtime:'actual Playwright config evaluated with config/device/process stubs; PHPUnit XML/static destructive call trace',
limits:'No Playwright, PHPUnit, Laravel app or database invoked. PHPUnit env retention sourced from official13.4 docs, exact13.3.3 handler unavailable; Laravel pinned URL merge source independently read.',
kernel_or_browser_or_database_invoked:false},null,2))
