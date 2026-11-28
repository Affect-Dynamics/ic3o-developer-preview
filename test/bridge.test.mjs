import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {compile,loadRoutes,traverse,BridgeError,deterministicResolver} from '../experiments/bridge/bridge.mjs';
const demo=path.join(path.dirname(fileURLToPath(import.meta.url)),'../experiments/bridge/routes.json');
const thrown=(fn,code)=>{try{fn()}catch(e){assert.ok(e instanceof BridgeError,e.stack);assert.equal(e.code,code,e.message);return e}assert.fail('expected '+code)};

// Scratch networks: every PEP takes `n: integer` and returns `r: integer` unless overridden.
function workspace(t){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'ic3o-bridge-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const write=(f,c)=>{const p=path.join(root,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c)};
    const net=(name,{intake='n: integer',outtake='r: integer',capability='r = minimum.capability(n, n)',guarantee=''}={})=>{
        write(`pep/${name}.pep`,`${name}\n\nIntake\n    ${intake}\n\nCapability\n    ${capability}\n\nOuttake\n    ${outtake}\n`);
        write(`context/${name}.context`,`${name} context\n`);
        write(`contract/${name}.contract`,`${name} contract\n${guarantee}`);
    };
    write('capability/notify.capability','Notify\n\nIntake\n    value: integer\n\nImplementation\n    native: deliver\n    effect: true\n\nOuttake\n    sent: integer\n');
    write('capability/hash.capability','Hash\n\nIntake\n    value: text\n\nImplementation\n    native: sha256\n\nOuttake\n    result: text\n');
    const table=o=>({entry:'a',terminals:['c'],networks:Object.fromEntries(['a','b','c','d','inner'].filter(k=>fs.existsSync(path.join(root,`pep/${k}.pep`))).map(k=>[k,`pep/${k}.pep`])),routes:[],...o});
    return {root,write,net,table};
}
const chain=t=>{const w=workspace(t);for(const n of ['a','b','c'])w.net(n);return w};
const hop=(from,to,id=`${from}-${to}`,map={n:'r'})=>({id,from,to,map});
const abc=[hop('a','b'),hop('b','c')];

