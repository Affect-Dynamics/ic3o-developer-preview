# ic3o Framework v0.8: Context-addressed provenance

ThICCC Architecture / ic3o Framework / ilk

Storage now records immutable value revisions by default. Each revision is addressed by `[scope, id, field, revision]`. An update to a changed field creates a new revision; an unchanged value retains its previous origin. All revisions and current cells commit in the same transaction. A dependency points to a specific historical revision, not a mutable latest value.

## Run

Requires Node 22.13+.

```sh
npm test
npm run storage:demo -- ./new-social.db 1000
npm run storage:bench -- 1000,10000 2000 off
npm run storage:bench -- 1000,10000 2000 on
npm run storage:bench -- 1000,10000 2000 project
```

`off` creates untracked fresh benchmark databases; `on` tracks revisions but retrieves only values; `project` additionally retrieves selected provenance. Each run uses temporary databases and 200 warmup requests. First read after reopening is not a guaranteed OS-cache-cold read. Cell reads count data cells, not provenance metadata queries. No model calls are used.

## Write and retrieve

```js
store.update('posts.Post', {
    id: 'p0', title: 'Revised', body: 'Hello', author: 'u1', comments: ['c1']
}, {
    origin: 'editor', actor: 'u1',
    contract: 'edit-post.contract', capability: 'update-post',
    dependencies: [['identity.User', 'u1', 'name', 1]]
});
const history = store.history(['posts.Post','p0','title'], authorizeHistory);
const result = store.resolve(compiledPlan, {post_id:'p0'}, authorizeData, authorizeProvenance);
```

The policy functions must be supplied by trusted server code. The history policy must authorize historical values and metadata, not just the current field. The contract syntax is demonstrated in `projects/social/contract/post-provenance.contract`. Requested provenance is a separate response array; ordinary contracts remain unchanged. `Provenance` declarations can select origin, revision, actor, timestamp, contract, capability, verification and trust. Dependencies are available through history; recursive lineage resolution is not yet implemented.

## Integrity boundaries

Metadata is recorded, not independently authenticated. Actor, contract and capability are caller assertions; verification means schema validation, not proof of executing a named contract. Dependencies are checked for existence but causal truth is not verified. This is revision history, not a tamper-proof ledger. Current API does not expose a deletion operation or automatic historical redaction. Do not store sensitive production data in this prototype.

Existing populated v0.7 databases require explicit migration; no fabricated historical origin is generated. Use a new database for this demo. Tracked and untracked modes cannot be mixed on the same database through this API. Direct database access can bypass these guarantees. PEP integration, authenticated principals, recursive lineage authorization and migration remain pending.
