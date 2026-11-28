import test from 'node:test';import assert from 'node:assert/strict';
import {traverse} from '../experiments/context-conditioning/index.mjs';
import {demo,IN,C,thrown,scratch} from './context-helpers.mjs';

const net=(name,intake,cap,outtake)=>`${name}\n\nIntake\n    ${intake.join('\n    ')}\n\nCapability\n    ${cap.join('\n    ')}\n\nOuttake\n    ${outtake.join('\n    ')}\n`;
const withPrice=(s,text)=>s.write('pep/price.pep',text);

test('caller-supplied contextual values are rejected and recorded',()=>{
    const e=thrown(()=>traverse(demo(),{...IN,ctx_coefficient:1},{context:C('retail','standard')}),'context_supplied');
    assert.ok(e.trace.some(x=>x.kind==='Boundary'&&!x.passed));
});
test('bridge maps cannot carry contextual values in either direction',t=>{
    const s=scratch(t);
    const a=s.table();a.routes[0].map={total:'total',ctx_deposit:'total'};
    thrown(()=>s.build(a),'context_bridged');
    const b=s.table();b.routes[0].map={total:'ctx_coefficient'};
    thrown(()=>s.build(b),'context_bridged');
});
test('a pure contextual value cannot be exposed through Outtake',t=>{
    const s=scratch(t);
    withPrice(s,net('Price order',['quantity: number','unit_price: number','ctx_coefficient: number','ctx_handling_rate: number','ctx_rebate: number'],
        ['base = scale.capability(quantity, unit_price)','adjusted = scale.capability(base, ctx_coefficient)','handling = scale.capability(quantity, ctx_handling_rate)','total = reduce.capability(adjusted, ctx_rebate)','leak = scale.capability(ctx_coefficient, ctx_rebate)'],
        ['total: number','handling: number','quantity: number','leak: number']));
    const e=thrown(()=>s.build(),'context_exposed');assert.equal(e.field,'leak');
});
test('an Outtake that names a ctx_ Intake directly is rejected',t=>{
    const s=scratch(t);
    withPrice(s,net('Price order',['quantity: number','unit_price: number','ctx_coefficient: number','ctx_handling_rate: number','ctx_rebate: number'],
        ['base = scale.capability(quantity, unit_price)','adjusted = scale.capability(base, ctx_coefficient)','handling = scale.capability(quantity, ctx_handling_rate)','total = reduce.capability(adjusted, ctx_rebate)'],
        ['total: number','handling: number','quantity: number','ctx_coefficient: number']));
    thrown(()=>s.build(),'context_exposed');
});
test('Require and Guarantee cannot read bindings, directly or via an indirect pure-contextual value',t=>{
    const s=scratch(t);
    withPrice(s,net('Price order',['quantity: number','unit_price: number','ctx_coefficient: number','ctx_handling_rate: number','ctx_rebate: number'],
        ['base = scale.capability(quantity, unit_price)','adjusted = scale.capability(base, ctx_coefficient)','handling = scale.capability(quantity, ctx_handling_rate)','total = reduce.capability(adjusted, ctx_rebate)','mix = scale.capability(ctx_coefficient, ctx_rebate)'],
        ['total: number','handling: number','quantity: number']));
    s.write('contract/price.contract','Price order contract\n\nRequire\n    mix >= 0\n');
    assert.equal(thrown(()=>s.build(),'context_in_contract').phase,'Require');
    s.write('contract/price.contract','Price order contract\n\nRequire\n    quantity >= 0\n\nGuarantee\n    ctx_rebate >= 0\n');
    assert.equal(thrown(()=>s.build(),'context_in_contract').phase,'Guarantee');
});
// A price network that delegates to a nested PEP `inner` whose Intake is (a, <second>).
function nested(s,{second,arg,outtake='total: number\n    handling: number\n    quantity: number',innerOut='result: number',innerRules=''}){
    s.write('pep/inner.pep',`Inner\n\nIntake\n    a: number\n    ${second}: number\n\nCapability\n    result = scale.capability(a, ${second})\n\nOuttake\n    ${innerOut}\n`);
    s.write('contract/inner.contract',`Inner contract\n\n${innerRules}`);s.write('context/inner.context','Inner context\n');
    withPrice(s,net('Price order',['quantity: number','unit_price: number','ctx_coefficient: number','ctx_handling_rate: number','ctx_rebate: number'],
        ['base = scale.capability(quantity, unit_price)','inner_result = inner.pep(base, '+arg+')','adjusted = scale.capability(base, ctx_coefficient)','handling = scale.capability(quantity, ctx_handling_rate)','total = reduce.capability(adjusted, ctx_rebate)'],
        outtake.split('\n    ')));
}
test('a pure contextual value cannot be passed to a non-contextual Intake of a nested PEP',t=>{
    const s=scratch(t);nested(s,{second:'b',arg:'ctx_coefficient'});
    const e=thrown(()=>s.build(),'namespace_violation');assert.match(e.message,/non-contextual Intake 'b'/);
});
test('contractual data cannot be passed into a reserved contextual Intake of a nested PEP',t=>{
    const s=scratch(t);nested(s,{second:'ctx_k',arg:'unit_price'});
    const e=thrown(()=>s.build(),'namespace_violation');assert.match(e.message,/reserved contextual Intake 'ctx_k'/);
});
test('a nested PEP that returns a pure contextual value is rejected through its own Outtake',t=>{
    const s=scratch(t);
    s.write('pep/inner.pep','Inner\n\nIntake\n    a: number\n    ctx_k: number\n\nCapability\n    result = scale.capability(ctx_k, ctx_k)\n\nOuttake\n    result: number\n');
    s.write('contract/inner.contract','Inner contract\n\n');s.write('context/inner.context','Inner context\n');
    withPrice(s,net('Price order',['quantity: number','unit_price: number','ctx_coefficient: number','ctx_handling_rate: number','ctx_rebate: number'],
        ['base = scale.capability(quantity, unit_price)','inner_result = inner.pep(base, ctx_coefficient)','adjusted = scale.capability(base, ctx_coefficient)','handling = scale.capability(quantity, ctx_handling_rate)','total = reduce.capability(adjusted, ctx_rebate)'],
        ['total: number','handling: number','quantity: number']));
    thrown(()=>s.build(),'context_exposed');
});
test('a nested PEP contract cannot read a binding',t=>{
    const s=scratch(t);
    s.write('pep/inner.pep','Inner\n\nIntake\n    a: number\n    ctx_k: number\n\nCapability\n    result = scale.capability(a, ctx_k)\n\nOuttake\n    result: number\n');
    s.write('contract/inner.contract','Inner contract\n\nGuarantee\n    ctx_k >= 0\n');s.write('context/inner.context','Inner context\n');
    withPrice(s,net('Price order',['quantity: number','unit_price: number','ctx_coefficient: number','ctx_handling_rate: number','ctx_rebate: number'],
        ['base = scale.capability(quantity, unit_price)','inner_result = inner.pep(base, ctx_coefficient)','adjusted = scale.capability(base, ctx_coefficient)','handling = scale.capability(quantity, ctx_handling_rate)','total = reduce.capability(adjusted, ctx_rebate)'],
        ['total: number','handling: number','quantity: number']));
    assert.equal(thrown(()=>s.build(),'context_in_contract').phase,'Guarantee');
});
test('a nested PEP that legitimately receives a binding runs, and its result is conditioned',t=>{
    const s=scratch(t);
    s.write('pep/inner.pep','Inner\n\nIntake\n    a: number\n    ctx_k: number\n\nCapability\n    result = scale.capability(a, ctx_k)\n\nOuttake\n    result: number\n');
    s.write('contract/inner.contract','Inner contract\n\n');s.write('context/inner.context','Inner context\n');
    withPrice(s,net('Price order',['quantity: number','unit_price: number','ctx_coefficient: number','ctx_handling_rate: number','ctx_rebate: number'],
        ['base = scale.capability(quantity, unit_price)','inner_result = inner.pep(base, ctx_coefficient)','adjusted = scale.capability(base, ctx_coefficient)','handling = scale.capability(quantity, ctx_handling_rate)','total = reduce.capability(adjusted, ctx_rebate)'],
        ['total: number','handling: number','quantity: number','inner_result: number']));
    s.write('contract/price.contract','Price order contract\n\nRequire\n    quantity >= 0\n');
    const r=traverse(s.build(),IN,{context:C('retail','promo')});
    assert.equal(r.trace.find(x=>x.kind==='Settled').output.inner_result,1500);
    const nestedCall=r.trace.find(x=>x.kind==='Capability'&&x.path.startsWith('price/inner_result/'));
    assert.deepEqual(nestedCall.args.map(a=>a.source),['contractual','context']);   // base = quantity * unit_price does not depend on Context
});
