import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const frontendRoot = fileURLToPath(new URL('../', import.meta.url))
const contractPath = fileURLToPath(new URL('../../contracts/openapi.yaml', import.meta.url))
const original = await readFile(contractPath, 'utf8')
const changed = original.replace('- noteflow-api', '- noteflow-api-drift')

if (changed === original) {
  throw new Error('Contract drift proof could not find its controlled mutation target.')
}

try {
  await writeFile(contractPath, changed, 'utf8')
  const staleCheck = spawnSync(process.execPath, ['scripts/generate-openapi-types.mjs', '--check'], {
    cwd: frontendRoot,
    encoding: 'utf8',
  })

  if (staleCheck.status === 0) {
    throw new Error('Contract drift check unexpectedly accepted stale generated types.')
  }
} finally {
  await writeFile(contractPath, original, 'utf8')
}

const restoredCheck = spawnSync(process.execPath, ['scripts/generate-openapi-types.mjs', '--check'], {
  cwd: frontendRoot,
  encoding: 'utf8',
})

if (restoredCheck.status !== 0) {
  process.stderr.write(restoredCheck.stderr)
  throw new Error('Contract drift check failed after restoring the canonical contract.')
}

console.log('Contract drift proof passed: stale types failed and the restored contract passed.')
