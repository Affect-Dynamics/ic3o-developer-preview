import fs from 'node:fs';
import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
import {modeCatalog} from './modes.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url));
export const defaultFile=path.join(base,'projects/order/pep/order.pep');
const registry=path.join(base,'registry','capability');
const sections=new Set(['Intake','Context','Contract','Capability','Outtake','Fields','Require','Guarantee','Implementation','Use','Frontend','Expose','State','Sidechain']);
function fail(message){throw new Error(message)}
export function parse(file){
 const lines=fs.readFileSync(file,'utf8').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const name=lines.shift(); if(!name)fail(`Empty file: ${file}`);
 const result={name,file}; let section;
 for(const line of lines){if(sections.has(line)){if(result[line])fail(`Duplicate section ${line}`);section=line;result[line]=[]}else{if(!section)fail(`Unexpected line ${line}`);result[section].push(line)}}
 return result;
}
const ident='[A-Za-z_][A-Za-z0-9_]*';
function fields(lines=[],skipSource=false){const out={};for(const line of lines){if(skipSource&&line.startsWith('source:'))continue;const m=line.match(/^([a-zA-Z_]\w*):\s*(integer|number|text|boolean)$/);if(!m)fail(`Invalid field: ${line}`);if(Object.hasOwn(out,m[1]))fail(`Duplicate field: ${m[1]}`);out[m[1]]=m[2]}return out}
// Bare names use conventions. Explicit relative paths are anchored to the referring PEP.
function resolveFile(file,ref,ext,scope){
 const qualified=ref.match(/^([A-Za-z0-9_-]+):([-\w]+\.[A-Za-z]+)$/);
 const name=qualified?qualified[2]:ref;
 if(!/^[A-Za-z0-9_./-]+$/.test(name)||path.isAbsolute(name)||path.extname(name)!=='.'+ext||!/^[-\w]+$/.test(path.basename(name,'.'+ext)))fail(`Invalid ${ext} reference: ${ref}`);
 const exists=p=>fs.existsSync(p)&&fs.statSync(p).isFile();
 const finish=(target,origin)=>({file:fs.realpathSync(target),origin});
 const dir=path.dirname(file);
 if(qualified){const m=scope.modes.find(m=>m.name===qualified[1]);if(!m)fail(`Mode not imported: ${qualified[1]}`);const target=path.join(m.dir,ext,name);if(!exists(target))fail(`Missing ${ext}: ${ref}`);return finish(target,`mode:${m.name}`)}
 if(name.includes('/')){const target=path.resolve(dir,name);if(!exists(target))fail(`Missing ${ext}: ${target}`);return finish(target,'path')}
 const local=path.join(ext==='pep'?dir:path.join(dir,'..',ext),name);
 if(exists(local))return finish(local,scope.owner?`mode:${scope.owner}`:'local');
 const matches=scope.modes.map(m=>({m,target:path.join(m.dir,ext,name)})).filter(x=>exists(x.target));
 if(matches.length>1)fail(`Ambiguous ${ext}: ${name}; choose ${matches.map(x=>x.m.name+':'+name).join(' or ')}`);
 if(matches.length===1)return finish(matches[0].target,`mode:${matches[0].m.name}`);
 if(ext==='capability'&&exists(path.join(registry,name)))return finish(path.join(registry,name),'registry');
 fail(`Missing ${ext}: ${local} (from ${file}; use an explicit relative path or imported Mode to override)`);
}
function primitives(p,kind,scope){
 const ext=kind.toLowerCase(),implicit=p[kind]===undefined;
 const refs=implicit?[path.basename(p.file,'.pep')+'.'+ext]:p[kind];
 if(!refs.length)fail(`Empty ${kind} section: omit it for the default or supply a reference`);
 const seen=new Set();
 return refs.map(ref=>{const target=resolveFile(p.file,ref,ext,scope);if(seen.has(target.file))fail(`Duplicate ${kind}: ${ref}`);seen.add(target.file);return {...parse(target.file),ref,resolution:implicit?'default':'explicit',origin:target.origin}});
}
function type(value,t){return t==='integer'?Number.isSafeInteger(value):t==='number'?typeof value==='number'&&Number.isFinite(value):t==='text'?typeof value==='string':typeof value==='boolean'}
function checkFields(spec,values,where){for(const [key,t] of Object.entries(spec)){if(!Object.hasOwn(values,key)||!type(values[key],t))fail(`${where}.${key}: expected ${t}`)}}
function exactInteger(a,b,operation){
 if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b))fail('Expected safe integer operands');
 const x=BigInt(a),y=BigInt(b);
 let result;
 if(operation==='add')result=x+y;
 else{
  if(y===0n)fail('Division by zero');
  result=x/y;
  if(x%y!==0n&&(x<0n)!==(y<0n))result-=1n;
 }
 if(result>BigInt(Number.MAX_SAFE_INTEGER)||result<BigInt(Number.MIN_SAFE_INTEGER))fail('Integer overflow');
 return Number(result);
}
const natives={add:(a,b)=>exactInteger(a,b,'add'),floor_divide:(a,b)=>exactInteger(a,b,'floor_divide'),sha256:value=>createHash('sha256').update(value).digest('hex'),minimum:Math.min,multiply:(a,b)=>a*b,subtract:(a,b)=>a-b};
// Restricted expressions: no eval, no arbitrary JavaScript.
function operand(s,env){s=s.trim();if(/^-?\d+(\.\d+)?$/.test(s))return Number(s);if(Object.hasOwn(env,s))return env[s];fail(`Unknown value: ${s}`)}
function expr(s,env){s=s.trim();const hash=s.match(/^sha256\((\w+)\)$/);if(hash)return natives.sha256(operand(hash[1],env));const min=s.match(/^min\((\w+),\s*(\w+)\)$/);if(min)return Math.min(operand(min[1],env),operand(min[2],env));const m=s.match(/^(\w+)\s*([*+-])\s*(\w+)$/);if(m){const a=operand(m[1],env),b=operand(m[3],env);return m[2]==='*'?a*b:m[2]==='+'?a+b:a-b}return operand(s,env)}
function assertion(s,env){const m=s.match(/^(.+?)\s*(>=|<=|!=|=|>|<)\s*(.+)$/);if(!m)fail(`Unsupported assertion: ${s}`);const a=expr(m[1],env),b=expr(m[3],env);return ({'>=':()=>a>=b,'<=':()=>a<=b,'!=':()=>a!==b,'=':()=>a===b,'>':()=>a>b,'<':()=>a<b})[m[2]]()}
export function load(file=defaultFile,stack=[],parentScope=null){file=path.resolve(file);if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'pep',path.basename(file)+'.pep');file=fs.realpathSync(file);if(stack.includes(file)||stack.length>=16)fail(`Recursive reference or depth limit: ${file}`);const p=parse(file);const catalog=parentScope?.catalog??modeCatalog();const owner=catalog.owner(file);const imports=[...new Set([...(owner?[owner]:parentScope?.modes.map(m=>m.name)??[]),...(p.Use??[])])];const scope={catalog,owner,modes:catalog.expand(imports)};for(const s of ['Intake','Capability','Outtake'])if(!p[s])fail(`Missing ${s}: ${p.name}`);
 const inputs=fields(p.Intake,true),outputs=fields(p.Outtake.filter(l=>!l.includes('->')));const contexts=primitives(p,'Context',scope);const contracts=primitives(p,'Contract',scope);const available={...inputs};
 const steps=p.Capability.map(line=>{const m=line.match(/^([a-zA-Z_]\w*)\s*=\s*([A-Za-z0-9_./:-]+\.(?:pep|capability))\(([^)]*)\)$/);if(!m)fail(`Invalid capability: ${line}`);const [,id,ref,argsRaw]=m;const args=argsRaw.split(',').map(s=>s.trim()).filter(Boolean);if(Object.hasOwn(available,id))fail(`Duplicate binding ${id}`);for(const a of args)if(!Object.hasOwn(available,a))fail(`Unknown input ${a}`);
 let child,signature,native;const binding=resolveFile(file,ref,ref.endsWith('.pep')?'pep':'capability',scope);if(ref.endsWith('.pep')){child=load(binding.file,[...stack,file],scope);signature={inputs:child.inputs,outputs:child.outputs}}else{const c=parse(binding.file);signature={inputs:fields(c.Intake),outputs:fields(c.Outtake)};native=c.Implementation?.[0]?.match(/^native: (\w+)$/)?.[1];if(!Object.hasOwn(natives,native) && !(native==='storage_put_text' && binding.origin==='mode:storage'))fail(`Unsupported native: ${native}`)}
 const types=Object.values(signature.inputs),outTypes=Object.values(signature.outputs);if(args.length!==types.length||outTypes.length!==1)fail(`Unsupported interface ${ref}`);args.forEach((a,i)=>{if(available[a]!==types[i])fail(`Type mismatch ${id}.${a}`)});available[id]=outTypes[0];return {id,ref,args,signature,child,native,origin:binding.origin}});
 const sidechains=(p.Sidechain??[]).map(ref=>{const binding=resolveFile(file,ref,'pep',scope);const network=load(binding.file,[...stack,file],scope);const expected={phase:'text',path:'text',digest:'text'};if(Object.keys(network.inputs).length!==3||Object.entries(expected).some(([k,v])=>network.inputs[k]!==v))fail('Invalid sidechain intake: '+ref);return {ref,origin:binding.origin,network}});
 if(new Set(sidechains.map(s=>s.network.file)).size!==sidechains.length)fail('Duplicate sidechain');
 const routes=p.Outtake.filter(l=>l.includes('->')).map(l=>{const m=l.match(/^([a-zA-Z_]\w*)\s*->\s*(\w+)$/);if(!m||!Object.hasOwn(outputs,m[1]))fail(`Invalid route ${l}`);return {from:m[1],to:m[2]}});
 for(const [k,t] of Object.entries(outputs)){if(available[k]!==t)fail(`Missing or incompatible output ${k}`);if(!routes.some(r=>r.from===k))fail(`Unrouted output ${k}`)}
 return {name:p.name,file,source:p.Intake.find(l=>l.startsWith('source:'))?.slice(7).trim(),inputs,outputs,contexts,contracts,steps,routes,sidechains,modes:scope.modes.map(m=>m.name)};
}
// Persistence is opt-in and bound by the trusted host, not by user intake.
function invokeStorage(execution,step,args,network,prefix){
 if(typeof execution?.putText!=='function')fail('Storage execution binding required');
 return execution.putText({args,step,network,path:prefix+'/'+step.id});
}
export function run(network,input,trace=[],prefix=network.name,inherited=[],execution=null){
 const active=[...inherited,...(network.sidechains??[]).map(s=>({...s,declaredAt:prefix}))];
 function emit(phase,value){for(const s of active){const event={phase,path:prefix,digest:digest(value)};let result;try{result=run(s.network,event,[],prefix+'/@'+s.ref,[]);}catch(error){trace.push({kind:'Sidechain',path:prefix,declaredAt:s.declaredAt,ref:s.ref,event,passed:false});throw error;}trace.push({kind:'Sidechain',path:prefix,declaredAt:s.declaredAt,ref:s.ref,event,output:result.output,passed:true});}}
 try{emit('intake',input);
 checkFields(network.inputs,input,prefix+'/Intake');const env=Object.fromEntries(Object.keys(network.inputs).map(k=>[k,input[k]]));
 const checks=(kind)=>{for(const c of network.contracts)for(const rule of c[kind]||[]){const passed=assertion(rule,env);trace.push({path:prefix,kind,rule,passed});if(!passed)fail(`${prefix}: ${kind} failed: ${rule}`)}};
 checks('Require');emit('before_execute',env);for(const step of network.steps){const args=Object.fromEntries(Object.keys(step.signature.inputs).map((k,i)=>[k,env[step.args[i]]]));checkFields(step.signature.inputs,args,prefix+'/'+step.id);const result=step.child?run(step.child,args,trace,prefix+'/'+step.id,active,execution).output:{[Object.keys(step.signature.outputs)[0]]:step.native==='storage_put_text'?invokeStorage(execution,step,args,network,prefix):natives[step.native](...Object.values(args))};checkFields(step.signature.outputs,result,prefix+'/'+step.id);env[step.id]=Object.values(result)[0];trace.push({path:prefix+'/'+step.id,kind:'Capability',input:args,output:result,passed:true})}
 const output=Object.fromEntries(Object.keys(network.outputs).map(k=>[k,env[k]]));checkFields(network.outputs,output,prefix+'/Outtake');checks('Guarantee');emit('after_execute',output);emit('before_outtake',output);const deliveries=network.routes.map(r=>({destination:r.to,field:r.from,value:output[r.from]}));return {output,deliveries,trace};
 }catch(error){try{emit('failure',{message:error.message});}catch(sideError){throw new Error('Sidechain failure: '+sideError.message,{cause:error});}throw error;}
}
export function inspect(n,inherited=[]){const active=[...inherited,...(n.sidechains??[]).map(s=>s.ref)];return {name:n.name,sidechains:active,modes:n.modes,source:n.source,inputs:n.inputs,outputs:n.outputs,contexts:n.contexts.map(c=>({name:c.name,fields:c.Fields,ref:c.ref,resolution:c.resolution,origin:c.origin})),contracts:n.contracts.map(c=>({name:c.name,require:c.Require||[],guarantee:c.Guarantee||[],ref:c.ref,resolution:c.resolution,origin:c.origin})),routes:n.routes,steps:n.steps.map(s=>({id:s.id,ref:s.ref,origin:s.origin,args:s.args,child:s.child?inspect(s.child,active):null}))}}
export function fixtures(n,fixtureFile=path.join(path.dirname(path.dirname(n.file)),'fixtures.json')){return JSON.parse(fs.readFileSync(fixtureFile,'utf8')).map(f=>{try{const result=run(n,f.input);return {name:f.name,pass:!f.error&&Object.keys(f.expected).every(k=>Object.is(result.output[k],f.expected[k])),result:result.output}}catch(e){return {name:f.name,pass:!!f.error&&e.message.includes(f.error),error:e.message}}})}
