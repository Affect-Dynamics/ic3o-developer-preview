# GitHub-native contributor preview

Install Git, Node 22.13+ and the official GitHub CLI (gh). Authentication stays with GitHub CLI. ic3o neither reads nor stores its token.

From the trusted bootstrap checkout:

```sh
node cli.mjs login
node cli.mjs whoami
node cli.mjs init expense-tracker
node cli.mjs registry search multiply
node cli.mjs test expense-tracker/pep/expense-tracker.pep
```

Scaffold outside the framework checkout for real work. The starter is a deterministic multiplication example, not a complete expense tracker. To publish your own app, enter its directory, initialize Git, inspect files, commit with your own identity and sign-off, and invoke the bootstrap CLI by absolute path:

```sh
git init -b main
git add .
git commit -s -m "Initialize application"
node /path/to/ic3o/cli.mjs repo expense-tracker --private
```

Choose --public only if you intend to publish the source. Repo creation is explicit and pushes existing commits; review them first. For registry contributions, use a fork of the framework, a focused branch and signed commits. Run npm test and inspect the diff before invoking cli.mjs contribute from that fork. GitHub CLI prompts for the PR details and push as necessary. cli.mjs report opens the official interactive issue creator. No fabricated commits or contribution activity.

Registry search is local to the executing framework snapshot; it does not query an online catalog. Use the sync launcher from the contributor quickstart to run against an updated snapshot. This preview does not automate fork creation, signing, registry publication, GitHub contribution metrics, or compatibility validation of contributions. GitHub authentication has not been exercised against a live account by automated tests; tests stub the subprocess boundary.
