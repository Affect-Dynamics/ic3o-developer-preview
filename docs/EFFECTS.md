# ic3o: Effects (delivery as a capability)

Earlier versions routed results with `name -> destination` lines in `Outtake`. That syntax is removed. A PEP now declares what it returns, and anything that leaves the network is an ordinary capability marked as an effect.

## Why

- **Reuse.** Routing inside a PEP tied the PEP to one deployment. Now the same PEP can be used anywhere, and callers choose what to deliver.
- **Governance.** A delivery has a typed interface, is resolved like any capability (local, Mode, registry) and appears in the trace.
- **Safe timing.** Contracts judge the settled result, not intermediate values. An effect cannot fire early or leave a network that failed its Guarantees.

## Syntax

`Outtake` declares typed results only:

```text
Outtake
    allocation: integer
    total: integer
    remaining: integer
```

A delivery is a normal binding in `Capability`:

```text
Capability
    allocation = allocation.pep(requested, available)
    remaining = subtract.capability(available, allocation)
    sent = notify.capability(remaining)
```

The capability file marks itself as an effect:

```text
Notify

Intake
    value: integer

Implementation
    native: deliver
    effect: true

Outtake
    sent: integer
```

An effect needs both `native: deliver` and `effect: true`. Like other capabilities it takes typed arguments and returns exactly one typed value.

## Execution order

For each PEP, `run()` does the following:

1. Check Intake types, then `Require` assertions.
2. Run every non-effect step in declaration order. Effect steps are skipped and queued.
3. Collect the Outtake values and check their types.
4. Check `Guarantee` assertions against the settled values.
5. Emit the `after_execute` and `before_outtake` sidechain hooks.
6. **Handoff:** run the queued effects in declaration order. Each is type-checked and traced as kind `Effect`.

If anything fails in steps 1 to 5, no effect runs. The failure hook fires and the error propagates.

### Why the check is at the handoff

Contracts apply to the settled state. A pipeline may pass through a value that would violate a Guarantee, such as a quantity that dips below zero, as long as the final result is valid. Effects follow the same rule: they see only values that have already passed.

## Rules the loader enforces

| Rule | Error |
|---|---|
| `->` lines in `Outtake` | `Routing was removed from Outtake ...` |
| An effect's output used as an argument | `Effect output cannot be consumed` |
| An effect's output listed in `Outtake` | `Effect output cannot be an Outtake` |
| `native: deliver` without `effect: true` | `Unsupported native: deliver` |

Effects produce no data that stays inside the network. Their return value shows only in the trace.

## Host binding

The framework doesn't ship delivery adapters. The trusted host supplies the implementation through the `execution` argument, as it does for storage:

```javascript
import {load, run} from './runtime.mjs';

const execution = {
  deliver({args, step, network, path}) {
    // args: typed values passed to the capability, keyed by its Intake names
    // step: the binding (id, ref, origin)
    // path: execution path, for example "Order allocation/sent"
    console.log('deliver', path, args);
    return args.value; // must match the capability's declared Outtake type
  }
};

const result = run(load('projects/order'), {requested: 8, available: 5, unit_price: 250}, [], undefined, [], execution);
```

If an effect is reached and `execution.deliver` is missing, the run fails with `Delivery execution binding required`. This is the safe default, so a plain `ic run` never causes an external write.

Throwing from `deliver` fails the run. Earlier effects in the same handoff have already happened, so make delivery handlers idempotent where that matters. The framework does not roll back effects.

## Nested PEPs

Each PEP has its own handoff. A child's effects run when the child settles, after the child's Guarantees and before the parent continues. A parent failure after that point cannot recall a child's delivery. If you need an effect to depend on the parent's Guarantees, bind it in the parent.

## Observability

- `run()` returns `{output, trace}`. The `deliveries` field no longer exists.
- Each effect adds `{kind: 'Effect', path, input, output, passed: true}` to the trace.
- `inspect()` includes `effect: true` on effect steps.

## Migrating

1. Delete every `x -> destination` line from `Outtake`.
2. For each real destination, create a `.capability` with `native: deliver` and `effect: true` and bind it in `Capability`. Lines like `-> response` or `-> parent` need no replacement, because the return value of `run()` already serves that purpose.
3. Give the host an `execution.deliver` function.

## Limits

- The runtime has a single `deliver` native. Dispatch to specific destinations is the host's job, using `step.ref` or `path`.
- There is no rollback or transaction across effects.
- Effects are not retried or queued, and there is no conditional delivery.
