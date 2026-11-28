# Experiment 02: bridges

**The PEP computes. The bridge connects. The effect delivers.**

This experiment tests whether network traversal can be separated from network computation using the unmodified runtime. It imports only `load` and `run` from `runtime.mjs`. There is no new PEP syntax, and the participating PEPs have no knowledge of bridges.

```sh
node experiments/bridge/demo.mjs
node --test test/bridge.test.mjs
```

## Route table

```json
{
  "entry": "allocate",
  "terminals": ["invoice"],
  "networks": {"allocate": "networks/pep/allocate.pep", "...": "..."},
  "maxHops": 8,
  "routes": [
    {"id": "allocate-to-price", "from": "allocate", "to": "price",
     "map": {"quantity": "allocation", "unit_price": "unit_price"}}
  ]
}
```

`map` is `{receivingIntakeField: sourceOutputField}`. It is a structural binding. Values are copied unchanged, and any transformation must happen inside a network's capability. Mapped fields must exist and have identical types. Every Intake field of the receiving network must be mapped. Unmapped source outputs are discarded and listed in the trace as `discarded`.

## Semantics

- The entry and terminal networks are declared explicitly. A terminal with no outgoing route is successful completion. A terminal with an outgoing route is an error.
- A non-terminal network with no route, or with more than one candidate route, is an error.
- `compile()` validates the whole table before anything runs: declared networks, mappings, types, ambiguity, reachability, cycles, longest path against the hop limit, and effects (including nested PEPs and sidechains).
- `traverse()` runs each network through `run()`, so each network's Require and Guarantee apply. It enforces two independent runtime guards: cycle detection (`detectCycles`) and a hop limit (`maxHops`).
- Effects are prohibited throughout. This keeps local and global settlement from interacting during the experiment.

## The resolver is the replaceable part

`traverse(compiled, input, {resolver})` accepts any object with `resolve({from, output, hop}) => route[]`. The default is `deterministicResolver`, which reads the table. A Jev Bridges resolver could replace it without changing any PEP. Whatever a resolver returns is re-validated before data crosses (the route must start at the current network, name a declared network, and satisfy the Intake and type checks), so a resolver cannot bypass them. Replacing the resolver does not bypass `compile()`'s table checks. A resolver that proposes routes absent from the table is accepted only if they satisfy those runtime re-validations, so deciding which routes to allow is a policy question for the integration.

## Trace

The combined trace is the primary result. It is an ordered list of:

| Kind | Content |
|---|---|
| `Hop` | network, input, output, `passed`, and the network's complete native `nativeTrace` |
| `Bridge` | `from`, `candidates`, chosen `route`, `map`, `mapped` values, `discarded` fields, `passed` or `error` |
| `Terminal` | final network and output |

A `BridgeError` carries `code` and the partial `trace`. Codes: `invalid_table`, `unknown_network`, `unknown_field`, `incompatible_type`, `incomplete_mapping`, `ambiguous_route`, `missing_route`, `terminal_has_route`, `duplicate_route`, `cycle`, `hop_limit`, `effect_prohibited`, `invalid_route`, `network_failed`.

## Limits

- Context is not used. Routing is decided by explicit field names and types only, and Context stays computationally inert.
- Routing is by source network. There is no conditional routing on output values, so every network has at most one outgoing route.
- There is no fan-out, fan-in or parallelism.
