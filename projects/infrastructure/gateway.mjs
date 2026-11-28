import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {load, run, inspect} from '../../runtime.mjs';
import {Journal} from '../../mode/provenance/journal.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const admission = path.join(here, 'pep/admission.pep');
const types = {integer:Number.isSafeInteger,number:v=>typeof v==='number'&&Number.isFinite(v),text:v=>typeof v==='string',boolean:v=>typeof v==='boolean'};
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function exact(spec, data) {
  if (!object(data) || Object.keys(data).length !== Object.keys(spec).length) throw Error('Intake fields must match exactly');
  for (const [k,t] of Object.entries(spec)) if (!Object.hasOwn(data,k)||!types[t]?.(data[k])) throw Error(`Invalid Intake: ${k} (${t})`);
}
// Initial gateway intentionally accepts only read-only computations.
function audit(n, seen=new Set()) {
  if (seen.has(n)) return;
  seen.add(n);
  for(const s of n.steps) {
    if(s.effect || s.native==='storage_put_text') throw Error('Gateway prohibits effects and persistence writes');
    if(s.child) audit(s.child,seen);
  }
  for(const s of n.sidechains??[]) audit(s.network,seen);
}
export function openGateway({root,registry,grants,journalFile}) {
  root=fs.realpathSync(root);
  const entries=new Map();
  for(const [name,relative] of Object.entries(registry)) {
    if(typeof relative!=='string'||path.isAbsolute(relative)) throw Error('Registry requires relative paths');
    const file=fs.realpathSync(path.resolve(root,relative));
    const rel=path.relative(root,file);
    if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||path.extname(file)!=='.pep') throw Error('Invalid registry path');
    const network=load(file); audit(network); entries.set(name,network);
  }
  const policy=new Map(Object.entries(grants).map(([p,names])=>{if(!Array.isArray(names)||names.some(n=>!entries.has(n)))throw Error('Invalid grant');return [p,new Set(names)]}));
  const gate=load(admission);audit(gate);
  const journal=new Journal(journalFile);
  return {
    list(principal){return [...entries.keys()].filter(n=>policy.get(principal)?.has(n)).map(name=>({name,definition:inspect(entries.get(name))}));},
    execute({principal,network,input}) {
      const id=randomUUID(), trace=[]; let output, commitment, failure;
      try {
        if(typeof principal!=='string'||typeof network!=='string')throw Error('Invalid execution request');
        const request=JSON.stringify({principal,network,input});
        const allowed=entries.has(network)&&policy.get(principal)?.has(network);
        commitment=run(gate,{principal,authorized:allowed?1:0,request},trace,'Admission').output.commitment;
        const target=entries.get(network); exact(target.inputs,input);
        output=run(target,input,trace).output;
      }catch(error){failure=error;}
      const evidence=journal.append({id, timestamp:new Date().toISOString(),principal,network,commitment,status:failure?'rejected':'passed',trace,error:failure?.message});
      if(failure){failure.evidence=evidence;throw failure;}
      return {id,output,trace,evidence};
    },
    verify(checkpoint){return journal.verify(checkpoint)},
    close(){journal.close()}
  };
}
