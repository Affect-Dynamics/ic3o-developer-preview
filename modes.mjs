import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url));
const valid=/^[A-Za-z0-9_-]+$/;
export function modeCatalog(root=process.env.ILK_MODE_ROOT || path.join(base,'mode')) {
  root=path.resolve(root);
  // Compare canonical paths: macOS temporary directories can alias /private/var.
  if(fs.existsSync(root))root=fs.realpathSync(root);
  const cache=new Map();
  function get(name){
    if(!valid.test(name))throw Error(`Invalid Mode name: ${name}`);
    if(cache.has(name))return cache.get(name);
    const dir=path.join(root,name);
    if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())throw Error(`Missing Mode: ${name} (${dir})`);
    const file=path.join(dir,'mode.json');
    const meta=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
    const use=meta.use??[];
    if(!Array.isArray(use)||use.some(n=>typeof n!=='string'||!valid.test(n)))throw Error(`Invalid Mode dependencies: ${name}`);
    const m={name,dir:fs.realpathSync(dir),use};cache.set(name,m);return m;
  }
  function expand(names){
    const done=new Set(),active=new Set(),result=[];
    function visit(name){if(active.has(name))throw Error(`Mode dependency cycle: ${[...active,name].join(' -> ')}`);if(done.has(name))return;active.add(name);const m=get(name);result.push(m);for(const dep of m.use)visit(dep);active.delete(name);done.add(name)}
    for(const name of names)visit(name);return result;
  }
  function owner(file){const rel=path.relative(root,file);if(rel.startsWith('..'+path.sep)||path.isAbsolute(rel))return null;const parts=rel.split(path.sep);return parts.length>=3&&valid.test(parts[0])?parts[0]:null}
  function list(){return fs.existsSync(root)?fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()&&valid.test(e.name)).map(e=>get(e.name)).map(m=>({name:m.name,use:m.use,assets:Object.fromEntries(['pep','context','contract','capability'].map(ext=>{const dir=path.join(m.dir,ext);return [ext,fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.'+ext)&&fs.statSync(path.join(dir,f)).isFile()).sort():[]]}))})):[]}
  return {root,get,expand,owner,list};
}
