import { readFile, writeFile } from 'node:fs/promises'

if (process.platform !== 'win32') {
  process.exit(0)
}

const bundleUrl = new URL('../node_modules/playwright-core/lib/coreBundle.js', import.meta.url)
const original = 'recursive: true, force: true, maxRetries: 10'
const patched = "recursive: true, force: true, maxRetries: process.platform === 'win32' ? 0 : 10"
const source = await readFile(bundleUrl, 'utf8')

if (source.includes(patched)) {
  process.exit(0)
}

if (!source.includes(original)) {
  throw new Error('Unsupported Playwright cleanup implementation; review the Windows patch.')
}

await writeFile(bundleUrl, source.replace(original, patched))
