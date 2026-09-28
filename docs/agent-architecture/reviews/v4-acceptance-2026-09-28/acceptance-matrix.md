# V4 R07–R08 acceptance matrix

Common source for the rows below:

- tested_source_head / reviewed_source_head:
  0e4c6b939f2a186399b483718601e86b44a694b5
- fresh run:
  20260928T112130Z-0e4c6b939f2a186399b483718601e86b44a694b5
- full-suite output digest:
  db0fdc3136fd015cca058a421b0b6c322b14c7bd1986c1501e5c1e31e7139330
- corpus run digest:
  c4ee30914d20971378f99b545ff6cab6468467643895f69a581eb3547376c26e
- measurement digest:
  41f3d301c66f010017cdc0211e5c69a1f7af4f879cc1d01d3ff350b77a98b75b

Each row records the named check, the actual observed result, the source
identity and a readable evidence digest. The one symlink skip is not silently
relabelled as PASS.

| ID | Named check / command | Actual result | Source | Evidence |
|---|---|---|---|---|
| N01 | R02 missing-case regression; legacy compare command | PASS; legacy compare INCOMPARABLE/INCONCLUSIVE, no PASS | tested HEAD | full-suite db0fdc...; legacy-consumer-chain.log 670d0f... |
| N02 | R02 contradictory-check and tampered-evidence regression | PASS; invalid/tampered evidence is rejected or inconclusive | tested HEAD | full-suite db0fdc... |
| N03 | fresh L/M/H corpus runner | PASS assertions; raw M remains INCOMPLETE, H retains stale/recovery statuses | tested HEAD | corpus c4ee309...; L 8f4754...; M a2701b...; H 9a7154... |
| N04 | identity/basis mismatch regressions and measurement replay | PASS; mismatched basis is INCONCLUSIVE, same basis replay is MEASURED | tested HEAD | full-suite db0fdc...; replay 5a970483... |
| N05 | R04 UTF-8/CRLF, missing required/lazy source, zero-byte tests | PASS; missing is not zero-filled and real zero remains measured | tested HEAD | full-suite db0fdc...; measurement 41f3d301... |
| N06 | U2 target assertion and fresh measurement | PASS; 30.31%/30.26%, original threshold unchanged | tested HEAD | measurement 41f3d301...; replay 5a970483... |
| N07 | active pointer / linked-local-IDLE runner guards | PASS; blocked without mutation | tested HEAD | full-suite db0fdc... |
| N08 | stale HEAD/Plan/policy/recipe drift tests | PASS; stale/rerun required, no evidence reuse | tested HEAD | full-suite db0fdc... |
| N09 | lock/concurrency/crash/recovery tests | PASS; foreign owner blocks, partial state recovers, replay is NOOP | tested HEAD | full-suite db0fdc...; H raw 9a7154... |
| N10 | exact-scope, traversal, telemetry-noise and symlink guard tests | PASS for executed scope/path guards; symlink test SKIPPED because Windows cannot create symlinks; source has SYMLINK_PATH/UNSAFE_PATH fail-closed branches | tested HEAD | full-suite db0fdc...; executor SHA 31168c... |
| N11 | mapped-only/unmapped/mixed verification and escalation flow | PASS; M preserves raw INCOMPLETE and REVIEW_REQUIRED | tested HEAD | corpus c4ee309...; M a2701b...; full-suite db0fdc... |
| N12 | Human Gate, schema-v1 bridge and generic-continuation regressions | PASS; no auto-done or generic approval | tested HEAD | full-suite db0fdc... |
| N13 | observation usage normalization and repeated export tests | PASS; unknown stays unknown, measured zero is preserved, no double count | tested HEAD | full-suite db0fdc... |
| N14 | stale/malicious experience and advisory-context tests | PASS; stale/data-only advice cannot authorize or mutate | tested HEAD | full-suite db0fdc... |
| N15 | candidate/evaluation/adoption freshness and consumer chain | PASS; fresh candidate integrity is verified, legacy chain is INCONCLUSIVE, no adoption recommendation | tested HEAD | candidate integrity cf825f...; consumer chain 670d0f... |
| N16 | observer failure / mandatory receipt fail-closed tests | PASS; telemetry gaps warn and mandatory evidence fails closed | tested HEAD | full-suite db0fdc... |

## U2 measurement

The locked basis is
normal-action-instruction-source-v1 / v4-lite-normal-action, basis digest
sha256:6a6749f33ccc57ca4649e4b9e2afa5d7597c0d7db5fdf1a6823a92af4e069998,
input digest
sha256:16b03c97d4fef8b41ca29f1a6a4877fdec3817a7383efffc7038fb0476ddc27b.

| Action | Baseline B | Candidate | Reduction | projection_bytes |
|---|---:|---:|---:|---:|
| implement_slice | 65,359 | 45,551 | 30.31% | 0 |
| verify_slice | 65,359 | 45,580 | 30.26% | 0 |

The measurement helper counts revision-bound Git blobs once per action. It is
not a provider token or cost measurement.
