import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {collect,buildCatalog,githubAttribution,hash,repository} from '../tools/registry/build.mjs';
const revision='a'.repeat(40),commit='b'.repeat(40);
test('catalog covers native definitions and ignores non-native files and symlinks',t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'ic3o-registry-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    for(const f of ['registry/capability/multiply.capability','mode/math/pep/math.pep','mode/math/context/math.context','mode/math/contract/math.contract','mode/math/readme.md']){
        const dest=path.join(root,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,'Example\nIntake\n');
    }
    const list=collect(root);assert.equal(list.length,4);assert.equal(list[0].sha256,hash(list[0].body));
    assert.ok(list.some(e=>e.mode==='math'));
});
test('catalog binds revision and deduplicates attribution lookups',async t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'ic3o-catalog-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    fs.mkdirSync(path.join(root,'registry'));
    fs.writeFileSync(path.join(root,'registry','a.capability'),'A');
    fs.writeFileSync(path.join(root,'registry','b.capability'),'B');
    let lookups=0;
    const data=await buildCatalog(root,revision,{getHistory:()=>[commit],lookup:async c=>{lookups++;return githubAttribution(c,{author:{login:'alice'}},[]);}});
    assert.equal(data.revision,revision);assert.equal(lookups,1);
    assert.equal(data.entries[0].origin.author,'alice');
    assert.match(data.entries[0].source,/blob\/a{40}\//);
});
test('only actual merged upstream PR metadata is attributed',()=>{
    const a=githubAttribution(commit,null,[
        {number:1,merged_at:'date',base:{repo:{full_name:repository}},user:{login:'alice'}},
        {number:2,merged_at:null,base:{repo:{full_name:repository}}},
        {number:3,merged_at:'date',base:{repo:{full_name:'elsewhere/repo'}}}
    ]);
    assert.equal(a.author,null);assert.deepEqual(a.pulls,[{number:1,author:'alice'}]);
});
