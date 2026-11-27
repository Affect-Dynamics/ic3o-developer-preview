import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {manager} from '../tools/sync.mjs';
function setup(t){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'ic3o-sync-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const source=path.join(root,'source');fs.mkdirSync(source);
    const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
    for(const dir of ['registry','mode']){fs.mkdirSync(path.join(source,dir));fs.writeFileSync(path.join(source,dir,'fixture'),'fixture');}
    const commit=text=>{fs.writeFileSync(path.join(source,'cli.mjs'),text);git('add','.');git('commit','-m',text);return git('rev-parse','HEAD');};
    const first=commit('first');
    let reject=false;
    const cache=path.join(root,'cache');
    const m=manager(cache,{source,verify:()=>{if(reject)throw Error('verification failed');}});
    return {m,first,commit,cache,reject:()=>{reject=true;}};
}
test('check fetches without activation; sync pins and rollback restores',t=>{
    const {m,first,commit}=setup(t);
    assert.equal(m.check().available,first);assert.equal(m.status().active,null);
    assert.equal(m.sync().active,first);
    const second=commit('second');assert.equal(m.sync().active,second);
    assert.equal(m.rollback().active,first);
});
test('failed candidate verification leaves active revision unchanged',t=>{
    const {m,first,commit,reject}=setup(t);
    m.sync();commit('second');reject();
    assert.throws(()=>m.sync(),/verification failed/);
    assert.equal(m.status().active,first);
});
test('modified tracked snapshot fails closed',t=>{
    const {m,first,cache}=setup(t);m.sync();
    fs.writeFileSync(path.join(cache,'snapshots',first,'cli.mjs'),'modified');
    assert.throws(()=>m.sync(),/Snapshot changed/);
});
test('concurrent update is rejected',t=>{
    const {m,cache}=setup(t);fs.mkdirSync(path.join(cache,'lock'));
    assert.throws(()=>m.sync(),/already running/);
});
