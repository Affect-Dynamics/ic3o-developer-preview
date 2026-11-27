// Experiment 03A: binding checks and per-invocation context resolution.
//
// resolveContext runs once per network invocation, in the trusted execution layer. It never
// sees contractual data. It returns separated trace records (RawContext, DerivedContext,
// Injection); on failure the thrown ContextError carries the same records including the
// failed one, so failed contextual evaluations are observable too.
import {evaluate} from '../bridge-conditional/bridge.mjs';
import {ContextError, isContextual} from './boundary.mjs';
import {fail, typeOf, isObject} from './model.mjs';

// Every ctx_ Intake of a network must be bound with a matching type; nothing else may be.
export function checkBindings(compiled, name, network) {
    const declared = Object.keys(network.inputs).filter(isContextual);
    const bound = compiled.bindings[name] ?? {};
    for (const intake of declared) {
        if (!Object.hasOwn(bound, intake)) fail('unbound_context', `${name}: contextual Intake '${intake}' has no binding`, {network: name, field: intake});
        const want = network.inputs[intake], have = compiled.types[bound[intake]];
        if (want !== have) fail('incompatible_type', `${name}: ${intake} is ${want} but condition '${bound[intake]}' is ${have}`, {network: name, field: intake});
    }
    for (const intake of Object.keys(bound)) {
        if (!declared.includes(intake)) fail('unknown_binding', `${name}: binding '${intake}' does not correspond to a contextual Intake`, {network: name, field: intake});
    }
}

const needed = (compiled, name) => {
    const want = new Set();
    const add = n => { if (want.has(n)) return; want.add(n); if (Object.hasOwn(compiled.derived, n)) compiled.derived[n].from.forEach(add); };
    Object.values(compiled.bindings[name] ?? {}).forEach(add);
    return want;
};

export function resolveContext(compiled, raw, network) {
    const records = [];
    const rawRecord = {kind: 'RawContext', network, values: isObject(raw) ? {...raw} : raw, constraints: [], passed: false};
    records.push(rawRecord);
    const stop = (code, message, extra = {}) => {
        rawRecord.error ??= message;
        const error = new ContextError(code, message, {network, ...extra});
        error.records = records;
        throw error;
    };
    if (!isObject(raw)) stop('missing_context', 'Active context must be an object');
    for (const key of Object.keys(raw)) if (!Object.hasOwn(compiled.conditions, key)) stop('undeclared_condition', `Context supplies undeclared condition '${key}'`, {condition: key});
    for (const [key, c] of Object.entries(compiled.conditions)) {
        if (!Object.hasOwn(raw, key)) stop('missing_condition', `Context is missing condition '${key}'`, {condition: key});
        const v = raw[key];
        if (!typeOf(v, c.type)) stop('invalid_condition', `Condition '${key}' must be ${c.type}, got ${JSON.stringify(v)}`, {condition: key});
        if (c.domain && !c.domain.includes(v)) stop('out_of_domain', `Condition '${key}': ${JSON.stringify(v)} is not one of ${JSON.stringify(c.domain)}`, {condition: key});
        if (c.range && (v < c.range[0] || v > c.range[1])) stop('out_of_domain', `Condition '${key}': ${v} is outside [${c.range[0]}, ${c.range[1]}]`, {condition: key});
    }
    const failed = [];
    for (const c of compiled.constraints) {
        const passed = evaluate(c.ast, raw);
        rawRecord.constraints.push({id: c.id, require: c.require, passed});
        if (!passed) failed.push(c.id);
    }
    if (failed.length) stop('constraint_violated', `Incompatible context: constraint ${failed.join(', ')} violated by ${JSON.stringify(raw)}`, {constraints: failed});
    rawRecord.passed = true;

    const derivedRecord = {kind: 'DerivedContext', network, derived: [], passed: false};
    records.push(derivedRecord);
    const values = {...raw};
    const want = needed(compiled, network);
    for (const name of compiled.order.filter(n => want.has(n))) {
        const d = compiled.derived[name];
        const keys = d.from.map(dep => String(values[dep]));
        let cursor = d.table;
        for (const key of keys) cursor = isObject(cursor) && Object.hasOwn(cursor, key) ? cursor[key] : undefined;
        const entry = {name, from: Object.fromEntries(d.from.map(dep => [dep, values[dep]])), entry: keys.join('/')};
        derivedRecord.derived.push(entry);
        if (cursor === undefined) {
            entry.error = 'no table entry';
            derivedRecord.error = `No table entry for ${name}[${keys.join('/')}]`;
            stop('missing_entry', derivedRecord.error, {condition: name});
        }
        entry.value = cursor;
        values[name] = cursor;
    }
    derivedRecord.passed = true;

    const map = compiled.bindings[network] ?? {};
    const injected = Object.fromEntries(Object.entries(map).map(([intake, condition]) => [intake, values[condition]]));
    records.push({kind: 'Injection', network, bindings: Object.fromEntries(Object.entries(map).map(([intake, condition]) => [intake, {condition, value: values[condition]}])), passed: true});
    return {records, injected};
}
