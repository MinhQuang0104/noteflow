import { readFileSync, writeFileSync } from 'node:fs'
import { createV4Fixture } from './v4-architecture-fixture.mjs'

// Registry tests opt into scope declarations. The default architecture fixture
// remains byte-for-byte unchanged for no-registry compatibility coverage.
export function createRegistryFixture(options = {}) {
  const f = createV4Fixture(options)
  writeFileSync(f.paths.plan, readFileSync(f.paths.plan, 'utf8').replace('    depends_on: []',
    '    depends_on: []\n    scope:\n      paths: [src/fixture.txt]'))
  f.git(['add', '--', '_bmad-output/implementation-artifacts/story-9-1-plan.md'])
  f.git(['commit', '-m', 'test fixture: declare registry scope'])
  return f
}
