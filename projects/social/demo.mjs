import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {schemas,compile,Store} from '../../mode/storage/store.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
export const types=schemas(path.join(dir,'context'));
export const plan=compile(types,path.join(dir,'contract/post.contract'));
export const policy=(scope,id,field)=>field!=='secret';
export function seed(store,count=1){
    store.transaction(()=>{
        store.write('identity.User',{id:'u1',name:'Ada',avatar:'/ada.png',secret:'private'});
        store.write('identity.User',{id:'u2',name:'Grace',avatar:'/grace.png',secret:'private'});
        store.write('comments.Comment',{id:'c1',body:'Nice post',author:'u2'});
        for(let i=0;i<count;i++)store.write('posts.Post',{id:`p${i}`,title:`Post ${i}`,body:'Hello',author:'u1',comments:['c1']});
    });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
    const file=process.argv[2]||path.join(dir,'social.db');const store=new Store(types,file);
    try {if(!store.exists.get('posts.Post','p0'))seed(store,Number(process.argv[3]||1000));console.log(JSON.stringify(store.resolve(plan,{post_id:'p0'},policy),null,2));}finally{store.close();}
}
