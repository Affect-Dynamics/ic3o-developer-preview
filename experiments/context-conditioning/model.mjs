// Experiment 03A: context model, part 1 - raw conditions and derived conditions.
//
// A context definition is an explicit, typed, inspectable JSON artifact:
//   conditions   raw typed conditions with an enumerated `domain` or numeric `range`
//   constraints  predicates over raw conditions that must hold (compatibility rules)
//   derived      conditions computed ONLY by lookup table over other conditions
//   bindings     per network: reserved Intake name (ctx_*) -> condition name
// No arithmetic, no defaults, no inference, no I/O. Context never reads contractual data in
// THIS experiment; that is an experimental restriction, not an architectural invariant
// (contract-dependent activation is Experiment 03B).
import {ContextError, isContextual} from './boundary.mjs';

export const fail = (code, message, details) => { throw new ContextError(code, message, details); };
export const TYPES = new Set(['integer', 'number', 'text', 'boolean']);
export const typeOf = (value, t) => t === 'integer' ? Number.isSafeInteger(value)
    : t === 'number' ? typeof value === 'number' && Number.isFinite(value)
    : t === 'text' ? typeof value === 'string' : typeof value === 'boolean';
export const isObject = v => v && typeof v === 'object' && !Array.isArray(v);

// Walk a nested lookup table: depth must equal the number of dependencies.
export function leaves(table, depth, path = []) {
    if (depth === 0) return [{path, value: table}];
    if (!isObject(table)) return null;
    const out = [];
    for (const [key, sub] of Object.entries(table)) {
        const found = leaves(sub, depth - 1, [...path, key]);
        if (!found) return null;
        out.push(...found);
    }
    return out;
}

export function compileConditions(defs) {
    if (!isObject(defs) || !Object.keys(defs).length) fail('invalid_context', 'Context must declare conditions');
    const conditions = {};
    for (const [name, c] of Object.entries(defs)) {
        if (isContextual(name)) fail('invalid_context', `Condition '${name}' must not use the reserved ctx_ namespace`, {condition: name});
        if (!isObject(c) || !TYPES.has(c.type)) fail('invalid_context', `Condition '${name}' needs a type: integer, number, text or boolean`, {condition: name});
        const hasDomain = Array.isArray(c.domain), hasRange = Array.isArray(c.range);
        if (hasDomain === hasRange) fail('invalid_context', `Condition '${name}' needs exactly one of domain or range`, {condition: name});
        if (hasDomain) {
            if (!c.domain.length || new Set(c.domain).size !== c.domain.length) fail('invalid_context', `Condition '${name}': domain must be non-empty without duplicates`, {condition: name});
            for (const v of c.domain) if (!typeOf(v, c.type)) fail('incompatible_type', `Condition '${name}': domain value ${JSON.stringify(v)} is not ${c.type}`, {condition: name});
        } else if (!['integer', 'number'].includes(c.type) || c.range.length !== 2 || !c.range.every(v => typeOf(v, c.type)) || c.range[0] > c.range[1]) {
            fail('invalid_context', `Condition '${name}': range must be [low, high] of a numeric type`, {condition: name});
        }
        conditions[name] = {type: c.type, domain: c.domain, range: c.range};
    }
    return conditions;
}

// Returns {derived, order}; order is a topological order. Circular derivations, undeclared
// dependencies and malformed definitions are rejected here, before anything executes.
export function compileDerived(defs, conditions) {
    if (!isObject(defs)) fail('invalid_context', 'derived must be an object');
    const derived = {};
    for (const [name, d] of Object.entries(defs)) {
        if (isContextual(name)) fail('invalid_context', `Derived condition '${name}' must not use the reserved ctx_ namespace`, {condition: name});
        if (Object.hasOwn(conditions, name)) fail('invalid_context', `Derived condition '${name}' duplicates a raw condition`, {condition: name});
        if (!isObject(d) || !TYPES.has(d.type) || !Array.isArray(d.from) || !d.from.length || !isObject(d.table)) {
            fail('invalid_context', `Derived condition '${name}' needs type, from[] and table{}`, {condition: name});
        }
        if (new Set(d.from).size !== d.from.length) fail('invalid_context', `Derived condition '${name}': duplicate dependency`, {condition: name});
        for (const dep of d.from) {
            if (!Object.hasOwn(conditions, dep) && !Object.hasOwn(defs, dep)) fail('undeclared_dependency', `Derived condition '${name}' depends on undeclared '${dep}'`, {condition: name, dependency: dep});
        }
        derived[name] = {type: d.type, from: [...d.from], table: d.table};
    }
    const order = [], state = new Map();
    const visit = (name, stack) => {
        if (state.get(name) === 'done') return;
        if (state.get(name) === 'open') fail('circular_derivation', `Circular derivation: ${[...stack.slice(stack.indexOf(name)), name].join(' -> ')}`, {condition: name});
        state.set(name, 'open');
        for (const dep of derived[name].from) if (Object.hasOwn(derived, dep)) visit(dep, [...stack, name]);
        state.set(name, 'done');
        order.push(name);
    };
    for (const name of Object.keys(derived)) visit(name, []);
    return {derived, order};
}
