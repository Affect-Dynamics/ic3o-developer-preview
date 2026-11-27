// Experiment 03A: the bridge decision, copied from the 02B semantics.
// Exactly one declared candidate must be eligible; the resolver may only select it.
// Predicates see settled contractual output only. Maps were validated at compile time.
import {evaluate} from '../bridge-conditional/bridge.mjs';

export function decide(compiled, name, hop, output, trace, resolver, stop) {
    const declared = (compiled.outgoing.get(name) ?? []).map(id => compiled.routes.get(id));
    const candidates = declared.map(({route, predicate}) => {
        const entry = {id: route.id, to: route.to, when: route.when};
        try { entry.eligible = evaluate(predicate, output); entry.reason = entry.eligible ? 'predicate true' : 'predicate false'; }
        catch (error) { entry.eligible = false; entry.reason = `predicate error: ${error.message}`; entry.error = true; }
        return entry;
    });
    const decision = {kind: 'Bridge', hop, from: name, output, candidates};
    const eligible = candidates.filter(c => c.eligible);
    const reject = (code, message, extra = {}) => {
        trace.push({...decision, passed: false, error: message});
        stop(code, message, {network: name, hop, ...extra});
    };
    if (candidates.some(c => c.error)) reject('predicate_error', `${name}: ${candidates.filter(c => c.error).map(c => `${c.id} (${c.reason})`).join('; ')}`);
    if (!eligible.length) {
        for (const c of candidates) c.rejection = c.reason;
        reject('no_eligible_route', `No eligible route from ${name} for ${JSON.stringify(output)}`, {candidates: candidates.map(c => c.id)});
    }
    if (eligible.length > 1) {
        for (const c of eligible) c.rejection = `overlaps with ${eligible.filter(o => o !== c).map(o => o.id).join(', ')}`;
        for (const c of candidates) c.rejection ??= c.reason;
        reject('ambiguous_route', `Overlapping predicates from ${name}: ${eligible.map(c => c.id).join(', ')} are all eligible`, {candidates: eligible.map(c => c.id)});
    }

    const only = eligible[0];
    const offered = declared.map(d => d.route);
    let picked = resolver.resolve({from: name, output, hop, candidates: offered, eligible: offered.filter(r => eligible.some(e => e.id === r.id))}) ?? [];
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
    const input = {}, used = new Set();
    for (const [intake, source] of Object.entries(route.map)) { input[intake] = output[source]; used.add(source); }
    const discarded = Object.keys(compiled.networks[name].outputs).filter(k => !used.has(k));
    for (const c of candidates) { if (c.id === route.id) c.selected = true; else c.rejection = c.reason; }
    trace.push({...decision, to: route.to, route: route.id, map: route.map, mapped: input, discarded, passed: true});
    return {to: route.to, input};
}
