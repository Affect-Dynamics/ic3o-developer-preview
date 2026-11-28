// Experiment 02B: deterministic conditional traversal.
//
// Extends the Experiment 02 baseline (experiments/bridge, left untouched) so that a source
// network may have several candidate routes. Each candidate carries an explicit predicate
// (`when`) evaluated against the source network's settled output. At runtime exactly one
// candidate must be eligible. Maps stay structural copies; bridges never transform data.
//
// Only the public runtime API (load, run) is used. No PEP grammar or Context change.
// The resolver may SELECT among declared candidates; it can never invent a route.
import fs from 'node:fs';
import path from 'node:path';
import {load, run} from '../../runtime.mjs';

export const DEFAULT_MAX_HOPS = 8;

export class BridgeError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'BridgeError';
        this.code = code;
        Object.assign(this, details);
    }
}
const fail = (code, message, details) => { throw new BridgeError(code, message, details); };

function findEffects(network, where = network.name, found = []) {
    for (const step of network.steps) {
        if (step.effect) found.push(`${where}/${step.id}`);
        if (step.child) findEffects(step.child, `${where}/${step.id}`, found);
    }
    for (const side of network.sidechains ?? []) findEffects(side.network, `${where}/@${side.ref}`, found);
    return found;
}

function checkMap(route, from, to) {
    const where = `route ${route.id}`;
    if (!route.map || typeof route.map !== 'object' || Array.isArray(route.map)) {
        fail('invalid_table', `${where}: map must be an object of intakeField: outputField`, {route: route.id});
    }
    for (const [intake, source] of Object.entries(route.map)) {
        if (typeof source !== 'string') fail('invalid_table', `${where}: map.${intake} must name a source output field`, {route: route.id});
        if (!Object.hasOwn(to.inputs, intake)) fail('unknown_field', `${where}: ${to.name} has no Intake field '${intake}'`, {route: route.id, field: intake});
        if (!Object.hasOwn(from.outputs, source)) fail('unknown_field', `${where}: ${from.name} has no Outtake field '${source}'`, {route: route.id, field: source});
        if (from.outputs[source] !== to.inputs[intake]) {
            fail('incompatible_type', `${where}: ${from.name}.${source} is ${from.outputs[source]} but ${to.name}.${intake} requires ${to.inputs[intake]}`, {route: route.id, field: intake});
        }
    }
    const missing = Object.keys(to.inputs).filter(k => !Object.hasOwn(route.map, k));
    if (missing.length) fail('incomplete_mapping', `${where}: Intake of ${to.name} not satisfied; unmapped: ${missing.join(', ')}`, {route: route.id, missing});
}

function bind(route, from, to, output) {
    checkMap(route, from, to);
    const input = {};
    const used = new Set();
    for (const [intake, source] of Object.entries(route.map)) { input[intake] = output[source]; used.add(source); }
    return {input, discarded: Object.keys(from.outputs).filter(k => !used.has(k))};
}

// ---- Predicate language -------------------------------------------------------------
// or   := and ('or' and)*        and := not ('and' not)*        not := 'not' not | atom
// atom := '(' or ')' | operand OP operand            OP := = != < <= > >=
// operand := settled output field | number | "text" | true | false
// Pure comparisons over settled output fields: no arithmetic, calls, assignment or I/O.
const TOKEN = /\s*(?:(-?\d+(?:\.\d+)?)|"([^"]*)"|(!=|<=|>=|=|<|>|\(|\))|([A-Za-z_][A-Za-z0-9_]*))/y;
const WORDS = new Set(['and', 'or', 'not']);
const NUMERIC = new Set(['integer', 'number']);

function tokenize(text, id) {
    const tokens = [];
    TOKEN.lastIndex = 0;
    while (!/^\s*$/.test(text.slice(TOKEN.lastIndex))) {
        const at = TOKEN.lastIndex;
        const m = TOKEN.exec(text);
        if (!m) fail('invalid_predicate', `route ${id}: unexpected character at ${at} in '${text}'`, {route: id});
        if (m[1] !== undefined) tokens.push({t: 'lit', type: m[1].includes('.') ? 'number' : 'integer', value: Number(m[1])});
        else if (m[2] !== undefined) tokens.push({t: 'lit', type: 'text', value: m[2]});
        else if (m[3] !== undefined) tokens.push({t: m[3]});
        else if (m[4] === 'true' || m[4] === 'false') tokens.push({t: 'lit', type: 'boolean', value: m[4] === 'true'});
        else if (WORDS.has(m[4])) tokens.push({t: m[4]});
        else tokens.push({t: 'field', name: m[4]});
    }
    return tokens;
}

