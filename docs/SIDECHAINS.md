# ic3o Framework 0.9: PEP sidechains

ThICCC Architecture / ic3o Framework / ilk

A sidechain is an ordinary PEP attached to an execution scope. It is not a new file type. The declaration is resolved using the same local, explicit path and Mode reference rules as embedded capabilities.

```text
Use
    provenance

Sidechain
    provenance:provenance.pep
```

An attachment at the root is active for the root and every descendant capability PEP. An attachment on a child is active only for that child and its descendants. Active attachments are inherited in declaration order, ancestor first. Two attachments of the same definition at different scopes are distinct attachments. Duplicate declarations in one PEP and static reference cycles are rejected.

## Lifecycle interface

Sidechain PEPs accept three text inputs named `phase`, `path`, `digest`. They may have ordinary typed outputs. The prototype invokes them at `intake`, `before_execute` (after requirements), `after_execute` (after guarantees), `before_outtake`, and `failure` (when an error propagates). Each hook is synchronous and mandatory: a hook error prevents successful Outtake. Hooks apply at PEP boundaries, not yet at each native capability. Host attachments do not recursively observe their own sidechain execution. Sidechains can have their own explicit attachments. This prevents implicit infinite recursion; nested sidechain traces are not yet surfaced in the host journal.

The event digest is SHA-256 of the JSON serialization of the event payload, not a canonical cross-language serialization. It does not provide confidentiality for low-entropy data. Never assume hashes protect secrets. Failure events commit to the error message rather than saving the raw message in the journal. This local prototype has no authentication or untrusted plugin isolation.

## Provenance Mode

`mode/provenance/pep/provenance.pep` implements the lifecycle interface with a SHA-256 capability and an executable commitment equality guarantee. Successful and failed sidechain invocations appear in the host trace. The existing v0.8 field revision implementation is unchanged.

`mode/provenance/journal.mjs` provides a separate SQLite execution journal. `runJournaled(network, input, journal)` runs the PEP and appends a batch of execution evidence for the explicitly qualified `provenance:provenance.pep` attachment. It includes rejected executions. The demo opts into this wrapper explicitly; normal CLI and HTTP execution emit traces but do not persist the journal automatically. This restriction is intentional until the storage transaction boundary is integrated. Journal records contain lifecycle metadata, commitments, hook output and run status, not the original input values.

Each journal entry commits to its sequence, previous hash and serialized payload. Verification detects changes against a previously trusted checkpoint. A database administrator could rewrite an entire chain; external checkpoint retention/signing is not implemented. No distributed ledger is required.

```bash
npm test
node cli.mjs inspect projects/sidechain-demo
npm run sidechain:demo -- ./execution-evidence.db
```

Run the demo twice to see the checkpoint sequence advance. The ordinary order output is unchanged. The first execution has eight lifecycle events: four root events and four allocation events.

## Deliberate boundaries

- Persistent declaration scope is implemented; persistent journal state is opt-in through the demo wrapper.
- All sidechains are mandatory in this release. Observer-only modes, selective phases, and richer governance decisions are pending.
- No atomic coupling of execution journal with field storage writes, external effects, or frontend state yet. No `before_commit` or `after_commit` hooks until a real transaction coordinator exists.
- The journal uses one physical chain per file; events carry scope addresses. Per-network independent chains and cross-chain dependency commitments are pending.
- Field revisions, storage contracts and provenance projection remain the independent v0.8 experiment.
- This release does not establish production audit integrity or prove a performance advantage. Benchmarking sidechain overhead and native storage integration remain next steps.
