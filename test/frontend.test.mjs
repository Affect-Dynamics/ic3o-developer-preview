import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from '../runtime.mjs';
import {contextFrontend} from '../context-frontend.mjs';
import {server} from '../server.mjs';
const input={requested:8,available:5,unit_price:250};
test('context state and capability exposure follow call paths',()=>{
 const service=contextFrontend(load());const root=service.get('root'),child=service.get('root/allocation');
 assert.equal(service.describe(root).frontend,true);assert.equal(service.describe(child).frontend,true);
 assert.deepEqual(service.snapshot(root).state,{currency:'USD'});
 assert.throws(()=>service.invoke(root,'subtract',input),/not exposed/);
 assert.equal(service.invoke(child,'allocation',input).output.allocation,5);
 assert.deepEqual(service.snapshot(child).state,{requested:8,available:5,allocation:5});
 assert.equal(service.snapshot(root).state.total,1250);
 assert.throws(()=>service.invoke(child,'self',{...input,unit_price:-1}),/unit_price >= 0/);
 assert.equal(service.snapshot(root).revision,1);assert.equal(service.snapshot(child).revision,1);
 assert.throws(()=>service.asset(root,'../order.context'));
});
test('Mode provides context frontend assets and exposures',()=>{
 const svc=contextFrontend(load('projects/mode-order'));assert.match(svc.asset(svc.get('root'),'index.html').toString(),/order context/);assert.match(svc.asset(svc.get('root/allocation'),'index.html').toString(),/allocation context/);assert.equal(svc.invoke(svc.get('root'),'self',input).output.total,1250);
});
test('HTTP context frontend, SDK, invocation and shared snapshots',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{for(const p of ['/frontend/root/','/frontend/root/allocation/','/frontend/root/allocation/app.js','/ilk.js'])assert.equal((await fetch(base+p)).status,200,p);
 const url=base+'/api/context?id=root%2Fallocation';const invoke=(action,input)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,input})});
 assert.equal((await invoke('unknown',input)).status,400);assert.equal((await invoke('self',input)).status,200);
 const s=await fetch(url+'&view=state').then(r=>r.json());assert.equal(s.state.allocation,5);assert.equal(s.state.total,undefined);
 assert.equal((await invoke('self',{...input,requested:-1})).status,400);assert.deepEqual(await fetch(url+'&view=state').then(r=>r.json()),s);
 }finally{await new Promise(r=>server.close(r))}
});
