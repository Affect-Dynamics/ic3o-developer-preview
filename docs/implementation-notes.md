# ic3o / implementation notes

Clean-slate Node.js framework prototype. No npm dependencies. Requires Node 22.13 or newer. This is not a migration of the earlier JSON CLI.

## Start

```sh
npm test
npm start
```

Open http://127.0.0.1:8799 in a browser (also works on the same Android device as Termux). PORT can override the port. HOST defaults to loopback; the demo has no authentication and should not be exposed publicly.

## CLI

```sh
node cli.mjs inspect
node cli.mjs validate
node cli.mjs resolve
node cli.mjs test
node cli.mjs run projects/order/pep/order.pep requested=8 available=5 unit_price=250
```

All commands accept an optional PEP path or conventional project directory after the command. A directory `projects/order` selects `projects/order/pep/order.pep`. For a custom layout, pass the entry PEP directly. `test` also accepts an optional fixture file after the PEP or project directory. The HTTP server accepts `ILK_PEP` (entry PEP or project directory) and `ILK_FIXTURES` (fixture path) environment variables; its browser form is still the order example. Run requires explicit key=value inputs. `resolve` reports existing bindings; it does not discover or generate implementations. Inspect, validate and run load native files each time. The HTTP demo reloads those same definitions for each request. The browser form is specific to the example.

## Native artifacts

- `projects/order/pep/order.pep`: ic3o composition, named ports, capability bindings and routes.
- `projects/order/pep/allocation.pep`: embedded PEP using exactly the same syntax.
- `projects/order/context/order.context`: human-readable field meanings.
- `projects/order/contract/*.contract`: executable requirements and guarantees.
- `registry/capability/*.capability`: universal typed native operation references.
- `projects/order/fixtures.json`: test cases only, never universal contract rules.

The syntax is a prototype: first nonempty line is a title, then case-sensitive section names and indented entries. Comments begin with #. PEP capability lines are `output = file.capability(input1, input2)` or `output = child.pep(input1, input2)`. Dependency bindings must precede consumers. Outtake declarations are `name: integer` followed by `name -> destination`. Types: integer (safe integer), number (finite), text, boolean. Capabilities have typed Intake and Outtake and `native: name` under Implementation. Native names are allowlisted, not evaluated as code. References are bare filenames or explicit relative paths. Omitted Context and Contract sections resolve to matching-name files in the corresponding sibling directories.

Contract assertions support simple comparisons (`=`, `!=`, `>=`, `<=`, `>`, `<`), named variables, numeric literals, one arithmetic operation or `min(a, b)`. Requirements run before capabilities; guarantees run before returning results. Child PEPs are validated against the calling signature and their own contracts, and the parent verifies its guarantees against returned results. Arbitrary parent predicates are not yet projected into child-local tests. Context files currently describe semantics, not runtime state acquisition. `validate` checks structural bindings, not mathematical equivalence or all assertion expressions.

## Demo

8 requested, 5 available, 250 cents each yields allocation 5, total 1250 cents and remaining 0. Change inputs freely; fixture expectations do not apply to ordinary runs. Negative quantities fail the live contract. The inventory preview is a route envelope only, not a stock mutation. The frontend shows actual trace evidence and allows entering the embedded allocation PEP. The same runtime powers both CLI and HTTP.

## Limits

No Jev provider, automated CGR, automatic discovery, conditional routing, live external writes, inline artifact definitions, multiple outputs per individual capability call, general model schemas or automatic inheritance of arbitrary predicates yet. No browser interaction testing was performed; frontend syntax and HTTP delivery were tested. The local server is an unauthenticated demo. Test suite covers recursive execution, variable inputs, input failures, fixtures and HTTP execution.

## Directory convention and custom layouts

For a project named `order`, the default layout is:

```text
order/
  pep/order.pep
  context/order.context
  contract/order.contract
  fixtures.json
```

The primary PEP, context and contract share the project directory name by convention, not by a mandatory layout restriction. A PEP named `allocation.pep` uses the stem `allocation` for its own implicit lookups. If a Context or Contract section is omitted, ilk searches `../context/<stem>.context` or `../contract/<stem>.contract`, respectively, relative to the PEP's containing directory. A missing default is an error, not permission to skip a contract or context.

An explicit section replaces the implicit lookup for that section. One or more references can be listed; to include the default alongside additional files, list it explicitly. Empty explicit sections are rejected. The included root omits both sections; the allocation child explicitly shares `order.context` and implicitly resolves `allocation.contract`.

