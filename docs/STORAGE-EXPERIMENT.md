# ThICCC Architecture / ic3o Framework: contextual storage experiment

The storage topology is declared by each context. Data is filed at a typed address (network.entity, instance identifier, field). A relationship stores the identifier of another typed entity, not a copied record. The storage engine is SQLite; the developer does not write SQL. This is a graph-shaped logical model, not a trained neural network.

## Run

Node 22.13+ (node:sqlite may emit an experimental warning). No npm dependencies.

```sh
npm test
npm run storage:demo
npm run storage:demo -- /tmp/social.db 10000
```

The optional database path and initial post count apply to a fresh database. Re-running reads the existing database without reseeding. The default database is projects/social/social.db. Do not delete it unless you intend to discard the experiment data.

## Files

- projects/social/context/{posts,identity,comments}.context: schema and typed links.
- projects/social/contract/post.contract: typed entry point and required projection.
- mode/storage/store.mjs: reusable compiler and persistence provider.
- projects/social/demo.mjs: experiment entry point and synthetic records.
- test/storage.test.mjs: verification.

The compiler validates field types and cardinalities and builds a shared-prefix traversal tree before retrieving records. The provider creates a composite primary key before insertion. Every retrieved field uses a prepared indexed point lookup. The runtime follows actual relationship IDs; no semantic discovery, vector search or model invocation. Repeated cell addresses are memoized per retrieval. The trace lists addresses, not values, and cellReads counts unique cell fetches, not entity-existence queries or physical disk I/O.

## Boundaries

This is an isolated storage Mode experiment alongside the unchanged v0.6 PEP runtime. It does not yet register storage operations in the PEP capability resolver or browser SDK. The new Entity and typed retrieval contract syntax is parsed by the storage compiler only. The contract is a typed projection, not a general predicate engine. Logical scopes are entity-qualified names, not independent instantiated PEP identities yet. SQLite provides one physical database, transactions, and durable persistence. No learned neural weights, discovery, authentication, deletion, reverse indexes, schema migration automation, or production authorization. The sample access policy denies the secret field; it is not user authentication. Writes validate typed references and run transactionally; trusted callers only. Schema fingerprints reject changed definitions. The primary key supports exact identifiers, not arbitrary field-value searches. No latency superiority is claimed.

Next: integrate the provider into actual ic3o capability execution, add governed writes and authenticated instance scope, then build the notes application.

## v0.8 revision history

See [PROVENANCE.md](PROVENANCE.md) for the tracked/untracked benchmark and provenance projection.
