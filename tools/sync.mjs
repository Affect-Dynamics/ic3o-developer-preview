import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const upstream='https://github.com/Affect-Dynamics/ic3o-developer-preview.git';
const valid=sha=>typeof sha==='string' && /^[a-f0-9]{40}$/.test(sha);
function command(exe,args,cwd,quiet=false) {
    const result=spawnSync(exe,args,{cwd,encoding:'utf8',stdio:quiet?['ignore','pipe','pipe']:'inherit',shell:false});
    if(result.error) throw result.error;
    if(result.status!==0) throw Error(exe+' exited '+result.status+(quiet?': '+result.stderr.trim():''));
    return quiet?result.stdout.trim():'';
}
export function manager(root,{source=upstream,verify=dir=>command(process.execPath,['--test'],dir)}={}) {
    root=path.resolve(root);
    const mirror=path.join(root,'mirror.git'), snapshots=path.join(root,'snapshots');
    const stateFile=path.join(root,'active.json'),lock=path.join(root,'lock');
    fs.mkdirSync(snapshots,{recursive:true});
    const git=(args,quiet=false)=>command('git',['-c','core.hooksPath='+path.join(root,'disabled-hooks'),'--git-dir='+mirror,...args],root,quiet);
    function exclusive(fn) {
        try{fs.mkdirSync(lock);}catch(e){if(e.code==='EEXIST')throw Error('Sync already running or stale lock: '+lock);throw e;}
        try{return fn();}finally{fs.rmdirSync(lock);}
    }
    function status(){
        if(!fs.existsSync(stateFile))return {active:null,previous:null};
        const s=JSON.parse(fs.readFileSync(stateFile,'utf8'));
        if(!valid(s.active)||(s.previous!==null&&!valid(s.previous)))throw Error('Invalid snapshot pointer');
        return s;
    }
    function dir(sha){
        if(!valid(sha))throw Error('Invalid revision');
        return path.join(snapshots,sha);
    }
    function assertSnapshot(sha){
        const target=dir(sha);
        if(!fs.existsSync(path.join(target,'cli.mjs')))throw Error('Missing snapshot CLI');
        if(!fs.existsSync(path.join(target,'registry'))||!fs.existsSync(path.join(target,'mode')))throw Error('Missing registry or Modes');
        const local=(args)=>command('git',['-C',target,...args],root,true);
        if(local(['rev-parse','HEAD'])!==sha||local(['status','--porcelain','--untracked-files=all']))throw Error('Snapshot changed: '+sha);
        return target;
    }
    function publish(active,previous){
        const temp=stateFile+'.'+randomUUID()+'.tmp';
        try{fs.writeFileSync(temp,JSON.stringify({active,previous})+'\n',{flag:'wx'});fs.renameSync(temp,stateFile);}
        finally{fs.rmSync(temp,{force:true});}
    }
    function fetch(){
        if(!fs.existsSync(path.join(mirror,'HEAD')))command('git',['init','--bare',mirror],root,true);
        git(['fetch','--no-tags',source,'+refs/heads/main:refs/ic3o/upstream'],true);
        const sha=git(['rev-parse','refs/ic3o/upstream^{commit}'],true);
        if(!valid(sha))throw Error('Invalid upstream commit');
        return sha;
    }
    function check(){return exclusive(()=>({...status(),available:fetch()}));}
    function sync(){return exclusive(()=>{
        const state=status(),sha=fetch();
        if(state.active===sha){assertSnapshot(sha);return state;}
        if(state.active)git(['merge-base','--is-ancestor',state.active,sha],true);
        const target=dir(sha);
        let created=false;
        try{
            if(!fs.existsSync(target)){git(['worktree','add','--detach',target,sha],true);created=true;}
            assertSnapshot(sha);
            verify(target);
            assertSnapshot(sha);
            publish(sha,state.active);
            return status();
        }catch(e){
            if(created)git(['worktree','remove','--force',target],true);
            throw e;
        }
    });}
    function rollback(){return exclusive(()=>{
        const s=status();if(!s.previous)throw Error('No previous snapshot');
        assertSnapshot(s.previous);publish(s.previous,s.active);return status();
    });}
    function run(args){
        const s=status();if(!s.active)throw Error('Run sync first');
        const target=assertSnapshot(s.active);
        // Preserve caller cwd for app paths; resolve framework and registry together.
        command(process.execPath,[path.join(target,'cli.mjs'),...args],process.cwd());
    }
    return {status,check,sync,rollback,run};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    try{
        const [action='status',...args]=process.argv.slice(2);
        const m=manager(path.join(os.homedir(),'.ic3o','preview'));
        if(action==='run'){if(args[0]==='--auto'){args.shift();m.sync();}m.run(args);}
        else if(['status','check','sync','rollback'].includes(action)&&!args.length)console.log(JSON.stringify(m[action](),null,2));
        else throw Error('Use status | check | sync | rollback | run [--auto] <CLI args>');
    }catch(e){console.error('FAIL:',e.message);process.exitCode=1;}
}
