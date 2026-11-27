# Experiment 03A: independent context conditioning

Tests the proposition **y = f(x; c)**: identical contractual data `x` and identical capabilities
produce different, valid, observable results under different contextual conditions `c`.

This is **not** native Context execution. `runtime.mjs`, the `.context` syntax and the PEP
grammar are unchanged and Experiments 02 and 02B are untouched.

## What is and is not enforced

**The underlying runtime does not distinguish contextual from contractual values.** To the runtime a
contextual binding is an ordinary Intake variable. Every boundary below is enforced by this
experimental adapter, statically at compile time, and by the host execution layer at run time.
Replacing the adapter with direct runtime use removes every guarantee in this document.

## Model

`context.json` is a typed, inspectable artifact (a JSON file, not `.context`):

| Section | Meaning |
| --- | --- |
| `conditions` | Raw typed conditions with an enumerated `domain` or numeric `range` |
| `constraints` | Compatibility predicates over raw conditions (the 02B predicate language) |
| `derived` | Conditions computed **only** by lookup table over other conditions, topologically ordered |
| `bindings` | Per network: reserved `ctx_*` Intake name to condition name |

There is no arithmetic, no default and no I/O in Context. Arithmetic stays in capabilities.
A missing table entry is an error unless a constraint forbids the combination.

## Boundary

- `ctx_` is a reserved namespace. Only the host execution layer supplies it.
- Callers, bridge maps and route tables cannot supply or carry `ctx_` values.
- A *pure contextual* value is a `ctx_` Intake, or a step whose arguments are all pure contextual.
  Pure contextual values cannot reach Outtake, Require or Guarantee, directly, indirectly or through nested PEPs.
- A step that combines contextual and contractual arguments yields a *conditioned* value, a
  computational consequence of Context. It may be exposed, bridged and checked by Guarantee.
- **Require is independent of Context. Guarantee may depend on the settled result of context-conditioned
  computation.** Independence from bindings is not independence from their consequences.
- Sidechains are prohibited: their events commit to injected bindings.
- Context is resolved per network invocation and never sees contractual data, in this experiment.
  That is an experimental restriction, not an architectural invariant (see 03B).

## Demonstration

`quantity` 8 and `unit_price` 250, identical in every run. Amounts are illustrative integer cents
in binary-exact numbers, not production monetary arithmetic.

| channel / season | coefficient | adjusted | rebate | total | handling (separate result) | path |
| --- | --- | --- | --- | --- | --- | --- |
| retail / standard | 1 | 2000 | 0 | 2000 | 40 | price → approval |
| retail / promo | 0.75 | 1500 | 0 | 1500 | 40 | price → invoice |
| wholesale / standard | 0.75 | 1500 | 50 | 1450 | 24 | price → invoice |
| wholesale / promo | 0.5 | 1000 | 50 | 950 | 24 | price → invoice |
| internal / standard | 0.5 | 1000 | 100 | 900 | 0 | price → invoice |
| internal / promo | | | | rejected by constraint | | |

`handling = quantity × handling_rate` is deliberately **not** part of `total`. It is a separately
exposed settled result, and it is also visible in the trace. Every context-conditioned capability
contributes to `total`, to `handling`, or to the second network's `due` / `review_fee`.

The route table never changes and never sees Context. Routes are chosen by `total > 1500` over
settled contractual output, so context influences computation, computation influences traversal and
traversal starts another computation.

## Trace

Records are kept separate: `RawContext`, `DerivedContext`, `Injection`, `Contractual`, `Capability`
(every argument labelled `contractual`, `context` or `conditioned`), `Contract` (phase Require or
Guarantee), `Settled`, `Bridge`, `Hop`, `Terminal` and `Boundary`. Failed contextual evaluations are
recorded, including the failing constraint and missing table entry.

## Run

```
npm run context:demo
node --test test/context-*.test.mjs
```

## Not tested here

- 03B: contract-dependent contextual activation, `y = f(x; C(x))`
- 03C: structural conditioning and whether a native runtime execution seam is justified
