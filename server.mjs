import http from 'node:http';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {load,inspect,fixtures} from './runtime.mjs';
import {contextFrontend} from './context-frontend.mjs';
const publicDir=new URL('./public/',import.meta.url);
let activeDefinition, service;
function current(){
 const network=load(process.env.ILK_PEP||undefined);
 const fingerprint=JSON.stringify(network);
 if(!service||activeDefinition!==fingerprint){service=contextFrontend(network);activeDefinition=fingerprint}
 return service;
}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
function asset(res,name,body){res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(body)}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>65536)throw Error('Request too large')}return JSON.parse(raw)}
export const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&['/','/app.js','/style.css','/ilk.js'].includes(url.pathname)){const file=url.pathname==='/'?'index.html':url.pathname.slice(1);return asset(res,file,await fs.readFile(new URL(file,publicDir)))}
 if(req.method==='GET'&&url.pathname==='/api/network')return json(res,200,inspect(load(process.env.ILK_PEP||undefined)));
 if(req.method==='GET'&&url.pathname==='/api/tests')return json(res,200,fixtures(load(process.env.ILK_PEP||undefined),process.env.ILK_FIXTURES||undefined));
 if(req.method==='POST'&&url.pathname==='/api/run'){const trace=[];try{return json(res,200,current().execute(await body(req),trace))}catch(e){return json(res,400,{error:e.message,trace})}}
 if(url.pathname==='/api/context'){
   try{const svc=current(),entry=svc.get(url.searchParams.get('id')||'root');
   if(req.method==='GET')return json(res,200,url.searchParams.get('view')==='state'?svc.snapshot(entry):svc.describe(entry));
   if(req.method==='POST'){
     if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,415,{error:'JSON required'});
     if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'Cross-origin invocation denied'});
     const data=await body(req);return json(res,200,svc.invoke(entry,data.action,data.input));
   }}catch(e){return json(res,400,{error:e.message})}
 }
 if(req.method==='GET'&&url.pathname.startsWith('/frontend/')){
   try{const parts=url.pathname.slice(10).split('/');const name=parts.pop()||'index.html';const svc=current();return asset(res,name,svc.asset(svc.get(parts.join('/')),name))}catch{return json(res,404,{error:'Frontend not found'})}
 }
 return json(res,404,{error:'Not found'});
}catch(e){return json(res,500,{error:e.message})}});
server.on('close',()=>{service=undefined;activeDefinition=undefined});
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||8799),process.env.HOST||'127.0.0.1',()=>console.log(`ilk: http://${process.env.HOST||'127.0.0.1'}:${server.address().port}`));