Bare references resolve by convention: PEPs alongside the referring PEP, contexts and contracts in the corresponding sibling directories, and capabilities in the shared registry. Explicit relative paths (including `./` and `../`) override that lookup for any of the four file types and are anchored to the referring PEP, not the current working directory. Paths must use the correct extension and supported filename characters (letters, digits, underscores, hyphens; relative paths also permit periods and slashes). Absolute paths within native declarations are not supported. The CLI entry and fixture paths may be supplied directly.

Example custom layout:

```text
my-project/
  workflows/checkout.pep
  data/sales.context
  rules/checkout-policy.contract
  operations/minimum.capability
```

Inside `workflows/checkout.pep`:

```text
Context
    ../data/sales.context

Contract
    ../rules/checkout-policy.contract

Capability
    allocation = ../operations/minimum.capability(requested, available)
```

Use the explicit entry path, e.g. `node cli.mjs inspect my-project/workflows/checkout.pep`. To use the HTTP demo with an alternative entry having compatible inputs, set `ILK_PEP`. Explicit paths are trusted local author configuration; the HTTP API does not accept arbitrary file paths from requests. No layout config file is required. Custom layouts and explicit sections do not change parent and child execution obligations. Inline definitions and automatic parent-test projection are still pending.

The default fixture location is one directory above the entry PEP's containing directory. For a custom location use `node cli.mjs test path/to/entry.pep path/to/fixtures.json`, or set `ILK_FIXTURES` for the HTTP demo.

## ic3o Modes (v0.5)

A Mode is a local library of the same four native artifact types. It does not introduce a fifth architectural primitive. Intake and Outtake remain part of a PEP; a Mode can provide a reusable PEP for acquisition, transformation or delivery, subject to the runtime's supported operations.

```text
mode/
  commerce/
    mode.json
    pep/allocation.pep
    context/order.context
    contract/order.contract
    contract/allocation.contract
    capability/
  numerical/
    capability/minimum.capability
    capability/multiply.capability
    capability/subtract.capability
projects/
  mode-order/
    pep/mode-order.pep
    fixtures.json
```

The Mode-backed project imports `commerce` with a `Use` section. Commerce's optional `mode.json` contains `{ "use": ["numerical"] }`. The manifest is package metadata, not another native primitive. The demo calls `allocation.pep` by bare name and `numerical:multiply.capability` by qualified name. Context and contract references can also be qualified. A matching default context or contract can come from a Mode when no matching local file exists.

```sh
node cli.mjs modes
node cli.mjs inspect projects/mode-order
node cli.mjs validate projects/mode-order
node cli.mjs test projects/mode-order
node cli.mjs run projects/mode-order requested=8 available=5 unit_price=250
ILK_PEP=projects/mode-order npm start
```

The last command serves the Mode-backed example at http://127.0.0.1:8799. `npm start` without an override still serves the original local project. `ILK_MODE_ROOT` may point to a different local Mode catalog directory. Explicit relative file references still allow custom layouts.

### Deterministic resolution

1. Explicit relative paths resolve relative to the referring PEP. A qualified `mode:asset.type` selects that asset from a visible Mode.
2. Unqualified references first check the conventional local directory (`pep` alongside the referring PEP, other types in their corresponding sibling directory).
3. If no local file exists, search all visible Modes, including transitive dependencies. More than one match is an error; import order never breaks ties.
4. If still unresolved and the asset is a capability, check the legacy universal registry.
5. Otherwise fail validation. Missing contracts are never silently ignored.

A project-local embedded PEP inherits the caller's visible Modes and can import additional ones. A PEP stored inside a Mode resolves in that Mode's own scope and declared dependencies, plus any Modes explicitly imported by that PEP. It does not inherit unrelated imports from its consumer. This prevents accidental rebinding when another application imports additional libraries. Mode dependency cycles are rejected. Inspect and the HTTP network endpoint expose the origin of each resolved reference.

### Verification and limits

23 automated tests (14 regressions and 9 Mode tests), plus all three fixtures in each order demo, pass. Mode tests exercise all four artifact types, transitive imports, implicit lookup, local overrides, collisions, missing imports, dependency cycles, child scope, catalog discovery and HTTP execution/provenance. The framework still supports only the existing built-in native operations; Modes do not execute arbitrary JavaScript or automatically install packages. Modes are local trusted source directories; there is no sandbox, package signing, version pinning or remote distribution yet. Browser-level interaction, live destination delivery, generalized parent-predicate projection and Jev/CGR remain unimplemented or unverified as previously documented.

## Context-native frontends (v0.6)

**ThICCC Architecture** is the architectural paradigm. The **ic3o Framework** is the development framework implementing it; **ilk** is the encompassing infrastructure.

A `.context` may have a conventional frontend directory at `../frontend/<context-stem>/index.html` or explicitly select a directory using a `Frontend` section. This does not create a fifth native primitive. The directory may be in a project or an imported Mode. Frontends are optional. The original architecture viewer remains at `/`.

