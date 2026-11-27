import {load,inspect} from '../../runtime.mjs';
import {Journal,runJournaled} from '../../mode/provenance/journal.mjs';
const network=load(new URL('./pep/sidechain-demo.pep',import.meta.url).pathname);
const journal=new Journal(process.argv[2]??'./execution-evidence.db');
try {
    const result=runJournaled(network,{requested:8,available:5,unit_price:250},journal);
    console.log(JSON.stringify({output:result.output,sidechains:inspect(network).sidechains,events:result.trace.filter(e=>e.kind==='Sidechain'),checkpoint:journal.verify()},null,2));
} finally {journal.close();}
