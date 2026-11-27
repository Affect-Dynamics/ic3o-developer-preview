import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {scaffold,contributor} from '../tools/contributor.mjs';
import {load,fixtures} from '../runtime.mjs';
test('scaffold produces executable native app and fixtures without overwriting',t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ic3o-app-'));
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const root=scaffold(dir,'expense-tracker');
    const n=load(path.join(root,'pep','expense-tracker.pep'));
    assert.equal(fixtures(n).length,2);
    assert.ok(fixtures(n).every(f=>f.pass));
    assert.throws(()=>scaffold(dir,'expense-tracker'),/EEXIST/);
    assert.throws(()=>scaffold(dir,'../escape'),/portable/);
});
test('GitHub actions use official CLI and explicit repository visibility',()=>{
    const calls=[],exec=(...args)=>calls.push(args);
    contributor(['login'],{exec});
    contributor(['whoami'],{exec});
    contributor(['contribute'],{exec});
    contributor(['report'],{exec});
    assert.throws(()=>contributor(['repo','app'],{exec}),/Use login/);
    contributor(['repo','app','--private'],{exec});
    assert.equal(calls.length,5);
    assert.deepEqual(calls[0],['gh',['auth','login','--hostname','github.com','--web']]);
    assert.ok(calls[2][1].includes('Affect-Dynamics/ic3o-developer-preview'));
    assert.ok(calls[4][1].includes('--private'));
});
test('registry search reads installed native definitions',()=>{
    const output=[];
    contributor(['registry','search','multiply'],{print:s=>output.push(s)});
    assert.ok(output.some(s=>s.startsWith('multiply.capability')));
});
