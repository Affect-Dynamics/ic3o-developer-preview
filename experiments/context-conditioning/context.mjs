// Experiment 03A: context model, part 2 - compilation of a whole context definition.
import {parsePredicate, evaluate} from '../bridge-conditional/bridge.mjs';
import {isContextual} from './boundary.mjs';
import {fail, typeOf, isObject, leaves, compileConditions, compileDerived} from './model.mjs';

function fieldsOf(ast, found = new Set()) {
    if (ast.kind === 'cmp') { for (const o of [ast.left, ast.right]) if (o.kind === 'field') found.add(o.name); }
    else if (ast.kind === 'not') fieldsOf(ast.expr, found);
    else { fieldsOf(ast.left, found); fieldsOf(ast.right, found); }
    return found;
}

export function compileContext(def) {
    if (!isObject(def)) fail('invalid_context', 'Context definition must be an object');
    const constraintDefs = def.constraints ?? [];
    if (!Array.isArray(constraintDefs)) fail('invalid_context', 'constraints must be an array');
    if (!isObject(def.bindings)) fail('invalid_context', 'Context must declare bindings (may be empty)');
    const conditions = compileConditions(def.conditions);
    const {derived, order} = compileDerived(def.derived ?? {}, conditions);
    const rawTypes = Object.fromEntries(Object.entries(conditions).map(([k, v]) => [k, v.type]));
    const types = {...rawTypes, ...Object.fromEntries(Object.entries(derived).map(([k, v]) => [k, v.type]))};

    const constraints = [];
    for (const c of constraintDefs) {
        if (!isObject(c) || typeof c.id !== 'string' || !c.id || typeof c.require !== 'string') fail('invalid_context', 'Every constraint needs an id and a require predicate');
        if (constraints.some(k => k.id === c.id)) fail('invalid_context', `Duplicate constraint id: ${c.id}`, {constraint: c.id});
        let ast;
        try { ast = parsePredicate(c.require, rawTypes, c.id); }
        catch (error) { fail('invalid_constraint', `constraint ${c.id}: ${error.message}`, {constraint: c.id}); }
        constraints.push({id: c.id, require: c.require, ast, fields: fieldsOf(ast)});
    }

    // Possible values of a condition as strings, for table-key validation. null = unbounded.
    const possible = name => {
        if (Object.hasOwn(conditions, name)) return conditions[name].domain ? conditions[name].domain.map(String) : null;
        const found = leaves(derived[name].table, derived[name].from.length);
        return found ? [...new Set(found.map(l => String(l.value)))] : null;
    };
    for (const [name, d] of Object.entries(derived)) {
        const found = leaves(d.table, d.from.length);
        if (!found) fail('invalid_table', `Derived condition '${name}': table nesting must be exactly ${d.from.length} level(s) deep`, {condition: name});
        for (const {path, value} of found) {
            if (!typeOf(value, d.type)) fail('incompatible_type', `Derived condition '${name}': entry ${path.join('/')} is ${JSON.stringify(value)}, expected ${d.type}`, {condition: name});
            path.forEach((key, i) => {
                const allowed = possible(d.from[i]);
                if (allowed && !allowed.includes(key)) fail('invalid_table', `Derived condition '${name}': key '${key}' is not a possible value of '${d.from[i]}'`, {condition: name, key});
            });
        }
        // Totality: when every dependency is a raw enumerated condition, each combination needs an
        // entry unless a constraint over those dependencies forbids it. Never a silent default.
        if (d.from.every(dep => Object.hasOwn(conditions, dep) && conditions[dep].domain)) {
            const present = new Set(found.map(l => l.path.join('\u0000')));
            const combos = d.from.reduce((acc, dep) => acc.flatMap(p => conditions[dep].domain.map(v => [...p, v])), [[]]);
            for (const combo of combos) {
                if (present.has(combo.map(String).join('\u0000'))) continue;
                const values = Object.fromEntries(d.from.map((dep, i) => [dep, combo[i]]));
                const forbidden = constraints.some(c => [...c.fields].every(f => d.from.includes(f)) && !evaluate(c.ast, values));
                if (!forbidden) fail('missing_entry', `Derived condition '${name}': no table entry for ${d.from.map((dep, i) => `${dep}=${combo[i]}`).join(', ')} and no constraint forbids it`, {condition: name});
            }
        }
    }

    const bindings = {};
    for (const [network, map] of Object.entries(def.bindings)) {
        if (!isObject(map)) fail('invalid_context', `bindings.${network} must be an object`, {network});
        bindings[network] = {};
        for (const [intake, condition] of Object.entries(map)) {
            if (!isContextual(intake)) fail('namespace_violation', `bindings.${network}: '${intake}' is not in the reserved ctx_ namespace`, {network, field: intake});
            if (!Object.hasOwn(types, condition)) fail('undeclared_dependency', `bindings.${network}.${intake}: undeclared condition '${condition}'`, {network, field: intake});
            bindings[network][intake] = condition;
        }
    }
    return {conditions, derived, order, types, constraints, bindings};
}
