import test from 'node:test';import assert from 'node:assert/strict';
import {traverse,compileContext,resolveContext,ContextError} from '../experiments/context-conditioning/index.mjs';
import {demo,IN,C,thrown,kinds,scratch} from './context-helpers.mjs';

const base=()=>({
    conditions:{a:{type:'text',domain:['x','y']},b:{type:'text',domain:['p','q']},n:{type:'integer',range:[0,10]}},
    derived:{d:{type:'number',from:['a','b'],table:{x:{p:1,q:2},y:{p:3,q:4}}}},
    bindings:{}
});
const edit=fn=>{const d=base();fn(d);return d};

test('a valid definition compiles with a topological derivation order',()=>{
    const c=compileContext(edit(d=>{d.derived.e={type:'number',from:['d'],table:{1:10,2:20,3:30,4:40}}}));
    assert.deepEqual(c.order,['d','e']);
});
test('circular derivations are rejected before execution',()=>{
    const d=edit(d=>{d.derived={u:{type:'text',from:['v'],table:{k:'k'}},v:{type:'text',from:['u'],table:{k:'k'}}}});
    assert.match(thrown(()=>compileContext(d),'circular_derivation').message,/u -> v -> u|v -> u -> v/);
    thrown(()=>compileContext(edit(d=>{d.derived={s:{type:'text',from:['s'],table:{k:'k'}}}})),'circular_derivation');
});
test('undeclared dependencies are rejected',()=>{
    thrown(()=>compileContext(edit(d=>{d.derived.d.from=['a','ghost']})),'undeclared_dependency');
    thrown(()=>compileContext(edit(d=>{d.bindings={net:{ctx_v:'ghost'}}})),'undeclared_dependency');
});
test('incompatible types are rejected',()=>{
    thrown(()=>compileContext(edit(d=>{d.derived.d.table.x.p='one'})),'incompatible_type');
    thrown(()=>compileContext(edit(d=>{d.conditions.a.domain=['x',2]})),'incompatible_type');
});
test('missing lookup entries are rejected with no silent default',()=>{
    const e=thrown(()=>compileContext(edit(d=>{delete d.derived.d.table.y.q})),'missing_entry');
    assert.match(e.message,/a=y, b=q/);
    thrown(()=>compileContext(edit(d=>{delete d.derived.d.table.y})),'missing_entry');
});
test('a missing entry is acceptable only where a constraint forbids the combination',()=>{
    const d=edit(d=>{delete d.derived.d.table.y.q;d.constraints=[{id:'c',require:'not (a = "y" and b = "q")'}]});
    assert.ok(compileContext(d));
});
test('table keys that are not possible values, and wrong nesting depth, are rejected',()=>{
    thrown(()=>compileContext(edit(d=>{d.derived.d.table.z={p:1,q:1}})),'invalid_table');
    thrown(()=>compileContext(edit(d=>{d.derived.d.table={x:1,y:2}})),'invalid_table');
});
test('malformed conditions and reserved names are rejected',()=>{
    thrown(()=>compileContext(edit(d=>{d.conditions.n.range=[5,1]})),'invalid_context');
    thrown(()=>compileContext(edit(d=>{d.conditions.ctx_bad={type:'text',domain:['x']}})),'invalid_context');
    thrown(()=>compileContext(edit(d=>{d.conditions.a.type='color'})),'invalid_context');
    thrown(()=>compileContext(edit(d=>{d.bindings={net:{plain:'a'}}})),'namespace_violation');
    thrown(()=>compileContext(edit(d=>{d.constraints=[{id:'c',require:'ghost > 1'}]})),'invalid_constraint');
});
test('resolution fails closed and records the failed evaluation',()=>{
    const c=compileContext(edit(d=>{d.bindings={net:{ctx_v:'d'}}}));
    const ok={a:'x',b:'p',n:3};
    const cases=[['missing_condition',{a:'x',b:'p'}],['undeclared_condition',{...ok,extra:1}],['invalid_condition',{...ok,n:'3'}],
        ['invalid_condition',{...ok,n:1.5}],['out_of_domain',{...ok,a:'z'}],['out_of_domain',{...ok,n:11}],['missing_context',null]];
    for(const [code,raw] of cases){
        const e=thrown(()=>resolveContext(c,raw,'net'),code);
        assert.equal(e.records[0].kind,'RawContext');assert.equal(e.records[0].passed,false);assert.ok(e.records[0].error);
    }
    assert.equal(resolveContext(c,ok,'net').injected.ctx_v,1);
});
test('a constraint violation is recorded with the failing constraint',()=>{
    const c=compileContext(edit(d=>{d.constraints=[{id:'no-yq',require:'not (a = "y" and b = "q")'}];d.bindings={net:{ctx_v:'d'}}}));
    const e=thrown(()=>resolveContext(c,{a:'y',b:'q',n:1},'net'),'constraint_violated');
    assert.deepEqual(e.constraints,['no-yq']);assert.deepEqual(e.records[0].constraints,[{id:'no-yq',require:'not (a = "y" and b = "q")',passed:false}]);
});
test('missing active context, forbidden combinations and bad values fail traversal with trace',()=>{
    const c=demo();
    for(const [code,ctx] of [['missing_context',undefined],['constraint_violated',C('internal','promo')],['out_of_domain',C('gold','standard')],['missing_condition',{channel:'retail'}]]){
        const e=thrown(()=>traverse(c,IN,{context:ctx}),code);
        assert.equal(kinds(e.trace)[0],'RawContext');assert.equal(e.trace.find(x=>x.kind==='RawContext').passed,false);
        assert.ok(!e.trace.some(x=>x.kind==='Capability'),'nothing executes after a failed context');
    }
});
test('binding checks: unbound, wrongly typed and unknown bindings are rejected at compile time',t=>{
    const s=scratch(t);
    const d1=s.def();delete d1.bindings.price.ctx_rebate;
    thrown(()=>s.build(undefined,d1),'unbound_context');
    const d2=s.def();d2.bindings.price.ctx_rebate='channel';
    thrown(()=>s.build(undefined,d2),'incompatible_type');
    const d3=s.def();d3.bindings.price.ctx_extra='rebate';
    thrown(()=>s.build(undefined,d3),'unknown_binding');
    const d4=s.def();d4.bindings.nowhere={ctx_x:'rebate'};
    thrown(()=>s.build(undefined,d4),'unknown_binding');
});
test('sidechains are prohibited because their events commit to injected bindings',t=>{
    const s=scratch(t);
    const price=s.table().networks.price;
    s.write('pep/price.pep',`Price order\n\nUse\n    provenance\n\nSidechain\n    provenance:provenance.pep\n\nIntake\n    quantity: number\n    unit_price: number\n    ctx_coefficient: number\n    ctx_handling_rate: number\n    ctx_rebate: number\n\nCapability\n    base = scale.capability(quantity, unit_price)\n    adjusted = scale.capability(base, ctx_coefficient)\n    handling = scale.capability(quantity, ctx_handling_rate)\n    total = reduce.capability(adjusted, ctx_rebate)\n\nOuttake\n    total: number\n    handling: number\n    quantity: number\n`);
    assert.ok(price);
    thrown(()=>s.build(),'sidechain_prohibited');
});
