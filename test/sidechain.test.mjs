import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {load,run,inspect} from '../runtime.mjs';
import {Journal,runJournaled} from '../mode/provenance/journal.mjs';
const demo=new URL('../projects/sidechain-demo/',import.meta.url);
const input={requested:8,available:5,unit_price:250};
const ref='provenance:provenance.pep';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ilk-sidechain-'));fs.cpSync(demo,dir,{recursive:true});t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('root sidechain inherited by child',()=>{const n=load(new URL('pep/sidechain-demo.pep',demo).pathname);const r=run(n,input);const e=r.trace.filter(x=>x.kind==='Sidechain');assert.equal(e.length,8);assert.equal(e.filter(x=>x.path.endsWith('/allocation')).length,4);assert.ok(e.every(x=>x.declaredAt===n.name));assert.deepEqual(r.output,{allocation:5,total:1250,remaining:0});assert.deepEqual(inspect(n).steps[0].child.sidechains,[ref]);});
test('child sidechain does not activate on parent',t=>{const dir=fixture(t),root=path.join(dir,'pep/sidechain-demo.pep'),child=path.join(dir,'pep/allocation.pep');fs.writeFileSync(root,fs.readFileSync(root,'utf8').replace('Sidechain\n    '+ref,''));fs.writeFileSync(child,fs.readFileSync(child,'utf8').replace('Intake','Sidechain\n    '+ref+'\n\nIntake'));const n=load(root),e=run(n,input).trace.filter(x=>x.kind==='Sidechain');assert.equal(e.length,4);assert.ok(e.every(x=>x.path.endsWith('/allocation')));assert.deepEqual(inspect(n).sidechains,[]);});
test('cycle and duplicate sidechains rejected',t=>{const dir=fixture(t),root=path.join(dir,'pep/sidechain-demo.pep'),text=fs.readFileSync(root,'utf8');fs.writeFileSync(root,text.replace(ref,'sidechain-demo.pep'));assert.throws(()=>load(root),/Recursive reference/);fs.writeFileSync(root,text.replace(ref,ref+'\n    '+ref));assert.throws(()=>load(root),/Duplicate sidechain/);});
test('journal survives reopen and records rejected execution',t=>{const dir=fixture(t),file=path.join(dir,'evidence.db'),n=load(path.join(dir,'pep/sidechain-demo.pep'));let j=new Journal(file);runJournaled(n,input,j);assert.throws(()=>runJournaled(n,{...input,requested:-1},j),/Require failed/);const checkpoint=j.verify();assert.equal(checkpoint.seq,2);j.close();j=new Journal(file);assert.deepEqual(j.verify(checkpoint),checkpoint);const row=j.db.prepare('SELECT payload FROM execution_evidence WHERE seq=2').get();assert.equal(JSON.parse(row.payload).status,'rejected');j.db.prepare('UPDATE execution_evidence SET payload=? WHERE seq=1').run('{}');assert.throws(()=>j.verify(checkpoint),/Invalid evidence chain/);j.close();});