test('composes the demo chain and completes at the terminal',()=>{
    const result=traverse(loadRoutes(demo),{requested:8,available:5,unit_price:250});
    assert.equal(result.network,'invoice');assert.equal(result.hops,3);assert.deepEqual(result.output,{due:1250});
    assert.deepEqual(result.trace.map(x=>x.kind),['Hop','Bridge','Hop','Bridge','Hop','Terminal']);
});
test('the trace preserves each native trace beside the bridge decisions',()=>{
    const {trace}=traverse(loadRoutes(demo),{requested:8,available:5,unit_price:250});
    const hops=trace.filter(x=>x.kind==='Hop');
    assert.equal(hops.length,3);
    for(const h of hops){assert.ok(h.nativeTrace.length>0);assert.ok(h.nativeTrace.some(x=>x.kind==='Guarantee'&&x.passed))}
    const bridge=trace.find(x=>x.kind==='Bridge');
    assert.deepEqual(bridge.candidates,['allocate-to-price']);assert.deepEqual(bridge.mapped,{quantity:5,unit_price:250});
});
test('unmapped source outputs are discarded and recorded',()=>{
    const bridge=traverse(loadRoutes(demo),{requested:8,available:5,unit_price:250}).trace.find(x=>x.kind==='Bridge');
    assert.deepEqual(bridge.discarded,['requested']);
});
test('a single terminal network completes with no routes',t=>{
    const w=workspace(t);w.net('c');
    const r=traverse(compile(w.table({entry:'c'}),w.root),{n:4});
    assert.equal(r.hops,1);assert.deepEqual(r.output,{r:4});assert.equal(r.trace.at(-1).kind,'Terminal');
});
test('a failing network guarantee stops traversal and keeps the trace',t=>{
    const w=workspace(t);w.net('a');w.net('b',{guarantee:'\nGuarantee\n    r < 0\n'});w.net('c');
    const e=thrown(()=>traverse(compile(w.table({routes:abc}),w.root),{n:2}),'network_failed');
    assert.deepEqual(e.trace.map(x=>x.kind+':'+(x.network??x.from)),['Hop:a','Bridge:a','Hop:b']);
    assert.equal(e.trace.at(-1).passed,false);assert.ok(e.trace.at(-1).nativeTrace.length>0);
});
test('missing route from a reachable non-terminal network is rejected before execution',t=>{
    const w=chain(t);
    thrown(()=>compile(w.table({routes:[hop('a','b')]}),w.root),'missing_route');
});
test('missing route at runtime is rejected when a resolver returns nothing',t=>{
    const w=chain(t);const compiled=compile(w.table({routes:abc}),w.root);
    const e=thrown(()=>traverse(compiled,{n:1},{resolver:{resolve:()=>[]}}),'missing_route');
    assert.equal(e.trace.at(-1).error,'no route');
});
test('ambiguous routes are rejected in the table and at runtime',t=>{
    const w=chain(t);
    const e=thrown(()=>compile(w.table({routes:[hop('a','b'),hop('a','c'),hop('b','c')]}),w.root),'ambiguous_route');
    assert.deepEqual(e.candidates.sort(),['a-b','a-c']);
    const compiled=compile(w.table({routes:abc}),w.root);
    thrown(()=>traverse(compiled,{n:1},{resolver:{resolve:({from})=>from==='a'?[hop('a','b'),hop('a','c')]:[]}}),'ambiguous_route');
});
test('incompatible types are rejected before execution',t=>{
    const w=workspace(t);w.net('a');w.net('b',{intake:'s: text',capability:'r = hash.capability(s)',outtake:'r: text'});w.net('c');
    const e=thrown(()=>compile(w.table({routes:[hop('a','b',undefined,{s:'r'}),hop('b','c',undefined,{n:'r'})]}),w.root),'incompatible_type');
    assert.match(e.message,/integer but b\.s requires text/);
});
test('unknown fields are rejected',t=>{
    const w=chain(t);
    thrown(()=>compile(w.table({routes:[hop('a','b',undefined,{n:'missing'}),hop('b','c')]}),w.root),'unknown_field');
    thrown(()=>compile(w.table({routes:[hop('a','b',undefined,{x:'r'}),hop('b','c')]}),w.root),'unknown_field');
});
test('incomplete mappings are rejected before execution',t=>{
    const w=workspace(t);w.net('a');w.net('b',{intake:'n: integer\n    m: integer',capability:'r = minimum.capability(n, m)'});w.net('c');
    const e=thrown(()=>compile(w.table({routes:abc}),w.root),'incomplete_mapping');
    assert.deepEqual(e.missing,['m']);
});
test('cycles are rejected before execution',t=>{
    const w=chain(t);
    const e=thrown(()=>compile(w.table({routes:[hop('a','b'),hop('b','a')]}),w.root),'cycle');
    assert.deepEqual(e.cycle,['a','b','a']);
});
test('a revisited network is caught at runtime even if the table is acyclic',t=>{
    const w=chain(t);const compiled=compile(w.table({routes:abc}),w.root);
    const resolver={resolve:({from})=>from==='b'?[hop('b','a')]:deterministicResolver(compiled).resolve({from})};
    const e=thrown(()=>traverse(compiled,{n:1},{resolver}),'cycle');assert.equal(e.network,'a');assert.ok(e.trace.length>0);
});
test('the hop limit is independent of cycle detection',t=>{
    const w=chain(t);const compiled=compile(w.table({routes:abc}),w.root);
    const loop={resolve:({from})=>from==='b'?[hop('b','a')]:deterministicResolver(compiled).resolve({from})};
    const e=thrown(()=>traverse(compiled,{n:1},{resolver:loop,detectCycles:false,maxHops:5}),'hop_limit');
    assert.equal(e.hop,6);assert.equal(e.trace.filter(x=>x.kind==='Hop').length,5);
    thrown(()=>traverse(compiled,{n:1},{maxHops:2}),'hop_limit');
});
test('a route path longer than the limit is rejected before execution',t=>{
    const w=chain(t);
    thrown(()=>compile(w.table({routes:abc}),w.root,{maxHops:2}),'hop_limit');
    compile(w.table({routes:abc}),w.root,{maxHops:3});
});
test('the resolver result is revalidated, so a replacement resolver cannot bypass checks',t=>{
    const w=chain(t);const compiled=compile(w.table({routes:abc}),w.root);
    thrown(()=>traverse(compiled,{n:1},{resolver:{resolve:()=>[hop('a','b',undefined,{n:'nope'})]}}),'unknown_field');
    thrown(()=>traverse(compiled,{n:1},{resolver:{resolve:()=>[hop('b','c')]}}),'invalid_route');
    thrown(()=>traverse(compiled,{n:1},{resolver:{resolve:()=>[hop('a','zzz')]}}),'unknown_network');
});
test('terminal networks must not have outgoing routes',t=>{
    const w=chain(t);
    thrown(()=>compile(w.table({routes:[...abc,hop('c','a')]}),w.root),'terminal_has_route');
    const compiled=compile(w.table({routes:abc}),w.root);
    thrown(()=>traverse(compiled,{n:1},{resolver:{resolve:({from})=>from==='c'?[hop('c','a')]:deterministicResolver(compiled).resolve({from})}}),'terminal_has_route');
});
test('effects are prohibited, including in nested PEPs',t=>{
    const w=workspace(t);w.net('b');w.net('c');
    w.net('a',{capability:'r = minimum.capability(n, n)\n    sent = notify.capability(r)'});
    const e=thrown(()=>compile(w.table({routes:abc}),w.root),'effect_prohibited');
    assert.deepEqual(e.effects,['a/sent']);
    const n=workspace(t);n.net('b');n.net('c');
    n.net('inner',{capability:'r = minimum.capability(n, n)\n    sent = notify.capability(r)'});
    n.net('a',{capability:'r = inner.pep(n)'});
    assert.deepEqual(thrown(()=>compile(n.table({routes:abc}),n.root),'effect_prohibited').effects,['a/r/sent']);
});
test('table errors are reported before any network runs',t=>{
    const w=chain(t);
    thrown(()=>compile({...w.table({}),entry:'zzz'},w.root),'unknown_network');
    thrown(()=>compile({...w.table({}),terminals:[]},w.root),'invalid_table');
    thrown(()=>compile(w.table({routes:[hop('a','b'),hop('a','b')]}),w.root),'duplicate_route');
    thrown(()=>compile(w.table({routes:[{id:'x',from:'a',to:'b'}]}),w.root),'invalid_table');
});
test('the bridge layer consumes only the public runtime API',()=>{
    const src=fs.readFileSync(fileURLToPath(new URL('../experiments/bridge/bridge.mjs',import.meta.url)),'utf8');
    assert.match(src,/import \{load, run\} from '\.\.\/\.\.\/runtime\.mjs'/);assert.doesNotMatch(src,/writeFileSync|eval\(|new Function/);
});