```text
order/
  pep/order.pep
  pep/allocation.pep
  context/order.context
  context/allocation.context
  contract/order.contract
  contract/allocation.contract
  frontend/order/index.html
  frontend/order/app.js
  frontend/allocation/index.html
  frontend/allocation/app.js
```

The local demo and the Commerce Mode both contain independent order and allocation frontends. The primary context is selected by matching the PEP stem, or by the sole frontend/exposure-bearing context if no stem matches. Ambiguous selection fails rather than choosing by file order. Multiple contexts can participate in one PEP, but this prototype selects a single frontend-bearing context per PEP instance. Secondary shared contexts are not merged into its state exposure. Support for multiple independently addressed frontends on the same PEP is future work.

### Exposure and state

The primary `.context` explicitly lists exposed variables and actions. For example:

```text
Order quantities

Fields
    requested: Requested item count
    allocation: Fulfillable item count

State
    currency: "USD"

Expose
    read: requested
    read: allocation
    read: currency
    invoke: self
    invoke: allocation
```

`State` values are JSON literals, currently read-only declarations for the frontend. The existing execution engine does not use these declarations as computational inputs. Exposed Intake and Outtake variables reflect the most recent successful root execution. They are initially absent. Named actions refer to local capability binding IDs; `self` identifies the enclosing PEP. These actions are currently root-transaction entry points, not isolated native function calls. All ancestor contracts are checked before any snapshots change. A rejected execution leaves the last successful values intact.

An optional explicit frontend association overrides the conventional directory:

```text
Frontend
    ../frontend/allocation
```

The reference is relative to the context definition, not the calling project. This is how a Mode can supply a complete frontend along with its PEPs, contexts, contracts and capabilities.

### Browser SDK

```javascript
import {ilk} from '/ilk.js';
const order = await ilk.context('root');
const allocation = await ilk.context('root/allocation');
console.log(await order.get('currency'));
console.log(await allocation.capabilities());
console.log(await allocation.contracts());
const stop = allocation.subscribe('*', state => console.log(state));
await allocation.invoke('self', {requested: 8, available: 5, unit_price: 250});
// stop() cancels the subscription.
```

The SDK is plain browser JavaScript using same-origin HTTP. No dependency or bundling step is required. `definition`, `describe()`, `snapshot()`, `get()`, `capabilities()`, `contracts()`, `invoke()` and `subscribe()` are available. Subscriptions use 750 ms polling of read-filtered snapshots; they are not a streaming transport. Invocation accepts root Intake values, listed under `definition.invocationInputs`. A named step action executes the entire root pipeline and identifies the selected step in the response. Arbitrary independent invocation of embedded capabilities is deliberately not supported until ancestor obligations can be safely projected or an explicit independent contract is supplied.

### Run and explore

```sh
npm test
node cli.mjs frontends
node cli.mjs frontends projects/mode-order
npm start
```

- Architecture viewer: http://127.0.0.1:8799/
- Order frontend: http://127.0.0.1:8799/frontend/root/
- Allocation frontend: http://127.0.0.1:8799/frontend/root/allocation/

To serve the Mode-backed example instead, use `ILK_PEP=projects/mode-order npm start`.

Open both context pages. Execute a valid order in either page. Their snapshots update from the same governed transaction. Try a negative requested quantity to observe rejection without changing the last successful state. The original `/api/run` endpoint also publishes successful state. Changes to resolved definitions reset snapshots; frontend files are read from disk on request.

### Current scope and limitations

26 automated tests include 23 previous tests and 3 context-frontend tests. State is in-memory and shared by all clients of this local process. There is no authentication, user/tenant isolation, persistence, or arbitrary mutation API. `Expose` filters SDK state reads and action names; it is not an application authorization system. The existing architecture and execution endpoints still expose full demo metadata and traces. Serve trusted local projects and Modes only, on loopback; do not expose this demo to untrusted users or the public Internet. Frontend assets are restricted to HTML, CSS and JavaScript files directly in the declared directory. Context model schemas, state-backed execution, independent scoped actions, and SSE/WebSocket delivery are pending. HTTP integration is tested; browser interaction has not been tested. External destinations remain routing records rather than live writes.

## v0.8 provenance

See [PROVENANCE.md](PROVENANCE.md) for revision history, contract projection, benchmark commands and limitations.

## v0.9: PEP sidechains

See [SIDECHAINS.md](SIDECHAINS.md) for native declarations, inheritance, lifecycle hooks, execution journal and limitations. Run `npm run sidechain:demo -- ./execution-evidence.db`.
