// Experiment 02: network traversal separated from network computation.
//
// This module only consumes the public runtime API (load, run). It adds no PEP syntax
// and changes no runtime behavior. A bridge is a structural binding between one
// network's settled Outtake and the next network's Intake. It never transforms data:
// every mapped value is copied unchanged and must satisfy the receiving Intake type.
//
// The resolver is the replaceable part. The deterministic resolver reads an explicit
// route table. Any object with `resolve({from, output, hop}) => route[]` can replace it
// (for example a Jev Bridges resolver) without touching a participating PEP. Whatever
// the resolver returns is re-validated here before any data crosses a bridge.
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

// Effects are prohibited in the whole experimental network: steps, nested PEPs and sidechains.
function findEffects(network, where = network.name, found = []) {
    for (const step of network.steps) {
        if (step.effect) found.push(`${where}/${step.id}`);
        if (step.child) findEffects(step.child, `${where}/${step.id}`, found);
    }
    for (const side of network.sidechains ?? []) findEffects(side.network, `${where}/@${side.ref}`, found);
    return found;
}

// Structural check of one route against its source and destination interfaces.
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

// Copy mapped values unchanged. Unmapped source outputs are discarded and reported.
function bind(route, from, to, output) {
    checkMap(route, from, to);
    const input = {};
    const used = new Set();
    for (const [intake, source] of Object.entries(route.map)) {
        input[intake] = output[source];
        used.add(source);
    }
    return {input, discarded: Object.keys(from.outputs).filter(k => !used.has(k))};
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

// Validate a route table before any execution and return the compiled form.
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

    const ids = new Set();
    const terminals = new Set(table.terminals);
    const outgoing = new Map(Object.keys(networks).map(n => [n, []]));
    for (const route of table.routes) {
        if (typeof route.id !== 'string' || !route.id) fail('invalid_table', 'Every route needs an id');
        if (ids.has(route.id)) fail('duplicate_route', `Duplicate route id: ${route.id}`, {route: route.id});
        ids.add(route.id);
        for (const end of [route.from, route.to]) {
            if (!Object.hasOwn(networks, end)) fail('unknown_network', `route ${route.id}: network not declared: ${end}`, {route: route.id, network: end});
        }
        if (terminals.has(route.from)) fail('terminal_has_route', `route ${route.id}: terminal network ${route.from} must not have outgoing routes`, {route: route.id, network: route.from});
        outgoing.get(route.from).push(route);
        checkMap(route, networks[route.from], networks[route.to]);
    }
    for (const [name, routes] of outgoing) {
        if (routes.length > 1) fail('ambiguous_route', `Ambiguous routes from ${name}: ${routes.map(r => r.id).join(', ')}`, {network: name, candidates: routes.map(r => r.id)});
    }

    const graph = new Map([...outgoing].map(([name, routes]) => [name, new Set(routes.map(r => r.to))]));
    const reachable = new Set();
    (function walk(name) { if (reachable.has(name)) return; reachable.add(name); for (const n of graph.get(name)) walk(n); })(table.entry);
    for (const name of reachable) {
        if (!terminals.has(name) && !outgoing.get(name).length) fail('missing_route', `Network ${name} is reachable, is not terminal and has no outgoing route`, {network: name});
    }
    detectCycle(graph, table.entry);
    const depth = longestPath(graph, table.entry);
    if (depth > limit) fail('hop_limit', `Longest route path executes ${depth} networks; limit is ${limit}`, {depth, limit});

    return {entry: table.entry, terminals, networks, files: table.networks, routes: table.routes, maxHops: limit};
}

export function loadRoutes(file, options) {
    const table = JSON.parse(fs.readFileSync(file, 'utf8'));
    return compile(table, path.dirname(path.resolve(file)), options);
}

// Deterministic resolver: the routes declared for the source network, nothing inferred.
export function deterministicResolver(compiled) {
    return {resolve: ({from}) => compiled.routes.filter(r => r.from === from)};
}


// Execute networks along bridges. Each network runs through the unmodified runtime, so
// Require, Guarantee and its native trace apply per network. The combined trace is the
// primary result and is attached to every BridgeError.
export function traverse(compiled, input, {resolver = deterministicResolver(compiled), maxHops = compiled.maxHops, detectCycles = true} = {}) {
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

        const candidates = resolver.resolve({from: name, output: result.output, hop}) ?? [];
        const decision = {kind: 'Bridge', hop, from: name, candidates: candidates.map(r => r.id)};

        if (compiled.terminals.has(name)) {
            if (candidates.length) {
                trace.push({...decision, passed: false, error: 'terminal network has outgoing route'});
                stop('terminal_has_route', `Terminal network ${name} resolved routes: ${decision.candidates.join(', ')}`, {network: name, hop});
            }
            trace.push({kind: 'Terminal', hop, network: name, output: result.output, passed: true});
            return {output: result.output, network: name, hops: hop, trace};
        }
        if (!candidates.length) {
            trace.push({...decision, passed: false, error: 'no route'});
            stop('missing_route', `No route from non-terminal network ${name}`, {network: name, hop});
        }
        if (candidates.length > 1) {
            trace.push({...decision, passed: false, error: 'ambiguous'});
            stop('ambiguous_route', `Ambiguous routes from ${name}: ${decision.candidates.join(', ')}`, {network: name, hop, candidates: decision.candidates});
        }

        const route = candidates[0];
        let bound;
        try {
            if (route.from !== name) fail('invalid_route', `route ${route.id} starts at ${route.from}, not ${name}`, {route: route.id});
            if (!Object.hasOwn(compiled.networks, route.to)) fail('unknown_network', `route ${route.id}: network not declared: ${route.to}`, {route: route.id, network: route.to});
            bound = bind(route, network, compiled.networks[route.to], result.output);
        } catch (error) {
            trace.push({...decision, route: route.id, passed: false, error: error.message});
            stop(error.code ?? 'invalid_route', error.message, {network: name, hop, route: route.id});
        }
        trace.push({...decision, to: route.to, route: route.id, map: route.map, mapped: bound.input, discarded: bound.discarded, passed: true});
        name = route.to;
        data = bound.input;
    }
}