// Parse and type-check a predicate against the source network's Outtake types.
export function parsePredicate(text, outputs, id = '?') {
    if (typeof text !== 'string' || !text.trim()) fail('invalid_predicate', `route ${id}: when must be a non-empty string`, {route: id});
    const tokens = tokenize(text, id);
    let i = 0;
    const bad = why => fail('invalid_predicate', `route ${id}: ${why} in '${text}'`, {route: id});
    const peek = () => tokens[i]?.t;
    const operand = () => {
        const tok = tokens[i++];
        if (tok?.t === 'lit') return {kind: 'lit', type: tok.type, value: tok.value};
        if (tok?.t === 'field') {
            if (!Object.hasOwn(outputs, tok.name)) fail('unknown_field', `route ${id}: predicate field '${tok.name}' is not a settled output of the source network`, {route: id, field: tok.name});
            return {kind: 'field', name: tok.name, type: outputs[tok.name]};
        }
        return bad('expected a field or literal');
    };
    const atom = () => {
        if (peek() === '(') { i++; const e = or(); if (tokens[i++]?.t !== ')') bad('missing )'); return e; }
        const left = operand();
        const op = tokens[i++]?.t;
        if (!['=', '!=', '<', '<=', '>', '>='].includes(op)) bad('expected a comparison operator');
        const right = operand();
        if (left.kind === 'lit' && right.kind === 'lit') bad('constant comparison');
        const numeric = NUMERIC.has(left.type) && NUMERIC.has(right.type);
        if (!numeric && left.type !== right.type) bad(`cannot compare ${left.type} with ${right.type}`);
        if (op !== '=' && op !== '!=' && !numeric) bad(`'${op}' requires numeric operands`);
        return {kind: 'cmp', op, left, right};
    };
    const not = () => { if (peek() === 'not') { i++; return {kind: 'not', expr: not()}; } return atom(); };
    const and = () => { let e = not(); while (peek() === 'and') { i++; e = {kind: 'and', left: e, right: not()}; } return e; };
    const or = () => { let e = and(); while (peek() === 'or') { i++; e = {kind: 'or', left: e, right: and()}; } return e; };
    const ast = or();
    if (i < tokens.length) bad(`unexpected '${tokens[i].t}'`);
    return ast;
}

