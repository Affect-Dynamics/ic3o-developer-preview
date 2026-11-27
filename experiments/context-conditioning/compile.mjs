// Experiment 03A: compile a route table together with a context definition.
//
// Reuses the 02B route compiler unchanged. 02B sees each network through a CONTRACTUAL VIEW
// whose Intake omits the reserved ctx_ names, so a route can neither map into nor out of a
// contextual binding, and the complete-mapping rule applies to contractual data only. The
// full network (with ctx_ Intake) is kept for execution by the trusted layer.
//
// The underlying runtime does not enforce any of this. This adapter does.
import fs from 'node:fs';
import path from 'node:path';
import {load} from '../../runtime.mjs';
import {compile} from '../bridge-conditional/bridge.mjs';
import {audit, isContextual, ContextError} from './boundary.mjs';
import {compileContext} from './context.mjs';
import {checkBindings} from './resolve.mjs';

const fail = (code, message, details) => { throw new ContextError(code, message, details); };

export function compileExperiment(table, definition, baseDir = '.', options = {}) {
    const context = compileContext(definition);
    for (const route of Array.isArray(table?.routes) ? table.routes : []) {
        for (const [intake, source] of Object.entries(route?.map ?? {})) {
            if (isContextual(intake) || isContextual(source)) {
                fail('context_bridged', `route ${route.id}: bridges must not carry contextual values (${intake}: ${source})`, {route: route.id});
            }
        }
    }
    const full = new Map(), analysis = new Map();
    const loader = file => {
        const network = load(file);
        audit(network, analysis);
        full.set(network.file, network);
        const inputs = Object.fromEntries(Object.entries(network.inputs).filter(([k]) => !isContextual(k)));
        return {...network, inputs};
    };
    const compiled = compile(table, baseDir, {...options, loader});
    const executable = new Map();
    for (const name of Object.keys(compiled.networks)) {
        const network = full.get(compiled.networks[name].file);
        checkBindings(context, name, network);
        executable.set(name, network);
    }
    for (const name of Object.keys(context.bindings)) {
        if (!executable.has(name)) fail('unknown_binding', `Context binds undeclared network '${name}'`, {network: name});
    }
    return {...compiled, context, executable, analysis};
}

export function loadExperiment(tableFile, contextFile, options) {
    const table = JSON.parse(fs.readFileSync(tableFile, 'utf8'));
    const definition = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
    return compileExperiment(table, definition, path.dirname(path.resolve(tableFile)), options);
}
