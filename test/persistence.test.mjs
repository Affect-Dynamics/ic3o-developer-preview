import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {run} from '../runtime.mjs';
import {Store} from '../mode/storage/store.mjs';
import {runPersisted} from '../mode/storage/execute.mjs';
import {Journal} from '../mode/provenance/journal.mjs';
import {types,plan,network} from '../projects/persisted-note/demo.mjs';
const input={id:'n1',body:'A durable note',approved:1};
const opts={scope:'notes.Note',authorize:()=>true};
const fixture=t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ic3o-persistence-'));
    const file=path.join(dir,'notes.db');
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    return file;
};
const count=(s,table)=>s.db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
function empty(s) {
    for(const table of ['entities','cells','revisions','execution_evidence'])
        assert.equal(count(s,table),0,table);
}
test('persisted PEP commits data, revisions and evidence across restart',t=>{
    const file=fixture(t);
    let s=new Store(types,file),checkpoint;
    try {const result=runPersisted(network(),input,s,opts);checkpoint=result.checkpoint;assert.equal(result.output.saved,input.body);}
    finally{s.close();}
    s=new Store(types,file);
    try {
        assert.equal(s.resolve(plan,{note_id:'n1'},()=>true).output.body,input.body);
        assert.equal(s.history(['notes.Note','n1','body'],()=>true)[0].value,input.body);
        assert.equal(count(s,'execution_evidence'),1);
    } finally{s.close();}
    const j=new Journal(file);
    try {assert.deepEqual(j.verify(checkpoint),checkpoint);}finally{j.close();}
});
test('late guarantee failure rolls back record, revisions and evidence',t=>{
    const s=new Store(types,fixture(t));
    try {
        assert.throws(()=>runPersisted(network(),{...input,approved:0},s,opts),/Guarantee failed/);
        empty(s);
    }finally{s.close();}
});
test('denied write has no durable effects',t=>{
    const s=new Store(types,fixture(t));
    try {assert.throws(()=>runPersisted(network(),input,s,{...opts,authorize:()=>false}),/denied/);empty(s);}
    finally{s.close();}
});
test('evidence insertion failure rolls back data and revisions',t=>{
    const s=new Store(types,fixture(t));
    try {
        runPersisted(network(),input,s,opts);
        s.db.exec("CREATE TRIGGER reject_evidence BEFORE INSERT ON execution_evidence BEGIN SELECT RAISE(ABORT,'evidence unavailable'); END");
        assert.throws(()=>runPersisted(network(),{...input,id:'n2'},s,opts),/evidence unavailable/);
        assert.equal(count(s,'entities'),1);
        assert.equal(count(s,'cells'),2);
        assert.equal(count(s,'revisions'),2);
        assert.equal(count(s,'execution_evidence'),1);
        assert.equal(s.exists.get('notes.Note','n2'),undefined);
    }finally{s.close();}
});
test('ordinary runtime fails closed without storage binding',()=>{
    assert.throws(()=>run(network(),input),/Storage execution binding required/);
});
test('missing provenance sidechain rolls back data',t=>{
    const s=new Store(types,fixture(t));
    try {const n=network();n.sidechains=[];assert.throws(()=>runPersisted(n,input,s,opts),/Mandatory root provenance/);empty(s);}
    finally{s.close();}
});
test('duplicate note rejects without damaging committed history',t=>{
    const s=new Store(types,fixture(t));
    try {
        runPersisted(network(),input,s,opts);
        assert.throws(()=>runPersisted(network(),{...input,body:'duplicate'},s,opts));
        assert.equal(s.resolve(plan,{note_id:'n1'},()=>true).output.body,input.body);
        assert.equal(count(s,'execution_evidence'),1);
        assert.equal(count(s,'revisions'),2);
    }finally{s.close();}
});
