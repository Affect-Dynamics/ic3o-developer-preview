import test from 'node:test';import assert from 'node:assert/strict';
import {traverse,BridgeError} from '../experiments/context-conditioning/index.mjs';
import {demo,IN,C,thrown,kinds,scratch} from './context-helpers.mjs';

test('identical contractual data and capabilities give different valid outputs under different contexts',()=>{
    const c=demo(),total=ctx=>traverse(c,IN,{context:ctx}).trace.find(x=>x.kind==='Settled').output.total;
    assert.equal(total(C('retail','standard')),2000);
    assert.equal(total(C('retail','promo')),1500);
    assert.equal(total(C('wholesale','standard')),1450);
    assert.equal(total(C('wholesale','promo')),950);
    assert.equal(total(C('internal','standard')),900);
});
test('the worked example: retail/standard derives coefficient 1 and settles at 2000',()=>{
    const r=traverse(demo(),IN,{context:C('retail','standard')});
    assert.equal(r.trace.find(x=>x.kind==='DerivedContext').derived.find(d=>d.name==='coefficient').value,1);
    assert.equal(r.trace.find(x=>x.kind==='Settled').output.total,2000);
});
test('multiple conditions feed a derived condition that feeds one invocation (chained derivation)',()=>{
    const r=traverse(demo(),IN,{context:C('wholesale','promo')});
    const d=r.trace.find(x=>x.kind==='DerivedContext'&&x.network==='price').derived;
    const tier=d.find(x=>x.name==='tier'),coef=d.find(x=>x.name==='coefficient');
    assert.deepEqual(tier.from,{channel:'wholesale',season:'promo'});assert.equal(tier.value,'trade');
    assert.deepEqual(coef.from,{tier:'trade'});assert.equal(coef.value,0.5);
    assert.ok(d.indexOf(tier)<d.indexOf(coef));
    const adjusted=r.trace.find(x=>x.kind==='Capability'&&x.path==='price/adjusted');
    assert.deepEqual(adjusted.args.map(a=>[a.from,a.source,a.value]),[['base','contractual',2000],['ctx_coefficient','context',0.5]]);
});
test('one context influences several capabilities, each observable in the result or trace',()=>{
    const r=traverse(demo(),IN,{context:C('wholesale','standard')});
    const ctxArgs=r.trace.filter(x=>x.kind==='Capability').flatMap(x=>x.args.filter(a=>a.source==='context').map(a=>`${x.network}/${x.path.split('/').pop()}:${a.from}`));
    assert.deepEqual(ctxArgs,['price/adjusted:ctx_coefficient','price/handling:ctx_handling_rate','price/total:ctx_rebate','invoice/due:ctx_deposit']);
    const settled=r.trace.find(x=>x.kind==='Settled');
    assert.equal(settled.output.handling,24);   // reported separately, not part of total
    assert.equal(settled.output.total,1450);    // adjusted 1500 minus rebate 50
    assert.equal(r.output.due,1250);            // second network: deposit 200
    assert.notEqual(traverse(demo(),IN,{context:C('retail','standard')}).trace.find(x=>x.kind==='Settled').output.handling,24);
});
test('conditioned settled output changes traversal; route table unchanged; resolver never sees Context',()=>{
    const c=demo(),before=JSON.stringify([...c.routes.values()].map(x=>x.definition));
    assert.deepEqual([C('retail','standard'),C('retail','promo')].map(x=>traverse(c,IN,{context:x}).path.join('>')),['price>approval','price>invoice']);
    assert.equal(JSON.stringify([...c.routes.values()].map(x=>x.definition)),before);
    const seen=[],resolver={resolve:a=>{seen.push(JSON.stringify(a));return a.eligible}};
    traverse(c,IN,{context:C('retail','standard'),resolver});
    assert.ok(seen.length&&seen.every(s=>!/channel|season|ctx_|coefficient|retail/.test(s)),seen.join('\n'));
});
test('the trace separates raw, derived, injected, contractual, capability, contract and bridge records',()=>{
    const r=traverse(demo(),IN,{context:C('retail','promo')});
    assert.deepEqual(kinds(r.trace).slice(0,4),['RawContext','DerivedContext','Injection','Contractual']);
    for(const k of ['Contract','Capability','Settled','Bridge','Hop','Terminal'])assert.ok(kinds(r.trace).includes(k),k);
    assert.deepEqual(r.trace.find(x=>x.kind==='Contractual').data,IN);
    assert.deepEqual(r.trace.find(x=>x.kind==='RawContext').values,C('retail','promo'));
    assert.equal(r.trace.find(x=>x.kind==='Injection').bindings.ctx_coefficient.condition,'coefficient');
    assert.ok(!JSON.stringify(r.trace.find(x=>x.kind==='Contractual')).includes('ctx_'));
    assert.ok(!r.trace.some(x=>x.kind==='Bridge'&&JSON.stringify(x).includes('ctx_')));
    assert.ok(r.trace.filter(x=>x.kind==='Contract').every(x=>['Require','Guarantee'].includes(x.phase)));
});
