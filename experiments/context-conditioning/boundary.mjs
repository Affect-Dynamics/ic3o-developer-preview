// Experiment 03A: the contextual boundary.
//
// IMPORTANT: runtime.mjs does NOT distinguish contractual from contextual values. To the
// runtime a contextual binding is an ordinary Intake variable. Everything in this file is
// enforced by this experimental adapter, statically, before anything executes.
//
// Reserved namespace: Intake names starting with `ctx_` can only be supplied by the host
// execution layer. Callers and bridges can neither supply nor read them.
//
// Taint analysis ("pure contextual"): a name is pure-contextual if it is a ctx_ Intake or
// a step output whose arguments are ALL pure-contextual. A step mixing contractual and
// contextual arguments produces a computational CONSEQUENCE, which may be exposed, bridged
// and checked by Guarantee. Pure-contextual values may not reach Outtake, Require or
// Guarantee, because that would expose Context directly or launder it through a capability.
export const NAMESPACE = 'ctx_';

export class ContextError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'ContextError';
        this.code = code;
        Object.assign(this, details);
    }
}
const fail = (code, message, details) => { throw new ContextError(code, message, details); };

export const isContextual = name => typeof name === 'string' && name.startsWith(NAMESPACE);

// Returns Map<network, {pure, tainted}> for the network and every nested PEP. `tainted` is every
// name depending on any contextual value (a computational consequence of Context).
export function audit(network, analysis = new Map(), where = network.name) {
    if (analysis.has(network)) return analysis;
    if (network.sidechains?.length) {
        // Sidechains receive digests of the whole environment, which includes injected bindings.
        fail('sidechain_prohibited', `${where}: sidechains are prohibited in context-conditioned networks (their events commit to injected bindings)`, {network: where});
    }
    const pure = new Set(Object.keys(network.inputs).filter(isContextual));
    const tainted = new Set(pure);
    analysis.set(network, {pure, tainted});

    for (const step of network.steps) {
        if (isContextual(step.id)) fail('namespace_violation', `${where}: binding '${step.id}' uses the reserved ${NAMESPACE} namespace`, {network: where, step: step.id});
        const flags = step.args.map(arg => pure.has(arg));
        if (step.child) {
            const params = Object.keys(step.child.inputs);
            step.args.forEach((arg, i) => {
                if (flags[i] !== isContextual(params[i])) {
                    fail('namespace_violation', flags[i]
                        ? `${where}/${step.id}: pure contextual value '${arg}' is passed to non-contextual Intake '${params[i]}' of ${step.child.name}, where its Require and Guarantee could read it`
                        : `${where}/${step.id}: contractual value '${arg}' is passed to reserved contextual Intake '${params[i]}' of ${step.child.name}`,
                    {network: where, step: step.id});
                }
            });
            audit(step.child, analysis, `${where}/${step.id}`);
        }
        if (step.args.length && flags.every(Boolean)) pure.add(step.id);
        if (step.args.some(arg => tainted.has(arg))) tainted.add(step.id);
    }

    for (const name of Object.keys(network.outputs)) {
        if (isContextual(name)) fail('context_exposed', `${where}: Outtake '${name}' uses the reserved ${NAMESPACE} namespace`, {network: where, field: name});
        if (pure.has(name)) fail('context_exposed', `${where}: contextual value '${name}' is exposed directly through Outtake`, {network: where, field: name});
    }
    for (const contract of network.contracts) {
        for (const [phase, rules] of [['Require', contract.Require ?? []], ['Guarantee', contract.Guarantee ?? []]]) {
            for (const rule of rules) {
                const hit = (rule.match(/[A-Za-z_]\w*/g) ?? []).find(id => isContextual(id) || pure.has(id));
                if (hit) fail('context_in_contract', `${where}: ${phase} rule '${rule}' reads contextual value '${hit}'`, {network: where, phase, rule, field: hit});
            }
        }
    }
    return analysis;
}
