import {randomUUID} from 'node:crypto';
import {run} from '../../runtime.mjs';
import {initializeEvidence,appendEvidence} from '../provenance/journal.mjs';

// Trusted host selects the entity scope and policy; neither comes from intake.
export function runPersisted(network,input,store,{scope,authorize}={}) {
    if (!store.provenance) throw Error('Tracked storage required');
    if (typeof authorize !== 'function') throw Error('Explicit write policy required');
    const schema=store.types.get(scope);
    if (schema?.size!==2 || schema.get('id')?.type!=='identifier' ||
        schema.get('id')?.array || schema.get('body')?.type!=='string' ||
        schema.get('body')?.array) throw Error('Expected id/body text schema');
    if (store.writing) throw Error('Persistence requires root transaction ownership');
    initializeEvidence(store.db);
    const id=randomUUID();
    return store.transaction(()=>{
        const trace=[];
        const writes=[];
        const execution={
            putText({args,step,network:owner,path}) {
                const {id:recordId,body}=args;
                if (typeof recordId!=='string' || !recordId || typeof body!=='string')
                    throw Error('Invalid storage intake');
                if (authorize({scope,id:recordId,operation:'insert',path})!==true)
                    throw Error('Storage write denied');
                store.write(scope,{id:recordId,body},false,{
                    origin:'ic3o persisted execution',
                    contract:owner.contracts.map(c=>c.name).join(', '),
                    capability:step.ref
                });
                writes.push({scope,id:recordId,path});
                return body;
            }
        };
        const result=run(network,input,trace,network.name,[],execution);
        if (!writes.length) throw Error('No persisted writes');
        const events=trace.filter(e=>e.kind==='Sidechain' && e.ref==='provenance:provenance.pep');
        const complete=events.some(e=>e.path===network.name && e.event.phase==='before_outtake' && e.passed===true);
        if (!complete) throw Error('Mandatory root provenance sidechain required');
        const checkpoint=appendEvidence(store.db,{
            id,timestamp:new Date().toISOString(),status:'passed',writes,events
        });
        return {...result,checkpoint};
    });
}
