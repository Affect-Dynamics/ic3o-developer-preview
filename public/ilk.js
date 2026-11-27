// Browser SDK: instance-scoped API, no direct access to runtime files.
async function request(id,view,options){const q=new URLSearchParams({id,view});const r=await fetch('/api/context?'+q,options);const data=await r.json();if(!r.ok)throw Error(data.error);return data}
export const ilk={async context(id='root'){
 const describe=()=>request(id,'definition');
 const snapshot=()=>request(id,'state');
 const definition=await describe();
 return {definition,describe,snapshot,async get(key){return (await snapshot()).state[key]},async capabilities(){return (await describe()).capabilities},async contracts(){return (await describe()).contracts},invoke(action,input){return request(id,'invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,input})})},subscribe(key,handler,onError=console.error){let stopped=false,last=null,timer;async function tick(){try{const s=await snapshot();const signature=JSON.stringify(s);if(!stopped&&signature!==last){last=signature;handler(key==='*'?s.state:s.state[key],s)}}catch(e){if(!stopped)onError(e)}finally{if(!stopped)timer=setTimeout(tick,750)}}tick();return ()=>{stopped=true;clearTimeout(timer)}}};
}};
