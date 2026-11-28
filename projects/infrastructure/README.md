# Execution infrastructure

First applied composition for IC3O, based on feature/effects-and-bridges at ed5e002.

Copy projects/infrastructure into the developer-preview checkout. No runtime edits or dependencies.

```sh
node projects/infrastructure/cli.mjs projects/infrastructure/example.json operator
node projects/infrastructure/cli.mjs projects/infrastructure/example.json operator order '{"requested":8,"available":5,"unit_price":250}'
```

The sample config uses the existing order PEP; replace the registry and grants with your own trusted definitions. Registry discovery and grants are host responsibilities. The admission PEP enforces the host's authorization decision and computes a request commitment using the native SHA-256 capability. The selected PEP then executes through the actual runtime. The existing provenance Journal records successful and rejected requests and can verify a checkpoint. The gateway rejects effect and storage-write capabilities recursively, including sidechains, so evidence failure cannot follow an authorized external write. No inter-network bridge integration yet: dispatch to dynamically named PEPs remains a host operation. Context remains documentary in this composition. No AI dependencies.

The CLI principal is a trusted local operator assertion, not authentication. Do not expose this CLI or gateway to untrusted callers. The registry, grants and PEP definitions are trusted deployment configuration; path validation only constrains registered entrypoints, not every nested reference. The journal contains execution traces which may contain sensitive input; protect the database accordingly. Hash chaining is not a signature or externally anchored audit log. Evidence verification is available through the gateway API.

Run the repository regression suite and smoke commands after copying into the actual checkout. This add-on does not modify experimental baselines.
