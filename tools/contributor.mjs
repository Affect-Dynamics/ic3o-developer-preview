import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const upstream='Affect-Dynamics/ic3o-developer-preview';
export function scaffold(parent,name){
    if(typeof name!=='string'||!/^[a-z][a-z0-9-]{0,62}$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name))
        throw Error('Use a portable lowercase application name');
    const root=path.resolve(parent,name);
    fs.mkdirSync(root);
    const files={
        ['pep/'+name+'.pep']:name+'\nIntake\n    quantity: integer\n    price: integer\nCapability\n    total = multiply.capability(quantity, price)\nOuttake\n    total: integer\n    total -> response\n',
        ['context/'+name+'.context']:'Order context\nFields\n    quantity: Quantity\n    price: Unit price\n    total: Total price\n',
        ['contract/'+name+'.contract']:'Order contract\nRequire\n    quantity >= 0\n    price >= 0\nGuarantee\n    total = quantity * price\n',
        'fixtures.json':JSON.stringify([{name:'valid order',input:{quantity:2,price:5},expected:{total:10}},{name:'invalid order',input:{quantity:-1,price:5},error:'quantity >= 0'}],null,2)+'\n',
        '.gitignore':'node_modules/\n.env\n.env.*\n*.db\n*.db-*\n*.log\n',
        'README.md':'# '+name+'\n\nAn ic3o application. Open its PEP with the ic3o CLI and run its fixtures.\n'
    };
    for(const [file,content] of Object.entries(files)){
        const dest=path.join(root,file);
        fs.mkdirSync(path.dirname(dest),{recursive:true});
        fs.writeFileSync(dest,content,{flag:'wx'});
    }
    return root;
}
function execute(exe,args,cwd=process.cwd()){
    const r=spawnSync(exe,args,{cwd,stdio:'inherit',shell:false});
    if(r.error)throw r.error;
    if(r.status!==0)throw Error(exe+' exited '+r.status);
}
export function registryEntries(root){
    const dir=path.join(root,'registry','capability');
    return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()&&e.name.endsWith('.capability')).map(e=>({name:e.name,description:fs.readFileSync(path.join(dir,e.name),'utf8').split(/\r?\n/)[0]})).sort((a,b)=>a.name.localeCompare(b.name));
}
export function contributor(args,{cwd=process.cwd(),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),exec=execute,print=console.log}={}){
    const [action,...rest]=args;
    if(action==='login'&&rest.length===0) return exec('gh',['auth','login','--hostname','github.com','--web']);
    if(action==='whoami'&&rest.length===0) return exec('gh',['api','--hostname','github.com','user','--jq','.login']);
    if(action==='init'&&rest.length===1){
        const dest=scaffold(cwd,rest[0]);print('Created '+dest);return dest;
    }
    if(action==='repo'&&rest.length===2&&['--public','--private'].includes(rest[1])){
        if(!/^[a-z][a-z0-9-]{0,62}$/.test(rest[0]))throw Error('Invalid repository name');
        return exec('gh',['repo','create',rest[0],rest[1],'--source=.','--remote=origin','--push'],cwd);
    }
    if(action==='registry'&&rest[0]==='search'&&rest.length<=2){
        const query=(rest[1]||'').toLowerCase();
        for(const e of registryEntries(root))if((e.name+' '+e.description).toLowerCase().includes(query))print(e.name+'  '+e.description);
        return;
    }
    if(action==='contribute'&&rest.length===0){
        // Interactive GitHub CLI preserves the contributor's account and existing commits.
        return exec('gh',['pr','create','--repo',upstream,'--base','main'],cwd);
    }
    if(action==='report'&&rest.length===0)return exec('gh',['issue','create','--repo',upstream],cwd);
    throw Error('Use login | whoami | init NAME | repo NAME --public|--private | registry search [QUERY] | contribute | report');
}
