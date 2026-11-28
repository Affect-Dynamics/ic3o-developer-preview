import test from 'node:test';import assert from 'node:assert/strict';
import {traverse,BridgeError} from '../experiments/context-conditioning/index.mjs';
import {demo,IN,C,thrown,scratch} from './context-helpers.mjs';

const requires=(trace,network='price')=>trace.filter(x=>x.kind==='Contract'&&x.phase==='Require'&&x.network===network);

test('identical input passes Require under two contexts but fails Guarantee under one',t=>{
    const s=scratch(t);
    s.write('contract/price.contract','Price order contract\n\nRequire\n    quantity >= 0\n    unit_price >= 0\n\nGuarantee\n    total >= 1000\n');
    const c=s.build();
    const ok=traverse(c,IN,{context:C('retail','standard')});
    assert.ok(requires(ok.trace).length&&requires(ok.trace).every(x=>x.passed));
    const e=thrown(()=>traverse(c,IN,{context:C('internal','standard')}),'network_failed',BridgeError);
    assert.match(e.message,/Guarantee failed: total >= 1000/);
    assert.ok(requires(e.trace).length&&requires(e.trace).every(x=>x.passed));
    assert.ok(e.trace.some(x=>x.kind==='Contract'&&x.phase==='Guarantee'&&!x.passed));
    assert.ok(e.trace.some(x=>x.kind==='RawContext'),'the failed run keeps its context records');
});
test('Require outcomes are identical under every valid context',()=>{
    const c=demo();
    const outcome=ctx=>JSON.stringify(requires(traverse(c,IN,{context:ctx}).trace).map(x=>[x.rule,x.passed]));
    assert.equal(new Set([C('retail','standard'),C('retail','promo'),C('wholesale','standard'),C('wholesale','promo'),C('internal','standard')].map(outcome)).size,1);
});
test('invalid contractual data fails Require identically regardless of context',()=>{
    const c=demo();
    for(const ctx of [C('retail','standard'),C('internal','standard')]){
        const e=thrown(()=>traverse(c,{quantity:-1,unit_price:250},{context:ctx}),'network_failed',BridgeError);
        assert.match(e.message,/Require failed: quantity >= 0/);
    }
});
test('Guarantee may read a computational consequence of Context (a conditioned value)',t=>{
    const s=scratch(t);
    s.write('contract/price.contract','Price order contract\n\nRequire\n    quantity >= 0\n\nGuarantee\n    total <= 2000\n    handling >= 0\n');
    const e=s.build();
    assert.equal(traverse(e,IN,{context:C('retail','standard')}).trace.find(x=>x.kind==='Settled').output.total,2000);
});
test('a Guarantee that reads a conditioned value is allowed; one that reads a pure binding is rejected',t=>{
    const s=scratch(t);
    s.write('contract/price.contract','Price order contract\n\nGuarantee\n    ctx_coefficient > 0\n');
    thrown(()=>s.build(),'context_in_contract');
});
