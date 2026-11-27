import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {load,run,inspect,fixtures,defaultFile} from '../runtime.mjs';

function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ilk-layout-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir}
function put(root,file,content){const dest=path.join(root,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);return dest}
const input={requested:8,available:5,unit_price:250};
const simple=(refs='',call='minimum.capability')=>`Allocation\n\nIntake\n    requested: integer\n    available: integer\n\n${refs}Capability\n    allocation = ${call}(requested, available)\n\nOuttake\n    allocation: integer\n`;
const context='Stock\n\nFields\n    available: Available stock\n';
const contract='Allocation\n\nRequire\n    requested >= 0\n    available >= 0\n\nGuarantee\n    allocation = min(requested, available)\n';

test('matching primitive defaults and explicit child context reuse',()=>{const n=inspect(load());assert.deepEqual(n.contexts.map(x=>[x.ref,x.resolution]),[['order.context','default']]);assert.deepEqual(n.contracts.map(x=>[x.ref,x.resolution]),[['order.contract','default']]);assert.deepEqual(n.steps[0].child.contexts.map(x=>[x.ref,x.resolution]),[['order.context','explicit'],['allocation.context','explicit']]);assert.deepEqual(n.steps[0].child.contracts.map(x=>[x.ref,x.resolution]),[['allocation.contract','default']]);});
test('project directory selects matching entry PEP',()=>{assert.equal(load(path.dirname(path.dirname(defaultFile))).file,defaultFile)});
test('missing default contract fails closed',t=>{const root=temp(t);const file=put(root,'pep/stock.pep',simple());put(root,'context/stock.context',context);assert.throws(()=>load(file),/Missing contract:.*stock\.contract/)});
test('missing default context is diagnosed',t=>{const root=temp(t);const file=put(root,'pep/stock.pep',simple());assert.throws(()=>load(file),/Missing context:.*stock\.context/)});
test('explicit definitions override defaults, and multiple contracts are enforced',t=>{const root=temp(t);const file=put(root,'pep/stock.pep',simple('Context\n    other.context\n\nContract\n    other.contract\n    limit.contract\n\n'));put(root,'context/other.context',context);put(root,'context/stock.context','NOT USED\n');put(root,'contract/stock.contract','Default\n\nRequire\n    requested = 0\n');put(root,'contract/other.contract',contract);put(root,'contract/limit.contract','Limit\n\nRequire\n    available <= 10\n');const n=load(file);assert.equal(run(n,input).output.allocation,5);assert.throws(()=>run(n,{requested:8,available:11}),/available <= 10/);assert.deepEqual(n.contracts.map(x=>x.ref),['other.contract','limit.contract']);});
test('custom structure with nested PEP and local capability references',t=>{const root=temp(t);const parent=put(root,'workflow/entry.pep',simple('Context\n    ../data/stock.context\n\nContract\n    ../rules/bounded.contract\n\n','./steps/compute.pep'));put(root,'workflow/steps/compute.pep',simple('Context\n    ../../data/stock.context\n\nContract\n    ../../rules/bounded.contract\n\n','../../operations/min.capability'));put(root,'data/stock.context',context);put(root,'rules/bounded.contract',contract);put(root,'operations/min.capability','Minimum\n\nIntake\n    a: integer\n    b: integer\n\nImplementation\n    native: minimum\n\nOuttake\n    result: integer\n');const n=load(parent);assert.equal(run(n,input).output.allocation,5);assert.ok(n.steps[0].child);const fixture=put(root,'checks/sample.json',JSON.stringify([{name:'sample',input:{requested:8,available:5},expected:{allocation:5}}]));assert.ok(fixtures(n,fixture)[0].pass);});
test('empty explicit contract section is rejected rather than bypassed',t=>{const root=temp(t);const file=put(root,'pep/stock.pep',simple('Contract\n\n'));put(root,'context/stock.context',context);assert.throws(()=>load(file),/Empty Contract section/)});
test('explicit PEP paths cannot evade cycle detection',t=>{const root=temp(t);const file=put(root,'pep/stock.pep',simple('','./../pep/stock.pep'));put(root,'context/stock.context',context);put(root,'contract/stock.contract',contract);assert.throws(()=>load(file),/Recursive reference/)});
