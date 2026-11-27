// Experiment 03A: context-conditioned traversal.
//
// A copy-and-extend of the 02B traversal (experiments/bridge-conditional, untouched) whose
// per-hop execution is injectable. Per hop the trusted execution layer:
//   1. resolves the active context (never seeing contractual data),
//   2. injects ctx_ bindings beside the contractual data,
//   3. runs the network through the unmodified runtime,
//   4. evaluates route predicates against SETTLED CONTRACTUAL OUTPUT only.
// The resolver sees declared candidates and settled output. It never sees Context, and bridge
// maps never carry it. runtime.mjs does not enforce any of this; this adapter does.
import {run} from '../../runtime.mjs';
import {BridgeError} from '../bridge-conditional/bridge.mjs';
import {decide} from './decide.mjs';
import {ContextError, isContextual} from './boundary.mjs';
import {resolveContext} from './resolve.mjs';
import {translate} from './trace.mjs';

const resolverDefault = {resolve: ({eligible}) => eligible};

// The default executor: resolve context, inject, run, translate the trace.
export function contextExecutor(compiled, activeContext) {
    return ({name, hop, data, trace}) => {
        const network = compiled.executable.get(name);
        const raw = typeof activeContext === 'function' ? activeContext({network: name, hop}) : activeContext;
        let resolved;
        try { resolved = resolveContext(compiled.context, raw, name); }
        catch (error) {
            if (error.records) trace.push(...error.records.map(r => ({...r, hop})));
            throw error;
        }
        trace.push(...resolved.records.map(r => ({...r, hop})));
        trace.push({kind: 'Contractual', hop, network: name, data});
        const native = [];
        const settle = () => trace.push(...translate(native, name, hop, network, compiled.analysis));
        try {
            const result = run(network, {...data, ...resolved.injected}, native, name);
            settle();
            return result;
        } catch (error) { settle(); throw error; }
    };
}

export function traverse(compiled, input, {context, execute, resolver = resolverDefault, maxHops = compiled.maxHops} = {}) {
    const trace = [];
    const stop = (code, message, details = {}) => { throw new BridgeError(code, message, {...details, trace}); };
    for (const key of Object.keys(input ?? {})) {
        if (isContextual(key)) {
            const error = new ContextError('context_supplied', `Caller supplied reserved contextual value '${key}'`, {field: key, trace});
            trace.push({kind: 'Boundary', network: compiled.entry, passed: false, error: error.message});
            throw error;
        }
    }
    const executor = execute ?? contextExecutor(compiled, context);
    const visited = new Set();
    let name = compiled.entry, data = input;

    for (let hop = 1; ; hop++) {
        if (visited.has(name)) stop('cycle', `Network revisited at hop ${hop}: ${name}`, {network: name, hop});
        if (hop > maxHops) stop('hop_limit', `Hop limit ${maxHops} exceeded before running ${name}`, {network: name, hop});
        visited.add(name);
        let result;
        try { result = executor({name, hop, data, trace}); }
        catch (error) {
            trace.push({kind: 'Hop', hop, network: name, passed: false, error: error.message});
            if (error instanceof ContextError) { error.trace = trace; throw error; }
            stop('network_failed', `${name}: ${error.message}`, {network: name, hop, cause: error});
        }
        trace.push({kind: 'Settled', hop, network: name, output: result.output, passed: true});
        trace.push({kind: 'Hop', hop, network: name, input: data, output: result.output, passed: true});
        if (compiled.terminals.has(name)) {
            trace.push({kind: 'Terminal', hop, network: name, output: result.output, passed: true});
            return {output: result.output, network: name, hops: hop, path: trace.filter(t => t.kind === 'Hop').map(t => t.network), trace};
        }
        const next = decide(compiled, name, hop, result.output, trace, resolver, stop);
        name = next.to;
        data = next.input;
    }
}
