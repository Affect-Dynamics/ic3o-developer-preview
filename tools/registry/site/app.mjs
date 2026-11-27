const byId=id=>document.getElementById(id);
function el(tag,text,className){
    const node=document.createElement(tag);
    if(text!==undefined)node.textContent=text;
    if(className)node.className=className;
    return node;
}
const base='https://github.com/Affect-Dynamics/ic3o-developer-preview';
function link(label,url){const a=el('a',label);a.href=url;return a;}
function identity(login){return /^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(login||'')?link('@'+login,'https://github.com/'+login):el('span','unavailable');}
function evidence(label,value){
    const p=el('p',undefined,'meta');
    p.append(label+': ');
    if(!value){p.append('unavailable');return p;}
    p.append(identity(value.author));
    if(/^[a-f0-9]{40}$/.test(value.commit||''))p.append(' · ',link('commit '+value.commit.slice(0,8),base+'/commit/'+value.commit));
    for(const pr of value.pulls||[]){
        if(Number.isSafeInteger(pr.number)&&pr.number>0)p.append(' · ',link('PR #'+pr.number,base+'/pull/'+pr.number),' by ',identity(pr.author));
    }
    return p;
}
try{
    const r=await fetch('catalog.json',{cache:'no-cache'});
    if(!r.ok)throw Error('Catalog unavailable');
    const data=await r.json();
    if(data.schemaVersion!==1||data.repository!=='Affect-Dynamics/ic3o-developer-preview'||!/^[a-f0-9]{40}$/.test(data.revision))throw Error('Unsupported catalog');
    byId('count').textContent=data.entries.length;
    byId('modes').textContent=new Set(data.entries.map(e=>e.mode).filter(Boolean)).size;
    byId('authors').textContent=new Set(data.entries.flatMap(e=>[e.origin,e.latest].flatMap(a=>a?[a.author,...(a.pulls||[]).map(p=>p.author)]:[])).filter(Boolean)).size;
    function render(){
        const q=byId('search').value.toLowerCase().trim(),kind=byId('kind').value;
        const entries=data.entries.filter(e=>(!kind||e.kind===kind)&&[e.path,e.description,e.body,e.origin?.author,e.latest?.author,...[e.origin,e.latest].flatMap(a=>(a?.pulls||[]).map(p=>p.author))].join(' ').toLowerCase().includes(q));
        byId('status').replaceChildren(entries.length+' of '+data.entries.length+' definitions · ',link(data.revision.slice(0,12),base+'/commit/'+data.revision),' · commit authors are not necessarily original creators');
        const nodes=entries.map(e=>{
            const article=el('article',undefined,'entry');
            const title=el('h2');title.append(link(e.path,base+'/blob/'+data.revision+'/'+e.path.split('/').map(encodeURIComponent).join('/')));
            article.append(title,el('span',e.kind,'type'),el('p',e.description),evidence('Earliest recorded path commit',e.origin),evidence('Latest changing commit',e.latest));
            const details=el('details');details.append(el('summary','Inspect native definition'),el('pre',e.body));article.append(details);
            return article;
        });
        byId('entries').replaceChildren(...nodes);
    }
    byId('search').addEventListener('input',render);byId('kind').addEventListener('change',render);render();
}catch(e){byId('status').textContent='Unable to load the registry: '+e.message;}
