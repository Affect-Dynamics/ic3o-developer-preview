# Application-first contributor preview

Build an application in your own repository, outside the framework checkout. Use native PEP, Context, Contract and Capability files. When functionality is missing, contribute reusable registry entries or Modes; when the runtime cannot express your requirement, submit the smallest reproducible native network and expected/actual behavior. Core changes should use the RFC process.

## Sync

From a trusted bootstrap checkout, with Git and Node 22.13+:

```sh
node tools/sync.mjs check
node tools/sync.mjs sync
node tools/sync.mjs run inspect /absolute/path/to/app/pep/app.pep
node tools/sync.mjs run --auto validate /absolute/path/to/app/pep/app.pep
node tools/sync.mjs rollback
```

The launcher fetches upstream main into a dedicated local Git mirror under ~/.ic3o/preview, stages a detached snapshot, runs its test suite, and atomically switches the active commit pointer only after successful verification. Apps and contributor branches are not touched. Check only fetches metadata; sync and run --auto explicitly authorize execution of upstream test code. A failed update stops the command; use run without --auto to continue with the previous active snapshot. Rollback switches to the previous installed revision without changing app files or undoing data migrations. The launcher itself must be updated separately from a trusted bootstrap checkout.

Core, registry and Modes are pinned together to a single reviewed Git commit in this first implementation. Independent registry-only publishing requires a compatibility manifest, versioned native interfaces, dependency locks and registry trust policy; it is not implemented yet. The resolver still supports its existing environment overrides, so do not set ILK_MODE_ROOT if using the bundled Mode snapshot. No automatic discovery or remote capability installation. Registry contributions still need a supported native implementation or an existing PEP composition; arbitrary third-party executable plugins are not enabled.

This is a trusted developer preview, not a signed software updater: HTTPS Git transport and commit identity are not publisher signatures. No sandbox, background update service, migration management, disk pruning, or app dependency lockfile. Do not run unknown forks as upstream. A stale lock after a crash requires manual removal only after confirming no sync process is active.

## Contribution workflow

Fork the upstream repository for submissions. Build and test your app separately, then contribute a reusable native capability/Mode or a sanitized reference app with fixtures and docs. Sign your own commits with git commit -s. For framework issues include the exact active revision from sync status, native files, input, expected output, and actual error. Never include secrets or customer data.
