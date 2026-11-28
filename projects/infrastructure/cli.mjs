import fs from 'node:fs';
import path from 'node:path';
import {openGateway} from './gateway.mjs';
const [configFile,principal,network,input]=process.argv.slice(2);
if(!configFile||!principal){console.error('Usage: node projects/infrastructure/cli.mjs CONFIG PRINCIPAL [NETWORK INPUT_JSON]');process.exit(1)}
const cfg=JSON.parse(fs.readFileSync(configFile,'utf8'));
const base=path.dirname(path.resolve(configFile));
let gateway;
try{
 gateway=openGateway({...cfg,root:path.resolve(base,cfg.root),journalFile:path.resolve(base,cfg.journalFile)});
 const result=network?gateway.execute({principal,network,input:JSON.parse(input??'{}')}):gateway.list(principal);
 console.log(JSON.stringify(result,null,2));
}catch(e){console.error(JSON.stringify({error:e.message,evidence:e.evidence}));process.exitCode=1;}
finally{gateway?.close()}
