import fs from 'node:fs';
import path from 'node:path';
import {run} from './runtime.mjs';

// One instance per call path, even when several calls reference the same PEP.
export function contextFrontend(root) {
  const instances = new Map();
  function visit(network, id, parent) {
    const entry = {network, id, parent, state: {}, revision: 0};
    const candidates = network.contexts.filter(c => c.Frontend || c.Expose || fs.existsSync(path.join(path.dirname(c.file),'..','frontend',path.basename(c.file,'.context'),'index.html')));
    const matching = candidates.find(c => path.basename(c.file,'.context') === path.basename(network.file,'.pep'));
    entry.context = matching ?? (candidates.length === 1 ? candidates[0] : null);
    if(candidates.length > 1 && !matching) throw Error(`Ambiguous frontend context: ${network.name}`);
    instances.set(id, entry);
    for (const step of network.steps) if (step.child) visit(step.child, `${id}/${step.id}`, entry);
  }
  visit(root, 'root', null);
  function get(id) {
    const entry = instances.get(id);
    if (!entry) throw Error('Unknown context instance');
    return entry;
  }
  function exposure(entry) {
    const own = entry.context;
    if (!own) return {read: [], actions: [], constants: {}, frontend: null};
    const exposed = own.Expose ?? [];
    const read = exposed.filter(s => s.startsWith('read: ')).map(s => s.slice(6));
    const actions = exposed.filter(s => s.startsWith('invoke: ')).map(s => s.slice(8));
    const constants = Object.fromEntries((own.State??[]).map(line=>{
      const m=line.match(/^([A-Za-z_]\w*):\s*(.+)$/);if(!m)throw Error('Invalid context state declaration');
      return [m[1],JSON.parse(m[2])];
    }));
    const allowed = new Set([...Object.keys(entry.network.inputs), ...Object.keys(entry.network.outputs), ...Object.keys(constants)]);
    if (read.some(k => !allowed.has(k))) throw Error(`Invalid read exposure in ${own.name}`);
    if(actions.some(k => k !== 'self' && !entry.network.steps.some(s=>s.id===k))) throw Error(`Invalid action exposure in ${own.name}`);
    const frontend = own.Frontend?.[0];
    const conventional=path.join(path.dirname(own.file),'..','frontend',path.basename(own.file,'.context'));
    return {read, actions, constants, frontend: frontend ? path.resolve(path.dirname(own.file), frontend) : fs.existsSync(path.join(conventional,'index.html')) ? conventional : null};
  }
  function describe(entry) {
    const e = exposure(entry);
    return {id: entry.id, name: entry.network.name, context:entry.context?.name??null, inputs: entry.network.inputs, outputs: entry.network.outputs,
      fields: entry.context?.Fields ?? [],
      contracts: entry.network.contracts.map(c => ({name:c.name, require:c.Require??[], guarantee:c.Guarantee??[]})),
      capabilities: entry.network.steps.map(s=>({id:s.id,ref:s.ref, embedded:!!s.child, exposed:e.actions.includes(s.id)})),
      actions: e.actions, invocationInputs:root.inputs, readable:e.read, frontend:!!e.frontend,
      parent:entry.parent?.id??null,
      children: [...instances.values()].filter(x=>x.parent===entry).map(x=>({id:x.id,name:x.network.name,frontend:!!exposure(x).frontend}))};
  }
  function snapshot(entry) {
    const {read,constants} = exposure(entry);
    const values={...constants,...entry.state};
    return {revision:entry.revision, state:Object.fromEntries(read.filter(k=>Object.hasOwn(values,k)).map(k=>[k,values[k]]))};
  }
  function execute(input,trace=[]) {
    const result = run(root,input,trace);
    const pending = new Map([[get('root'),{...Object.fromEntries(Object.keys(root.inputs).map(k=>[k,input[k]])),...result.output}]]);
    for (const event of result.trace) {
      if(event.kind!=='Capability') continue;
      const id = 'root'+event.path.slice(root.name.length);
      const child=instances.get(id);
      if(child) pending.set(child,{...event.input,...event.output});
    }
    // Publish only after the entire root contract succeeds.
    for(const [instance,state] of pending){instance.state=state;instance.revision++;}
    return result;
  }
  function invoke(entry, action, input) {
    if (!exposure(entry).actions.includes(action)) throw Error('Action not exposed');
    // A named action targets a step, but executes the full enclosing root pipeline.
    // No isolated child invocation until ancestor predicates can be projected safely.
    const result=execute(input);
    const state=snapshot(entry);
    const event=action==='self'?null:result.trace.find(t=>t.kind==='Capability' && t.path===root.name+entry.id.slice(4)+'/'+action);
    const outputs=Object.fromEntries(Object.entries(entry.network.outputs).filter(([k])=>Object.hasOwn(state.state,k)).map(([k])=>[k,state.state[k]]));
    return {output:outputs, revision:state.revision, action, executed:'root', stepPassed:event?.passed??null};
  }
  function asset(entry, name) {
    const dir=exposure(entry).frontend;
    if(!dir || !/^[\w.-]+\.(html|css|js)$/.test(name)) throw Error('Frontend asset unavailable');
    const folder=fs.realpathSync(dir), file=fs.realpathSync(path.join(folder,name));
    if(path.dirname(file)!==folder || !fs.statSync(file).isFile()) throw Error('Frontend asset unavailable');
    return fs.readFileSync(file);
  }
  return {get,describe,snapshot,invoke,execute,asset};
}
