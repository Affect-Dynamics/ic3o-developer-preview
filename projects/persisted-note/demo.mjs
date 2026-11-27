import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {load} from '../../runtime.mjs';
import {Store,schemas,compile} from '../../mode/storage/store.mjs';
import {runPersisted} from '../../mode/storage/execute.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
export const types=schemas(path.join(dir,'schema'));
export const plan=compile(types,path.join(dir,'contract/read-note.contract'));
export const network=()=>load(path.join(dir,'pep/persisted-note.pep'));
if (process.argv[1]===fileURLToPath(import.meta.url)) {
    const store=new Store(types,process.argv[2]||':memory:');
    try {
        const id=randomUUID();
        // Trusted synthetic demo only; not an authentication or authorization service.
        const result=runPersisted(network(),{id,body:'Hello ic3o',approved:1},store,{
            scope:'notes.Note',authorize:()=>true
        });
        console.log(JSON.stringify({checkpoint:result.checkpoint,read:store.resolve(plan,{note_id:id},()=>true).output},null,2));
    } finally {store.close();}
}
