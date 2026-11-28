import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {load,run} from '../runtime.mjs';

function network(t,op){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ic3o-numeric-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const part of ['pep','context','contract'])fs.mkdirSync(path.join(dir,part));
 fs.writeFileSync(path.join(dir,'context','check.context'),'Numerical inputs\nFields\n    a: First integer\n    b: Second integer\n    result: Result\n');
 fs.writeFileSync(path.join(dir,'contract','check.contract'),'Numerical result\nGuarantee\n    result = result\n');
 const file=path.join(dir,'pep','check.pep');
 fs.writeFileSync(file,'Numerical check\nUse\n    numerical\nIntake\n    a: integer\n    b: integer\nCapability\n    result = numerical:'+op+'.capability(a, b)\nOuttake\n    result: integer\n');
 return load(file);
}
test('addition is exact and rejects overflow',t=>{
 const n=network(t,'add');
 assert.equal(run(n,{a:7,b:-3}).output.result,4);
 assert.equal(run(n,{a:Number.MAX_SAFE_INTEGER,b:0}).output.result,Number.MAX_SAFE_INTEGER);
 assert.throws(()=>run(n,{a:Number.MAX_SAFE_INTEGER,b:1}),/Integer overflow/);
 assert.throws(()=>run(n,{a:Number.MIN_SAFE_INTEGER,b:-1}),/Integer overflow/);
 assert.throws(()=>run(n,{a:0.5,b:1}),/expected integer/);
});
test('floor division rounds toward negative infinity',t=>{
 const n=network(t,'floor-divide');
 for(const [a,b,expected] of [[7,3,2],[-7,3,-3],[7,-3,-3],[-7,-3,2],[0,3,0],[6,3,2],[Number.MAX_SAFE_INTEGER,1,Number.MAX_SAFE_INTEGER]])assert.equal(run(n,{a,b}).output.result,expected);
 assert.throws(()=>run(n,{a:1,b:0}),/Division by zero/);
});