export function evaluate(ast, output) {
    const val = o => {
        if (o.kind === 'lit') return o.value;
        const v = output[o.name];
        if (v === undefined || v === null) fail('predicate_error', `settled output has no value for '${o.name}'`, {field: o.name});
        return v;
    };
    switch (ast.kind) {
        case 'and': return evaluate(ast.left, output) && evaluate(ast.right, output);
        case 'or': return evaluate(ast.left, output) || evaluate(ast.right, output);
        case 'not': return !evaluate(ast.expr, output);
        default: {
            const a = val(ast.left), b = val(ast.right);
            return {'=': a === b, '!=': a !== b, '<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b}[ast.op];
        }
    }
}

function detectCycle(graph, entry) {
    const state = new Map();
    const stack = [];
    (function visit(name) {
        state.set(name, 'active');
        stack.push(name);
        for (const next of graph.get(name) ?? []) {
            if (state.get(next) === 'active') {
                const cycle = [...stack.slice(stack.indexOf(next)), next];
                fail('cycle', `Route cycle: ${cycle.join(' -> ')}`, {cycle});
            }
            if (!state.has(next)) visit(next);
        }
        stack.pop();
        state.set(name, 'done');
    })(entry);
}

function longestPath(graph, name, memo = new Map()) {
    if (memo.has(name)) return memo.get(name);
    const length = 1 + Math.max(0, ...[...(graph.get(name) ?? [])].map(n => longestPath(graph, n, memo)));
    memo.set(name, length);
    return length;
}

// Validate the whole table before execution: every candidate's structure, mapping, types
// and predicate, whether or not it will ever be eligible.
export function compile(table, baseDir = '.', {maxHops, loader = load} = {}) {
    if (!table || typeof table !== 'object') fail('invalid_table', 'Route table must be an object');
    const limit = maxHops ?? table.maxHops ?? DEFAULT_MAX_HOPS;
    if (!Number.isInteger(limit) || limit < 1) fail('invalid_table', 'maxHops must be a positive integer');
    if (typeof table.entry !== 'string') fail('invalid_table', 'Route table must declare entry');
    if (!Array.isArray(table.terminals) || !table.terminals.length || table.terminals.some(t => typeof t !== 'string')) {
        fail('invalid_table', 'Route table must declare at least one terminal network');
    }
    if (!table.networks || typeof table.networks !== 'object' || !Object.keys(table.networks).length) fail('invalid_table', 'Route table must declare networks');
    if (!Array.isArray(table.routes)) fail('invalid_table', 'Route table must declare routes (may be empty)');
    for (const name of [table.entry, ...table.terminals]) {
        if (!Object.hasOwn(table.networks, name)) fail('unknown_network', `Network not declared: ${name}`, {network: name});
    }

    const networks = {};
    for (const [name, file] of Object.entries(table.networks)) {
        if (typeof file !== 'string') fail('invalid_table', `Network ${name} must map to a PEP path`);
        networks[name] = loader(path.resolve(baseDir, file));
        const effects = findEffects(networks[name]);
        if (effects.length) fail('effect_prohibited', `Effects are prohibited in bridge experiments: ${effects.join(', ')}`, {network: name, effects});
    }

    const byId = new Map();
    const terminals = new Set(table.terminals);
    const outgoing = new Map(Object.keys(networks).map(n => [n, []]));
    for (const route of table.routes) {
        if (!route || typeof route.id !== 'string' || !route.id) fail('invalid_table', 'Every route needs an id');
        if (byId.has(route.id)) fail('duplicate_route', `Duplicate route id: ${route.id}`, {route: route.id});
        for (const end of [route.from, route.to]) {
            if (!Object.hasOwn(networks, end)) fail('unknown_network', `route ${route.id}: network not declared: ${end}`, {route: route.id, network: end});
        }
        if (terminals.has(route.from)) fail('terminal_has_route', `route ${route.id}: terminal network ${route.from} must not have outgoing routes`, {route: route.id, network: route.from});
        checkMap(route, networks[route.from], networks[route.to]);
        const predicate = parsePredicate(route.when, networks[route.from].outputs, route.id);
        const declared = Object.freeze({...route, map: Object.freeze({...route.map})});
        byId.set(route.id, {route: declared, predicate, definition: JSON.stringify({id: route.id, from: route.from, to: route.to, when: route.when, map: route.map})});
        outgoing.get(route.from).push(route.id);
    }

    const graph = new Map([...outgoing].map(([name, ids]) => [name, new Set(ids.map(id => byId.get(id).route.to))]));
    const reachable = new Set();
    (function walk(name) { if (reachable.has(name)) return; reachable.add(name); for (const n of graph.get(name)) walk(n); })(table.entry);
    for (const name of reachable) {
        if (!terminals.has(name) && !outgoing.get(name).length) fail('missing_route', `Network ${name} is reachable, is not terminal and has no outgoing route`, {network: name});
    }
    detectCycle(graph, table.entry);
    const depth = longestPath(graph, table.entry);
    if (depth > limit) fail('hop_limit', `Longest route path executes ${depth} networks; limit is ${limit}`, {depth, limit});

    return {entry: table.entry, terminals, networks, files: table.networks, routes: byId, outgoing, maxHops: limit};
}

export function loadRoutes(file, options) {
    const table = JSON.parse(fs.readFileSync(file, 'utf8'));
    return compile(table, path.dirname(path.resolve(file)), options);
}

// Deterministic resolver: offers every declared candidate; eligibility is decided by the
// predicates. Any replacement receives the same declared candidates and may only select
// among them: resolve({from, output, hop, candidates, eligible}) => route[] (or route ids).
// `candidates` are all declared routes; `eligible` are those whose predicate held.
export function deterministicResolver() {
    return {resolve: ({eligible}) => eligible};
}

// Execute networks along conditionally selected bridges. Per hop: run the network through
// the unmodified runtime, evaluate every declared candidate's predicate against the settled
// output, then require exactly one eligible candidate. The resolver may only select among
// declared, eligible candidates. The trace records every candidate and its disposition.
export function traverse(compiled, input, {resolver = deterministicResolver(), maxHops = compiled.maxHops, detectCycles = true} = {}) {
    const trace = [];
    const visited = new Set();
    const stop = (code, message, details = {}) => fail(code, message, {...details, trace});
    let name = compiled.entry;
    let data = input;

    for (let hop = 1; ; hop++) {
        if (detectCycles && visited.has(name)) stop('cycle', `Network revisited at hop ${hop}: ${name}`, {network: name, hop});
        if (hop > maxHops) stop('hop_limit', `Hop limit ${maxHops} exceeded before running ${name}`, {network: name, hop});
        visited.add(name);

        const network = compiled.networks[name];
        const native = [];
        let result;
        try {
            result = run(network, data, native, name);
        } catch (error) {
            trace.push({kind: 'Hop', hop, network: name, file: network.file, input: data, passed: false, error: error.message, nativeTrace: native});
            stop('network_failed', `${name}: ${error.message}`, {network: name, hop, cause: error});
        }
        trace.push({kind: 'Hop', hop, network: name, file: network.file, input: data, output: result.output, passed: true, nativeTrace: native});

        const declared = (compiled.outgoing.get(name) ?? []).map(id => compiled.routes.get(id));
        if (compiled.terminals.has(name)) {
            trace.push({kind: 'Terminal', hop, network: name, output: result.output, passed: true});
            return {output: result.output, network: name, hops: hop, path: trace.filter(t => t.kind === 'Hop').map(t => t.network), trace};
        }

        // Evaluate every declared candidate; none is skipped, so the trace is complete.
        const candidates = declared.map(({route, predicate}) => {
            const entry = {id: route.id, to: route.to, when: route.when};
            try { entry.eligible = evaluate(predicate, result.output); entry.reason = entry.eligible ? 'predicate true' : 'predicate false'; }
            catch (error) { entry.eligible = false; entry.reason = `predicate error: ${error.message}`; entry.error = true; }
            return entry;
        });
        const decision = {kind: 'Bridge', hop, from: name, output: result.output, candidates};
        const eligible = candidates.filter(c => c.eligible);
        const reject = (code, message, extra = {}) => {
            trace.push({...decision, passed: false, error: message});
            stop(code, message, {network: name, hop, ...extra});
        };

        if (candidates.some(c => c.error)) reject('predicate_error', `${name}: ${candidates.filter(c => c.error).map(c => `${c.id} (${c.reason})`).join('; ')}`);
        if (!eligible.length) {
            for (const c of candidates) c.rejection = c.reason;
            reject('no_eligible_route', `No eligible route from ${name} for ${JSON.stringify(result.output)}`, {candidates: candidates.map(c => c.id)});
        }
        if (eligible.length > 1) {
            for (const c of eligible) c.rejection = `overlaps with ${eligible.filter(o => o !== c).map(o => o.id).join(', ')}`;
            for (const c of candidates) c.rejection ??= c.reason;
            reject('ambiguous_route', `Overlapping predicates from ${name}: ${eligible.map(c => c.id).join(', ')} are all eligible`, {candidates: eligible.map(c => c.id)});
        }

        // The resolver sees the declared candidates and may only select one of them.
        const only = eligible[0];
        const offered = declared.map(d => d.route);
        let picked = resolver.resolve({from: name, output: result.output, hop, candidates: offered, eligible: offered.filter(r => eligible.some(e => e.id === r.id))}) ?? [];
        picked = Array.isArray(picked) ? picked : [picked];
        const ids = picked.map(p => (typeof p === 'string' ? p : p?.id));
        for (const [i, p] of picked.entries()) {
            const entry = declared.find(d => d.route.id === ids[i]);
            const forged = entry && typeof p !== 'string' && JSON.stringify({id: p.id, from: p.from, to: p.to, when: p.when, map: p.map}) !== entry.definition;
            if (!entry || forged) {
                for (const c of candidates) c.rejection = c.eligible ? 'eligible but not selected' : c.reason;
                reject('unauthorized_route', entry ? `Resolver returned a modified definition of route ${ids[i]}` : `Resolver selected '${ids[i]}', which is not a declared candidate from ${name}`, {route: ids[i]});
            }
        }
        const selected = [...new Set(ids)];
        if (selected.length !== 1 || selected[0] !== only.id) {
            for (const c of candidates) c.rejection = c.id === only.id ? 'eligible but not selected' : (selected.includes(c.id) ? `selected but ${c.reason}` : c.reason);
            reject(selected.length > 1 ? 'ambiguous_route' : selected.length ? 'ineligible_selection' : 'no_selection',
                selected.length ? `Resolver selected ${selected.join(', ')}; the only eligible route is ${only.id}` : `Resolver selected no route; the only eligible route is ${only.id}`,
                {candidates: selected});
        }

        const {route} = compiled.routes.get(only.id);
        let bound;
        try {
            bound = bind(route, network, compiled.networks[route.to], result.output);
        } catch (error) {
            reject(error.code ?? 'invalid_route', error.message, {route: route.id});
        }
        for (const c of candidates) { if (c.id === route.id) c.selected = true; else c.rejection = c.reason; }
        trace.push({...decision, to: route.to, route: route.id, map: route.map, mapped: bound.input, discarded: bound.discarded, passed: true});
        name = route.to;
        data = bound.input;
    }
}
