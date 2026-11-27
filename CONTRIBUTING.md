# Contributing

Start by building or running an application. See [the contributor quickstart](docs/CONTRIBUTOR-QUICKSTART.md) for the pinned runtime and registry sync workflow.

Contribute reusable capabilities to `registry/`, reusable networks to `mode/`, and sanitized reference applications to `projects/`. Include fixtures, tests, documentation and license information. If the framework cannot express your application requirement, open an issue containing the exact runtime revision, minimal native network, input, expected result and actual result. Core maintainers triage these limitations and add regression tests; substantial runtime, syntax or architectural changes follow the RFC process.

Fork the repository, create a focused branch, and run `npm test` with Node 22.13+. Never commit customer data, credentials or private research. Sign off each contribution using `git commit -s`; see DCO. This certifies your right to contribute, not cryptographic signature verification. Contributions are submitted under Apache-2.0. Maintainers review and merge after checks pass; passing tests alone does not establish correctness.
