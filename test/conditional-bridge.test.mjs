import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {compile,loadRoutes,traverse,parsePredicate,evaluate,BridgeError,deterministicResolver} from '../experiments/bridge-conditional/bridge.mjs';
const demo=path.join(path.dirname(fileURLToPath(import.meta.url)),'../experiments/bridge-conditional/routes.json');
const thrown=(fn,code)=>{try{fn()}catch(e){assert.ok(e instanceof BridgeError,e.stack);assert.equal(e.code,code,e.message);return e}assert.fail('expected '+code)};
const CASES={full:{requested:8,available:20,unit_price:250},partial:{requested:8,available:5,unit_price:250},none:{requested:8,available:0,unit_price:250}};

// Scratch networks: `a` takes n and returns r (=n) and n. b, c, d take n and return r and n.
function workspace(t){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'ic3o-cond-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const write=(f,c)=>{const p=path.join(root,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c)};
    const net=(name,{intake='n: integer',outtake='r: integer\n    n: integer',capability='r = minimum.capability(n, n)'}={})=>{
        write(`pep/${name}.pep`,`${name}\n\nIntake\n    ${intake}\n\nCapability\n    ${capability}\n\nOuttake\n    ${outtake}\n`);
        write(`context/${name}.context`,`${name} context\n`);write(`contract/${name}.contract`,`${name} contract\n`);
    };
    write('capability/notify.capability','Notify\n\nIntake\n    value: integer\n\nImplementation\n    native: deliver\n    effect: true\n\nOuttake\n    sent: integer\n');
    write('capability/hash.capability','Hash\n\nIntake\n    value: text\n\nImplementation\n    native: sha256\n\nOuttake\n    result: text\n');
    for(const n of ['a','b','c','d'])net(n);
    const table=o=>({entry:'a',terminals:['b','c'],networks:Object.fromEntries(['a','b','c','d'].map(k=>[k,`pep/${k}.pep`])),routes:[pos,neg],...o});
    return {root,write,net,table};
}
const r=(id,to,when,map={n:'r'})=>({id,from:'a',to,when,map});
const pos=r('pos','b','r > 0'),neg=r('neg','c','r <= 0');
const build=(t,o)=>{const w=workspace(t);return {w,compiled:compile(w.table(o),w.root)}};
const bridge=e=>e.trace.filter(x=>x.kind==='Bridge').at(-1);

