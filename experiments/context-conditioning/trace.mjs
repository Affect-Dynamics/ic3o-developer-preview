// Experiment 03A: separate the runtime's native trace into categories.
//
// The runtime emits Require, Guarantee and Capability entries. Here they become:
//   Contract    contract evaluation (phase Require | Guarantee)
//   Capability  capability execution, with every argument labelled by origin:
//                 contractual  caller or bridge supplied data
//                 context      a host-injected binding (or a value derived only from bindings)
//                 conditioned  a computational consequence of Context (depends on a binding
//                              and on contractual data); may be bridged and guaranteed
// Context-side records (RawContext, DerivedContext, Injection) come from resolve.mjs.
export function translate(native, name, hop, network, analysis) {
    return native.map(entry => {
        if (entry.kind === 'Require' || entry.kind === 'Guarantee') {
            return {kind: 'Contract', hop, network: name, phase: entry.kind, path: entry.path, rule: entry.rule, passed: entry.passed};
        }
        if (entry.kind !== 'Capability') return {...entry, hop, network: name};
        const segments = entry.path.split('/').slice(1);
        let owner = network;
        for (const segment of segments.slice(0, -1)) owner = owner.steps.find(s => s.id === segment).child;
        const step = owner.steps.find(s => s.id === segments.at(-1));
        const {pure, tainted} = analysis.get(owner);
        const params = Object.keys(step.signature.inputs);
        const args = step.args.map((arg, i) => ({
            param: params[i], from: arg,
            source: pure.has(arg) ? 'context' : tainted.has(arg) ? 'conditioned' : 'contractual',
            value: entry.input[params[i]]
        }));
        return {kind: 'Capability', hop, network: name, path: entry.path, ref: step.ref, args, output: entry.output, passed: entry.passed};
    });
}
