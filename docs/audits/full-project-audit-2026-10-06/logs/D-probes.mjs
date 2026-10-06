// Read-only WS-D audit probes. No network or source writes.
// Run from any cwd:
// node --experimental-transform-types <absolute-worktree>/docs/audits/full-project-audit-2026-10-06/logs/D-probes.mjs
// Probe expectations characterize contract gaps; they are not backend Contract suite results.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = await import(new URL('../../../../frontend/src/api/challenges.ts', import.meta.url));
const challengeId = '11111111-1111-4111-8111-111111111111';
const cases = [
  ['minimal-version-conflict', { message: 'Version conflict', code: 'version_conflict' }, false],
  ['wrong-family-snapshot', {
    message: 'Version conflict', code: 'version_conflict', resource_id: challengeId, current_version: 1,
    current_snapshot: { id: challengeId, name: 'Example', description: null, start_date: '2026-09-19', target_days: 3, row_version: 1 },
  }, false],
  ['actual-journal-conflict-shape', {
    message: 'Version conflict', code: 'version_conflict', resource_id: challengeId, current_version: 1,
    current_snapshot: { challenge_id: challengeId, local_date: '2026-09-19', journal: 'Saved', journal_version: 1 },
  }, true],
];
const originalFetch = globalThis.fetch;
try {
  for (const [label, body, expectedPreserved] of cases) {
    globalThis.fetch = async () => new Response(JSON.stringify(body), {
      status: 409, headers: { 'Content-Type': 'application/problem+json' },
    });
    let captured;
    try {
      await api.saveChallengeJournal(challengeId, '2026-09-19', {
        command_id: '22222222-2222-4222-8222-222222222222',
        data_epoch: 1, base_version: 0, journal: 'Draft',
      });
    } catch (error) {
      captured = error;
    }
    assert(captured instanceof api.ChallengeApiError);
    assert.equal(captured.status, 409);
    assert.equal(captured.problem !== undefined, expectedPreserved);
    console.log(JSON.stringify({ probe: 'journal-parser', label, status: captured.status, problemPreserved: captured.problem !== undefined }));
  }
} finally {
  globalThis.fetch = originalFetch;
}

const pattern = new RegExp('(^|, ?)(private|no-store)');
for (const value of ['private', 'no-store', 'private, no-store', 'public, no-store']) {
  const accepts = pattern.test(value);
  assert.equal(accepts, true);
  console.log(JSON.stringify({ probe: 'private-no-store-pattern', value, accepts }));
}

const generatorSource = readFileSync(new URL('../../../../frontend/scripts/generate-openapi-types.mjs', import.meta.url), 'utf8');
const definitionStart = generatorSource.indexOf('function quote(');
const definitionEnd = generatorSource.indexOf('async function generatedSource(');
assert(definitionStart >= 0 && definitionEnd > definitionStart);
const definitions = generatorSource.slice(definitionStart, definitionEnd);
const generate = new Function('document', definitions + '\nreturn generateOperations(document);');
const operation = { operationId: 'createChallenge', responses: { '201': { content: { 'application/json': { schema: { type: 'string' } } } } } };
const baseline = { paths: { '/api/v1/challenges': { post: operation } } };
const changes = [
  ['path-only-change', { paths: { '/api/v2/challenges': { post: operation } } }],
  ['method-only-change', { paths: { '/api/v1/challenges': { put: operation } } }],
  ['request-body-only-change', { paths: { '/api/v1/challenges': { post: { ...operation, requestBody: { required: true, content: { 'application/json': { schema: { type: 'string' } } } } } } } }],
];
for (const [label, document] of changes) {
  const generatedOperationsUnchanged = generate(baseline) === generate(document);
  assert.equal(generatedOperationsUnchanged, true);
  console.log(JSON.stringify({ probe: 'generator-projection', label, generatedOperationsUnchanged }));
}
console.log('READ_ONLY_PROBES_COMPLETE');
