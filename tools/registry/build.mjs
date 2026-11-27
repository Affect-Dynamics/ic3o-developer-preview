import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const repository='Affect-Dynamics/ic3o-developer-preview';
const kinds=new Set(['.capability','.pep','.context','.contract']);
const shaPattern=/^[a-f0-9]{40}$/;
const loginPattern=/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/;
const sourceBase='https://github.com/'+repository;
export const hash=body=>createHash('sha256').update(body).digest('hex');
export function collect(root){
    const entries=[];
    function visit(dir){
        if(!fs.existsSync(dir))return;
        for(const e of fs.readdirSync(dir,{withFileTypes:true})){
            const file=path.join(dir,e.name);
            if(e.isDirectory())visit(file);
            else if(e.isFile()&&kinds.has(path.extname(e.name))){
                const relative=path.relative(root,file).split(path.sep).join('/');
                const body=fs.readFileSync(file,'utf8');
                entries.push({path:relative,name:e.name,kind:path.extname(e.name).slice(1),
                    mode:relative.startsWith('mode/')?relative.split('/')[1]:null,
                    description:body.split(/\r?\n/).find(l=>l.trim()&&!l.trim().startsWith('#'))?.trim()||'',
                    body,sha256:hash(body)});
            }
        }
    }
    visit(path.join(root,'registry'));visit(path.join(root,'mode'));
    return entries.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
function git(root,args){
    const r=spawnSync('git',args,{cwd:root,encoding:'utf8',shell:false});
    if(r.error||r.status!==0)throw Error('Git history lookup failed: '+(r.error?.message||r.stderr));
    return r.stdout.trim();
}
export function history(root,file,revision){
    if(!shaPattern.test(revision))throw Error('Invalid revision');
    // History is intentionally path-specific; renames and squash merges can obscure origins.
    const commits=git(root,['log','--format=%H',revision,'--',file]).split(/\r?\n/).filter(Boolean);
    return [...new Set([commits.at(-1),commits[0]].filter(x=>shaPattern.test(x||'')))];
}
export function githubAttribution(commit,record,pulls){
    if(!shaPattern.test(commit))throw Error('Invalid commit');
    const login=record?.author?.login;
    return {commit,author:loginPattern.test(login||'')?login:null,
        pulls:(Array.isArray(pulls)?pulls:[]).filter(p=>p.merged_at&&p.base?.repo?.full_name===repository&&Number.isSafeInteger(p.number)&&p.number>0)
            .map(p=>({number:p.number,author:loginPattern.test(p.user?.login||'')?p.user.login:null}))
            .sort((a,b)=>a.number-b.number)};
}
export async function buildCatalog(root,revision,{lookup=async()=>null,getHistory=file=>history(root,file,revision)}={}){
    if(!shaPattern.test(revision))throw Error('Invalid revision');
    const entries=collect(root),cache=new Map();
    async function attribution(commit){
        if(!cache.has(commit))cache.set(commit,Promise.resolve().then(()=>lookup(commit)));
        return await cache.get(commit);
    }
    for(const entry of entries){
        const commits=getHistory(entry.path);
        entry.source=sourceBase+'/blob/'+revision+'/'+entry.path.split('/').map(encodeURIComponent).join('/');
        entry.origin=commits.length?await attribution(commits[0]):null;
        entry.latest=commits.length?await attribution(commits.at(-1)):null;
    }
    return {schemaVersion:1,repository,revision,entries};
}
export async function lookupGithub(commit,token,fetcher=fetch){
    const base='https://api.github.com/repos/'+repository+'/commits/'+commit;
    async function get(url){
        const response=await fetcher(url,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('GitHub attribution lookup failed: HTTP '+response.status);
        return response.json();
    }
    const record=await get(base),pulls=await get(base+'/pulls?per_page=100');
    return githubAttribution(commit,record,pulls);
}
export async function main(root,output,token){
    const revision=git(root,['rev-parse','HEAD']);
    if(git(root,['status','--porcelain','--untracked-files=all']))throw Error('Build from a clean checkout');
    const data=await buildCatalog(root,revision,{lookup:token?commit=>lookupGithub(commit,token):async commit=>githubAttribution(commit,null,[])});
    fs.mkdirSync(output,{recursive:true});
    for(const file of ['index.html','quickstart.html','contribute.html','registry.html','status.html','style.css','app.mjs','status.mjs','cycle.svg'])fs.copyFileSync(path.join(root,'tools','registry','site',file),path.join(output,file));
    fs.writeFileSync(path.join(output,'catalog.json'),JSON.stringify(data,null,2)+'\n');
    fs.writeFileSync(path.join(output,'.nojekyll'),'');
    console.log('Registry: '+data.entries.length+' native definitions at '+revision);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    try{await main(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),path.resolve(process.argv[2]||'_site'),process.env.GITHUB_TOKEN);}
    catch(e){console.error(e.message);process.exitCode=1;}
}
