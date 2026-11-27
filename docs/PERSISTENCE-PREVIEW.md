# v0.10 persistence integration (proposed)

Refs #7 and #6. This first slice makes a storage Mode capability callable from a PEP. It does not add a general provider interface or change native grammar.

Run with Node 22.13+:
```sh
node projects/persisted-note/demo.mjs
node projects/persisted-note/demo.mjs ./notes.db
npm test
```

The trusted host binds one id/body entity scope, explicit synchronous write policy and tracked Store. The native put-text capability inserts a record; the root PEP's requirements and guarantees execute before transaction commit. A provenance sidechain must reach before_outtake at the root. The field revisions and successful execution evidence append use the same SQLite connection and transaction. Outtake is returned only after commit. A failing guarantee, policy, write, or evidence insertion rolls back the transaction. Rejected attempts are not durably journaled by this wrapper; the existing standalone Journal behavior remains unchanged.

This is an insert-only reference slice, not a complete persistence provider. Read projection uses the existing storage compiler after commit. Schema files are separate from PEP context parsing until a unified grammar is reviewed. There is no authentication, production authorization, external side-effect rollback, general async provider interface, replay protection, or browser integration. The demo uses synthetic data and an intentionally permissive host policy. Evidence is hash chained, not independently anchored or authenticated. Do not expose the demo to untrusted callers. No version bump until the scope and verification of v0.10 are reviewed.
