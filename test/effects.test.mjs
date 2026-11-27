import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {load,run,inspect} from '../runtime.mjs';
function project(t,{pep,contract}){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'ic3o-effects-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const files={
        'pep/app.pep':pep,
        'context/app.context':'App\nFields\n    x: value\n',
        'contract/app.contract':contract,
        'capability/subtract.capability':'subtract\n\nIntake\n    a: integer\n    b: integer\n\nImplementation\n    native: subtract\n\nOuttake\n    result: integer\n',
        'capability/add.capability':'add\n\nIntake\n    a: integer\n    b: integer\n\nImplementation\n    native: subtract\n\nOuttake\n    result: integer\n',
        'capability/notify.capability':'Notify\n\nIntake\n    value: integer\n\nImplementation\n    native: deliver\n    effect: true\n\nOuttake\n    sent: integer\n'
    };
    for(const [f,c] of Object.entries(files)){const p=path.join(root,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c)}
    return path.join(root,'pep/app.pep');
}
const pep=`App
Intake
    x: integer
Capability
    low = subtract.capability(x, x)
    down = subtract.capability(low, x)
    final = subtract.capability(x, down)
    sent = notify.capability(final)
Outtake
    final: integer
`;
const contract='App\nRequire\n    x >= 0\nGuarantee\n    final >= 0\n';
test('transient dip below a guarantee does not fail; only the settled state is checked',t=>{
    const file=project(t,{pep,contract});const sent=[];
    const r=run(load(file),{x:3},[],'app',[],{deliver:e=>{sent.push(e.args.value);return e.args.value}});
    assert.equal(r.output.final,6);assert.deepEqual(sent,[6]);
});
test('effects run after Guarantee and are traced as Effect',t=>{
    const file=project(t,{pep,contract});const order=[];
    const r=run(load(file),{x:3},[],'app',[],{deliver:()=>{order.push('deliver');return 1}});
    const kinds=r.trace.map(x=>x.kind);
    assert.ok(kinds.indexOf('Guarantee')<kinds.indexOf('Effect'));assert.deepEqual(order,['deliver']);
});
test('a failed Guarantee delivers nothing',t=>{
    const file=project(t,{pep,contract:'App\nRequire\n    x >= 0\nGuarantee\n    final < 0\n'});let calls=0;
    assert.throws(()=>run(load(file),{x:3},[],'app',[],{deliver:()=>{calls++;return 1}}),/Guarantee failed/);
    assert.equal(calls,0);
});
test('effects fail closed without a host delivery binding',t=>{
    const file=project(t,{pep,contract});
    assert.throws(()=>run(load(file),{x:3}),/Delivery execution binding required/);
});
test('effect output cannot be consumed or exposed',t=>{
    assert.throws(()=>load(project(t,{pep:pep.replace('Outtake\n    final: integer','Outtake\n    final: integer\n    sent: integer'),contract})),/Effect output cannot be an Outtake/);
    assert.throws(()=>load(project(t,{pep:pep.replace('    sent = notify.capability(final)','    sent = notify.capability(final)\n    again = subtract.capability(sent, final)'),contract})),/Effect output cannot be consumed/);
});
test('legacy routing syntax is rejected with guidance and inspect marks effects',t=>{
    assert.throws(()=>load(project(t,{pep:pep+'    final -> response\n',contract})),/Routing was removed/);
    assert.equal(inspect(load(project(t,{pep,contract}))).steps.find(s=>s.id==='sent').effect,true);
});
