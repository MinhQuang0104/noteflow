# V4 implementation techniques

This is a compact recipe, not an authority source. Load it for an authorized
implementation or verification action only.

1. Write one failing test for the behavior or invariant and run it to confirm
   the failure is caused by the missing behavior.
2. Implement the smallest change that makes the test pass. Keep scope bound to
   the current slice and do not add opportunistic refactors.
3. Refactor only after green, then rerun the focused checks and inspect the
   exact diff.
4. For HIGH risk, add executable unhappy-path, negative, concurrency, security,
   rollback, or public-contract checks that could falsify the important
   invariant. A model judgment or self-rating is not deterministic evidence.
5. Before a checkpoint or completion claim, use fresh supported toolchain
   evidence, exact path staging, and the applicable read-only gate.

If the failure is unexpected, load `systematic-debugging` and trace the actual
root cause before changing code. If verification fails, reproduce, add a
regression test where appropriate, make the smallest fix, rerun affected
checks, and rerun the final gate. Never convert a failed or incomplete result
into authority to implement a fix automatically.
