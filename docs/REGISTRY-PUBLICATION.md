# Public registry publication

The registry is a static projection of the framework repository, not a second contributor database. The generator discovers native definitions under registry/ and mode/, publishes a schemaVersion 1 catalog.json plus a searchable site, and pins all source links to the checked-out revision. Each entry includes native source and SHA-256 digest, earliest recorded path commit and latest changing commit, GitHub-linked commit author where available, and associated merged upstream pull requests. Earliest path commit is not necessarily original creation; renames, squash merges and missing GitHub account mappings may obscure attribution. Missing data is not fabricated.

## Preview

From a clean committed checkout, Node 22.13+ and full Git history:
```sh
node --test
node tools/registry/build.mjs /tmp/ic3o-registry
```
Serve the generated directory with a local static HTTP server. Without GITHUB_TOKEN, commit links remain available but GitHub author and PR attribution are unavailable. Do not put tokens in client code.

## Enable publication

In repository Settings > Pages select GitHub Actions as the source. Merge the registry publication PR after review and DCO sign-off. The workflow runs tests and builds an attributed catalog on main pushes, then deploys the Pages artifact with separate deployment permissions. Pull requests build only an unprivileged preview; no deployment or authenticated attribution calls. Failed tests or attribution API errors prevent publication rather than replacing the live catalog with a misleading one. Manual workflow dispatch can retry on main.

The expected Pages location is https://affect-dynamics.github.io/ic3o-developer-preview/ once enabled and deployed; not yet verified. Registry entries are published only after the workflow succeeds. The extension currently reads its installed snapshot and queries GitHub per inspected entry; it does not yet consume catalog.json. Independent capability release and compatibility resolution remain future work. No signed catalog or claim of authenticated publisher identity beyond GitHub transport. The workflow uses bounded API calls cached per unique commit; large catalogs may need a persistent cache and pagination later.