test('each demo branch is selected by contractual data',()=>{
    const c=loadRoutes(demo),run=i=>traverse(c,i);
    assert.deepEqual(run(CASES.full).path,['allocate','full_allocation']);assert.deepEqual(run(CASES.full).output,{total:2000,quantity:8});
    assert.deepEqual(run(CASES.partial).path,['allocate','partial_allocation']);assert.deepEqual(run(CASES.partial).output,{total:1250,shortfall:3});
    assert.deepEqual(run(CASES.none).path,['allocate','unavailable_inventory']);assert.deepEqual(run(CASES.none).output,{backordered:8});
});
test('identical topology yields different paths for different data',()=>{
    const c=loadRoutes(demo);
    assert.equal(new Set(Object.values(CASES).map(i=>traverse(c,i).path.join('>'))).size,3);
});
test('the trace records every candidate, its evaluation, rejection reason and selection',()=>{
    const b=bridge({trace:traverse(loadRoutes(demo),CASES.partial).trace});
    assert.deepEqual(b.candidates.map(x=>x.id),['to-full','to-partial','to-unavailable']);
    assert.deepEqual(b.candidates.map(x=>x.eligible),[false,true,false]);
    assert.deepEqual(b.candidates.map(x=>x.selected===true),[false,true,false]);
    assert.equal(b.candidates[0].rejection,'predicate false');assert.ok(b.candidates.every(x=>x.when));
    assert.equal(b.route,'to-partial');assert.deepEqual(b.mapped,{quantity:5,requested:8,unit_price:250});
});
test('native traces and network guarantees are preserved on every hop',()=>{
    const hops=traverse(loadRoutes(demo),CASES.full).trace.filter(x=>x.kind==='Hop');
    assert.equal(hops.length,2);
    for(const h of hops){assert.ok(h.nativeTrace.length>0);assert.ok(h.nativeTrace.some(x=>x.kind==='Guarantee'&&x.passed))}
});
test('overlapping predicates are rejected at runtime with every overlap recorded',t=>{
    const {compiled}=build(t,{routes:[r('ge','b','r >= 0'),r('le','c','r <= 0')]});
    assert.equal(traverse(compiled,{n:3}).path.at(-1),'b');
    const e=thrown(()=>traverse(compiled,{n:0}),'ambiguous_route');
    assert.deepEqual(e.candidates,['ge','le']);
    assert.deepEqual(bridge(e).candidates.map(x=>x.rejection),['overlaps with le','overlaps with ge']);
    assert.equal(bridge(e).passed,false);
});
test('uncovered values are rejected with a reason for every candidate',t=>{
    const {compiled}=build(t,{routes:[r('big','b','r > 5'),r('small','c','r < 0')]});
    const e=thrown(()=>traverse(compiled,{n:2}),'no_eligible_route');
    assert.deepEqual(bridge(e).candidates.map(x=>x.rejection),['predicate false','predicate false']);
});
test('a failing network guarantee stops traversal before any predicate is evaluated',t=>{
    const w=workspace(t);w.write('contract/a.contract','a contract\n\nGuarantee\n    r < 0\n');
    assert.deepEqual(thrown(()=>traverse(compile(w.table(),w.root),{n:1}),'network_failed').trace.map(x=>x.kind),['Hop']);
});
test('invalid predicates are rejected before execution',t=>{
    const w=workspace(t);const bad=when=>compile(w.table({routes:[r('pos','b',when),neg]}),w.root);
    thrown(()=>bad('missing > 0'),'unknown_field');
    for(const when of ['n.r > 0','r + 1 > 0','r > "x"','r < true','1 = 1','r >','(r > 0','r > 0 r','r > 0 and','',undefined,7])thrown(()=>bad(when),'invalid_predicate');
});
test('the predicate language is pure comparison, boolean combination and grouping',()=>{
    const ok=s=>evaluate(parsePredicate(s,{r:'integer',n:'integer'}),{r:3,n:3});
    assert.equal(ok('r = 3 and n != 4'),true);assert.equal(ok('r < 3 or n >= 3'),true);
    assert.equal(ok('not (r = 3)'),false);assert.equal(ok('(r > 5 or r < 1) and n = 3'),false);
    assert.equal(ok('not r = 3 or n = 3'),true);
});
test('every candidate is validated before execution, even one that would never be eligible',t=>{
    const w=workspace(t);const bad=(o,code)=>thrown(()=>compile(w.table({routes:[pos,{...neg,...o}]}),w.root),code);
    bad({map:{n:'missing'}},'unknown_field');bad({map:{x:'r'}},'unknown_field');bad({map:{}},'incomplete_mapping');
    bad({to:'zzz'},'unknown_network');bad({id:'pos'},'duplicate_route');bad({map:'r'},'invalid_table');
    bad({when:'r > 1000000 and nope < 0'},'unknown_field');
});
test('incompatible types in a candidate mapping are rejected before execution',t=>{
    const w=workspace(t);w.net('c',{intake:'n: text',capability:'r = hash.capability(n)',outtake:'r: text'});
    thrown(()=>compile(w.table(),w.root),'incompatible_type');
});
test('a conditional route cannot start at a terminal and unreachable dead ends are rejected',t=>{
    const w=workspace(t);
    thrown(()=>compile(w.table({routes:[pos,neg,{...r('back','a','r > 0'),from:'b'}]}),w.root),'terminal_has_route');
    thrown(()=>compile(w.table({terminals:['c'],routes:[pos,neg]}),w.root),'missing_route');
});
test('cycles are rejected before execution and revisits at runtime',t=>{
    const w=workspace(t);const back={id:'back',from:'b',to:'a',when:'r > 0',map:{n:'r'}};
    thrown(()=>compile(w.table({terminals:['c'],routes:[pos,neg,back]}),w.root),'cycle');
});
test('the hop limit applies independently of cycle detection',t=>{
    const w=workspace(t);const c=compile(w.table({routes:[pos,neg]}),w.root);
    const loop={resolve:({candidates})=>candidates.filter(x=>x.id==='pos')};
    assert.equal(traverse(c,{n:1},{resolver:loop}).hops,2);
    thrown(()=>traverse(c,{n:1},{maxHops:1}),'hop_limit');
    thrown(()=>compile(w.table(),w.root,{maxHops:1}),'hop_limit');
});
test('the default resolver and a replacement that selects the eligible route both work',t=>{
    const {compiled}=build(t);
    assert.equal(traverse(compiled,{n:5},{resolver:deterministicResolver()}).path.at(-1),'b');
    const seen=[];const pick={resolve:i=>{seen.push(i);return i.eligible.map(x=>x.id)}};
    assert.equal(traverse(compiled,{n:-5},{resolver:pick}).path.at(-1),'c');
    assert.deepEqual(seen[0].candidates.map(x=>x.id),['pos','neg']);assert.deepEqual(seen[0].eligible.map(x=>x.id),['neg']);
});
test('a resolver may not invent a route',t=>{
    const {compiled}=build(t);
    const run=pick=>traverse(compiled,{n:5},{resolver:{resolve:()=>pick}});
    const e=thrown(()=>run([{id:'invented',from:'a',to:'c',when:'r > 0',map:{n:'r'}}]),'unauthorized_route');
    assert.equal(e.route,'invented');assert.equal(bridge(e).passed,false);
    thrown(()=>run('invented'),'unauthorized_route');
    thrown(()=>run(['pos','invented']),'unauthorized_route');
    const other=thrown(()=>run([{id:'pos',from:'a',to:'c',when:'r > 0',map:{n:'r'}}]),'unauthorized_route');
    assert.match(other.message,/modified definition/);
});
test('a resolver may not override eligibility, select nothing or select several',t=>{
    const {compiled}=build(t);
    const run=pick=>traverse(compiled,{n:5},{resolver:{resolve:()=>pick}});
    thrown(()=>run(['neg']),'ineligible_selection');
    thrown(()=>run([]),'no_selection');
    thrown(()=>run(undefined),'no_selection');
    thrown(()=>run(['pos','neg']),'ambiguous_route');
    const e=thrown(()=>run(['neg']),'ineligible_selection');
    assert.deepEqual(bridge(e).candidates.map(x=>x.rejection),['eligible but not selected','selected but predicate false']);
});
test('a resolver cannot rescue zero or multiple eligible routes',t=>{
    const {compiled}=build(t,{routes:[r('big','b','r > 5'),r('small','c','r < 0')]});
    const all={resolve:({candidates})=>candidates};
    thrown(()=>traverse(compiled,{n:2},{resolver:all}),'no_eligible_route');
    const both=build(t,{routes:[r('ge','b','r >= 0'),r('le','c','r <= 0')]}).compiled;
    thrown(()=>traverse(both,{n:0},{resolver:{resolve:()=>['ge']}}),'ambiguous_route');
});
test('a resolver cannot mutate the compiled table',t=>{
    const {compiled}=build(t);
    const evil={resolve:({candidates})=>{try{candidates[0].to='c'}catch{}try{candidates[0].map.n='n'}catch{}return candidates.filter(x=>x.id==='pos')}};
    assert.equal(traverse(compiled,{n:5},{resolver:evil}).path.at(-1),'b');
    assert.equal(compiled.routes.get('pos').route.to,'b');
});
test('effects remain prohibited, including in nested PEPs',t=>{
    const w=workspace(t);
    w.net('d',{capability:'r = minimum.capability(n, n)\n    sent = notify.capability(r)'});
    thrown(()=>compile(w.table(),w.root),'effect_prohibited');
    const n=workspace(t);n.net('inner',{outtake:'r: integer',capability:'r = minimum.capability(n, n)\n    sent = notify.capability(r)'});
    n.net('a',{capability:'r = inner.pep(n)'});
    assert.deepEqual(thrown(()=>compile(n.table(),n.root),'effect_prohibited').effects,['a/r/sent']);
});
test('Experiment 02B uses only the public runtime API and leaves the baseline intact',()=>{
    const src=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'../experiments/bridge-conditional/bridge.mjs'),'utf8');
    assert.match(src,/import \{load, run\} from '\.\.\/\.\.\/runtime\.mjs'/);assert.doesNotMatch(src,/eval\(|new Function|writeFileSync/);
});
