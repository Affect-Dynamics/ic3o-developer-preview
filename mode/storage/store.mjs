import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Provenance } from './provenance.mjs';
import { createHash } from 'node:crypto';
const check = (ok, message) => { if (!ok) throw Error(message); };
const primitive = new Set(['identifier','string','integer','boolean']);
const valid = (type, value) => type === 'identifier' ? typeof value === 'string' && value.length > 0 : type === 'integer' ? Number.isSafeInteger(value) : typeof value === type;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const lines = file => fs.readFileSync(file,'utf8').split(/\r?\n/).map(x=>x.trim()).filter(x=>x && !x.startsWith('#')).slice(1);
export function schemas(dir) {
    const types = new Map();
    for (const file of fs.readdirSync(dir).filter(f=>f.endsWith('.context')).sort()) {
        const network = path.basename(file,'.context');
        let fields;
        for (const line of lines(path.join(dir,file))) {
            const entity = /^Entity ([A-Za-z]\w*)$/.exec(line);
            if (entity) {
                const key = `${network}.${entity[1]}`;
                check(!types.has(key), `Duplicate entity ${key}`);
                fields = new Map(); types.set(key,fields); continue;
            }
            const field = /^([A-Za-z]\w*): ([A-Za-z]\w*(?:\.[A-Za-z]\w*)?)(\[\])?$/.exec(line);
            check(fields && field, `Invalid schema: ${line}`);
            const [,name,type,array] = field;
            check(!fields.has(name) && !['constructor','prototype','__proto__'].includes(name), `Invalid field ${name}`);
            fields.set(name,{type,array:!!array});
        }
    }
    for (const [entity,fields] of types) {
        check(fields.get('id')?.type === 'identifier' && !fields.get('id').array, `Missing identifier: ${entity}`);
        for (const spec of fields.values()) check(primitive.has(spec.type) || types.has(spec.type), `Unknown type ${spec.type}`);
    }
    return types;
}
export function compile(types,file) {
    const input = lines(file); check(input.shift()==='Require','Expected Require');
    const entry = /^(\w+): ([\w.]+)$/.exec(input.shift());
    check(entry && types.has(entry[2]) && input.shift()==='Guarantee','Invalid retrieval entry');
    const root = {entity:entry[2],children:new Map()};
    const provenance = new Map(); let section = false;
    for (const line of input) {
        if(line==='Provenance'){check(!section,'Duplicate Provenance');section=true;continue;}
        if(section){const m=/^([\w.\[\]]+): (.+)$/.exec(line);check(m,'Invalid provenance requirement');const fields=m[2].split(',').map(x=>x.trim());check(fields.every(x=>['origin','actor','timestamp','revision','contract','capability','verification','trust'].includes(x)),'Unknown provenance field');provenance.set(m[1],fields);continue;}
        const rule = /^([\w.\[\]]+): (\w+)$/.exec(line); check(rule,`Invalid guarantee ${line}`);
        const parts = rule[1].split('.'); let node=root;
        for (let i=0;i<parts.length;i++) {
            const segment=/^(\w+)(\[\])?$/.exec(parts[i]); check(segment,`Invalid path ${line}`);
            const [,name,array]=segment; const spec=types.get(node.entity)?.get(name);
            check(spec && spec.array===!!array,`Unknown field or cardinality: ${line}`);
            const last=i===parts.length-1;
            check(last ? primitive.has(spec.type) && spec.type===rule[2] : types.has(spec.type),`Invalid terminal or relationship: ${line}`);
            if (!node.children.has(name)) node.children.set(name,{name,entity:spec.type,array:spec.array,children:new Map()});
            node=node.children.get(name);
        }
    }
    check(root.children.size,'Empty guarantee');
    for(const [field,attrs] of provenance){let node=root;for(const part of field.split('.')){const name=part.replace(/\[\]$/,'');node=node.children.get(name);check(node && node.array===part.endsWith('[]'),'Provenance requires projected path');}node.provenance=attrs;}
    return {input:entry[1],root};
}
export class Store {
    constructor(types,file,{provenance=true}={}) {
        this.types=types; this.db=new DatabaseSync(file);
        this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS entities (scope TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(scope,id)) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS cells (scope TEXT NOT NULL,id TEXT NOT NULL,field TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(scope,id,field),FOREIGN KEY(scope,id) REFERENCES entities(scope,id) ON DELETE CASCADE) WITHOUT ROWID;`);
        const fingerprint=hash([...types].map(([k,v])=>[k,[...v]]));
        const old=this.db.prepare("SELECT value FROM metadata WHERE key='schema'").get();
        if(old && old.value!==fingerprint){this.db.close();throw Error('Schema changed: explicit migration required');}
        this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('schema',fingerprint);
        this.exists=this.db.prepare('SELECT 1 FROM entities WHERE scope=? AND id=?');
        this.cell=this.db.prepare('SELECT value FROM cells WHERE scope=? AND id=? AND field=?');
        this.provenance=provenance?new Provenance(this.db):null;
        // Do not invent provenance for pre-existing cells or permit an untracked writer to open a tracked store.
        const tracked=this.db.prepare("SELECT value FROM metadata WHERE key='provenance'").get();
        if(tracked && tracked.value!==String(provenance)){this.db.close();throw Error('Provenance mode mismatch');}
        if(!tracked && provenance && this.db.prepare('SELECT 1 FROM cells LIMIT 1').get()){this.db.close();throw Error('Existing data requires explicit provenance migration');}
        this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('provenance',String(provenance));
    }
    transaction(fn) { this.db.exec('BEGIN IMMEDIATE');this.writing=true;try {const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}finally{this.writing=false;} }
    write(scope,record,update=false,evidence={}) {
        check(this.writing,'Write requires transaction');
        const metadata=this.provenance?.validate(evidence);
        const fields=this.types.get(scope);check(fields,'Unknown scope');
        check(record && Object.keys(record).length===fields.size,'Record must match complete schema');
        for (const [name,spec] of fields) {
            check(Object.hasOwn(record,name),`Missing ${name}`);
            const values=spec.array?record[name]:[record[name]];check(Array.isArray(values),`Expected array ${name}`);
            for (const v of values) check(primitive.has(spec.type)?valid(spec.type,v):valid('identifier',v)&&this.exists.get(spec.type,v),`Invalid value or reference ${name}`);
        }
        if(update)check(this.exists.get(scope,record.id),'Missing entity');else this.db.prepare('INSERT INTO entities VALUES (?,?)').run(scope,record.id);
        const stmt=this.db.prepare('INSERT INTO cells VALUES (?,?,?,?) ON CONFLICT(scope,id,field) DO UPDATE SET value=excluded.value');
        for(const name of fields.keys()){
            const address=[scope,record.id,name],value=JSON.stringify(record[name]);
            stmt.run(...address,value);this.provenance?.record(address,value,metadata);
        }
    }
    insert(scope,record,evidence){return this.transaction(()=>this.write(scope,record,false,evidence));}
    update(scope,record,evidence){return this.transaction(()=>this.write(scope,record,true,evidence));}
    resolve(plan,input,authorize,authorizeProvenance) {
        check(typeof authorize==='function','Explicit access policy required');
        const id=input[plan.input];check(valid('identifier',id),'Invalid entry identifier');
        const trace=[];const provenance=[];let reads=0; const memo=new Map();
        this.db.exec('BEGIN');
        try {
            const visit=(node,key)=>{
                check(authorize(node.entity,key,null),'Entity access denied');
                check(this.exists.get(node.entity,key),`Missing entity ${node.entity}/${key}`);
                const result=Object.create(null);
                for(const child of node.children.values()){
                    check(authorize(node.entity,key,child.name),'Field access denied');
                    const address=[node.entity,key,child.name];const cacheKey=JSON.stringify(address);
                    if(!memo.has(cacheKey)){const row=this.cell.get(...address);check(row,`Missing cell ${address.join('/')}`);memo.set(cacheKey,JSON.parse(row.value));reads++;}
                    const value=memo.get(cacheKey);trace.push({address,relationship:!!child.children.size});
                    if(child.provenance){check(this.provenance && typeof authorizeProvenance==='function' && authorizeProvenance(...address),'Provenance access denied');const entry=this.provenance.read(address);check(entry,'Missing provenance');provenance.push({address, ...Object.fromEntries(child.provenance.map(key=>[key,entry[key]]))});}
                    const project=v=>{if(child.children.size)return visit(child,v);check(valid(child.entity,v),'Stored type mismatch');return v;};
                    result[child.name]=child.array?value.map(project):project(value);
                }
                return result;
            };
            const output=visit(plan.root,id);this.db.exec('COMMIT');return {output,trace,cellReads:reads,modelCalls:0,...(provenance.length?{provenance}: {})};
        }catch(e){this.db.exec('ROLLBACK');throw e;}
    }
    history(address,authorize){check(typeof authorize==='function' && authorize(...address),'Provenance access denied');check(this.provenance,'Provenance disabled');return this.db.prepare('SELECT revision FROM revisions WHERE scope=? AND id=? AND field=? ORDER BY revision').all(...address).map(row=>this.provenance.read(address,row.revision));}
    close(){this.db.close();}
}
