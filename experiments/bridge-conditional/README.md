# Experiment 02B: deterministic conditional traversal

Builds on the Experiment 02 baseline (`experiments/bridge`, tag `experiment-02-baseline`, untouched). A source network may now have several candidate routes. Each carries an explicit predicate over the source's settled output, and exactly one must be eligible at runtime. It uses only `load` and `run` from the runtime, with no grammar or Context change.

```sh
npm run bridge:conditional
node --test test/conditional-bridge.test.mjs
```

## Demo: one topology, three paths

`allocate` has three candidate routes:

| Route | `when` | Destination |
|---|---|---|
| `to-full` | `allocation = requested and allocation > 0` | `full_allocation` |
| `to-partial` | `allocation > 0 and allocation < requested` | `partial_allocation` |
| `to-unavailable` | `allocation = 0` | `unavailable_inventory` |

The inputs `available` of 20, 5 and 0 (with `requested` of 8) take three different paths through the same `routes.json`.

## Predicates

```
or   := and ('or' and)*      and := not ('and' not)*      not := 'not' not | atom
atom := '(' or ')' | operand OP operand        OP := = != < <= > >=
operand := settled output field | number | "text" | true | false
```

Comparisons only: no arithmetic, calls, assignment or I/O. `compile()` parses and type-checks every predicate against the source network's Outtake. It rejects unknown fields, mismatched types, ordering on non-numerics, constant comparisons and malformed text (`invalid_predicate`, `unknown_field`).

## Semantics

- `compile()` validates every candidate before execution, including ones that would never be eligible: structure, map, types, predicate, terminals, reachability, cycles and effects.
- At runtime all candidates are evaluated and recorded. Then exactly one must be eligible for a non-terminal network:
  - none eligible: `no_eligible_route`
  - several eligible: `ambiguous_route` (overlap)
  - a predicate that cannot be evaluated: `predicate_error`
- Maps stay structural copies and bridges never transform data.
- Cycle detection, `maxHops`, effect prohibition and native traces are unchanged from 02.

## Resolver

`resolve({from, output, hop, candidates, eligible}) => route | id | array`. `candidates` holds all declared routes and `eligible` holds those whose predicate held. The default `deterministicResolver` returns `eligible`.

A resolver can select only among declared candidates, and the selection is checked against the compiled table:

- a route id not declared from this network is `unauthorized_route`
- a route object whose definition differs from the declared one is `unauthorized_route` (declared routes are also frozen)
- selecting an ineligible route is `ineligible_selection`
- selecting nothing is `no_selection`
- selecting several is `ambiguous_route`

A resolver therefore cannot invent a route, widen eligibility or rescue zero or multiple eligible routes. A later non-deterministic resolver could choose only within what predicates already allow.

## Trace

Each `Bridge` entry lists every candidate with `id`, `to`, `when`, `eligible`, `reason`, and `selected` or `rejection` (`predicate false`, `overlaps with X`, `eligible but not selected`, `selected but predicate false`). Failed decisions are traced with `passed: false` and attached to the `BridgeError`. Results include `path`.

## Limits

- Predicates see only settled output fields, never Context.
- Routes are exclusive: overlap is a runtime error, not a priority order. Coverage is not proven statically, and uncovered values fail at runtime.
- No fan-out or parallelism.
