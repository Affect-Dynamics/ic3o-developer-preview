import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadExperiment,compileExperiment,ContextError} from '../experiments/context-conditioning/index.mjs';
export const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'../experiments/context-conditioning');
export const demo=()=>loadExperiment(path.join(dir,'routes.json'),path.join(dir,'context.json'));
export const IN={quantity:8,unit_price:250};
export const C=(channel,season)=>({channel,season});
export const thrown=(fn,code,cls=ContextError)=>{try{fn()}catch(e){assert.ok(e instanceof cls,e.stack);assert.equal(e.code,code,e.message);return e}assert.fail('expected '+code)};
export const kinds=t=>t.map(x=>x.kind);
const json=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
// A scratch copy of the experiment's networks that tests may modify.
export function scratch(t){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'ic3o-ctx-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    fs.cpSync(path.join(dir,'networks'),path.join(root,'networks'),{recursive:true});
    const write=(f,c)=>{const p=path.join(root,'networks',f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c)};
    return {root,write,table:()=>json('routes.json'),def:()=>json('context.json'),build:(table=json('routes.json'),def=json('context.json'))=>compileExperiment(table,def,root)};
}
