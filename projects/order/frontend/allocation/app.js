import {ilk} from '/ilk.js';
const $=id=>document.getElementById(id);
const id=location.pathname.split('/').slice(2,-1).join('/');
const ctx=await ilk.context(id), d=ctx.definition;
function add(parent,tag,text){const el=document.createElement(tag);el.textContent=text;parent.append(el);return el}
function link(label,id){const a=add($('nav'),'a',label);a.href='/frontend/'+id+'/';a.style.marginRight='1em'}
$('title').textContent=d.name;
if(d.parent)link('↑ Parent context',d.parent);
for(const child of d.children)if(child.frontend)link(child.name+' ↗',child.id);
$('note').textContent=d.parent?'Actions execute through the enclosing pipeline to preserve parent guarantees.':'Values are published only after all contracts pass.';
const fields={};
for(const [key,type] of Object.entries(d.invocationInputs)){const label=add($('form'),'label',key.replaceAll('_',' '));const input=add(label,'input','');input.type=['integer','number'].includes(type)?'number':'text';input.required=true;input.step=type==='integer'?'1':'any';input.value=({requested:8,available:5,unit_price:250})[key]??'';fields[key]=input}
for(const action of d.actions){const b=add($('form'),'button',action==='self'?'Execute pipeline →':'Invoke '+action+' →');b.type='submit';b.value=action}
$('form').onsubmit=async e=>{e.preventDefault();try{const input=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,['integer','number'].includes(d.invocationInputs[k])?Number(v.value):d.invocationInputs[k]==='boolean'?v.value==='true':v.value]));await ctx.invoke(e.submitter.value,input);$('status').textContent='PASS · governed execution complete'}catch(e){$('status').textContent='FAIL · '+e.message}};
ctx.subscribe('*',(state,s)=>{$('state').replaceChildren();for(const key of d.readable){const item=add($('state'),'div',key);item.className='metric';add(item,'b',Object.hasOwn(state,key)?String(state[key]):'—')}},e=>{$('status').textContent=e.message});
for(const cap of await ctx.capabilities())add($('capabilities'),'p',cap.id+' · '+cap.ref+(cap.exposed?' · exposed':''));
for(const c of await ctx.contracts()){add($('contracts'),'h3',c.name);for(const rule of c.require)add($('contracts'),'p','Require: '+rule);for(const rule of c.guarantee)add($('contracts'),'p','Guarantee: '+rule)}
