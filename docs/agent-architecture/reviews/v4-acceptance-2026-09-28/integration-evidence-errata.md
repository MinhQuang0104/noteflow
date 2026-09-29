# V4 integration evidence errata

Date: 2026-09-29

This errata supplements the historical Batch A--D artifacts. It does not
rewrite, relabel, or delete any historical raw evidence, bundle, findings
ledger, acceptance matrix, or final-decision report.

## Hashing basis

The historical Batch D index mixes revision identity with file-byte identity.
This errata separates them:

- `Git blob SHA-1` is the object id returned by
  `git rev-parse <revision>:<path>`.
- `Git blob SHA-256` is SHA-256 over the exact bytes returned by
  `git cat-file blob <revision>:<path>`.
- `working-tree SHA-256` is SHA-256 over the exact bytes read from the
  checkout. It is line-ending sensitive and is not substituted for a Git
  revision binding.

The new integration index uses Git-blob bytes for revision-bound errata and
records the candidate bundle's exact working-tree source bindings separately.

## ERR-01 — migration-note source binding

Historical field: `batch-d-evidence-index.json`, source file
`.agents/docs/v4-lite-migration.md`, recorded as `sha256:0cde1c2a4ed1f388fa1db412221a4cd4f591a6fd6a469c2469e8fbcc1c1bc3ab`
with `7086` bytes.

The recorded `7086`-byte value cannot be reproduced from the recorded Git
revision or from the current checked-out bytes. The reproducible values are:

| Subject | Bytes | LF | CRLF | Git blob SHA-1 | SHA-256 of exact bytes |
|---|---:|---:|---:|---|---|
| tested source `0e4c6b9` Git blob | 7010 | 118 | 0 | `3bc638b7f0ce4508db0b110105ea5e61216046fa` | `d984ffcf9bf238a9127d3cafbc5fd1221ef2c528c7b16a1c210e3ce8b225ed43` |
| handoff/integration `f9af346`/`ad9c18d` Git blob | 8349 | 145 | 0 | `ed6bec2a74e87bf6b00945af45cf23e7ad983b44` | `f7cb24b50ca686a2781837f2967f37f578bd07963b69c2d1f4e1d276868b85df` |
| source handoff working tree | 8425 | 145 | 76 | n/a | `818e722080ada9eb84dcd7e9be6f46b06a7423490cc149d44f32cbfc0507ace5` |
| integration working tree at candidate code | 8494 | 145 | 145 | n/a | `0573f0adda0dd81ab0157029503c71a1dde6e2b6610255ccef3a1cd283338d41` |

`0e4c6b9 → f9af346` has a real report-only content change of `27` inserted
lines. The Git blob at `f9af346` and `ad9c18d` is identical; the later
working-tree differences are checkout line-ending normalization, not a
source revision change.

Disposition: the historical `0cde...` binding is **UNVERIFIED/SUPERSEDED**.
It remains unchanged in the old index. The new integration evidence is bound
to the exact `ad9c18d` Git blob and to the candidate bundle's separately
recorded working-tree bytes.

## ERR-02 — corpus test checksum

Historical field: `batch-d-evidence-index.json`,
`.agents/scripts/run-v4-architecture-corpus.test.mjs`, recorded as the
63-character value
`79235c4b5611b442e0303e1585de76b75303f3c8b3b831dbc93b74938343188`.

The source was read at all three relevant revisions. The full SHA-256 is the
same at each revision and in the current integration working tree:

| Subject | Bytes | LF | CRLF | Git blob SHA-1 | SHA-256 |
|---|---:|---:|---:|---|---|
| `0e4c6b9` Git blob | 4374 | 89 | 0 | `c8168f7e09b86fa1c589db24c7d5a29c64d65059` | `79235c4b5611b442e0303e1585de76b75303f3c8b3b831dbc93b74938343188b` |
| `f9af346` Git blob | 4374 | 89 | 0 | `c8168f7e09b86fa1c589db24c7d5a29c64d65059` | `79235c4b5611b442e0303e1585de76b75303f3c8b3b831dbc93b74938343188b` |
| `ad9c18d` Git blob | 4374 | 89 | 0 | `c8168f7e09b86fa1c589db24c7d5a29c64d65059` | `79235c4b5611b442e0303e1585de76b75303f3c8b3b831dbc93b74938343188b` |
| integration working tree | 4463 | 89 | 89 | n/a | `7e5bf7372b80fe92c63aa844851508096f90e1e55905007302184e14d6d124f8` |

Disposition: the historical 63-character value is **UNVERIFIED/SUPERSEDED**
as an incomplete checksum. It is not replaced in the historical index. The
full checksum is recorded in the new integration index and the candidate
bundle's corpus source binding.

## Preservation and use

- Historical raw evidence and bundles remain byte-for-byte preserved.
- The original main Plan is preserved separately as
  `source-plan-2026-09-27-original-main.md`; its SHA-256 is
  `7122633a96aef9bf1bee072ea56e47ec7ab3e50662f93a56db79356994841687` and
  its size is `65732` bytes.
- No old SHA, tested-source SHA, handoff SHA, or historical log was edited.
- Current candidate evidence is indexed by
  `integration-evidence-index.json`.
