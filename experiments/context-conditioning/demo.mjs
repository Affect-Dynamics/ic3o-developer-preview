// Experiment 03A demo: identical contractual data, different contexts, different outcomes
// and different traversal paths. The route table never changes and never sees Context.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadExperiment, traverse, ContextError, BridgeError} from './index.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const compiled = loadExperiment(path.join(dir, 'routes.json'), path.join(dir, 'context.json'));
const input = {quantity: 8, unit_price: 250};
const contexts = [
    {channel: 'retail', season: 'standard'},
    {channel: 'retail', season: 'promo'},
    {channel: 'wholesale', season: 'standard'},
    {channel: 'wholesale', season: 'promo'},
    {channel: 'internal', season: 'standard'},
    {channel: 'internal', season: 'promo'}
];
console.log(`contractual data: ${JSON.stringify(input)} (identical in every run)\n`);
for (const context of contexts) {
    try {
        const r = traverse(compiled, input, {context});
        const derived = r.trace.find(t => t.kind === 'DerivedContext' && t.network === 'price').derived.map(d => `${d.name}=${d.value}`).join(' ');
        const priced = r.trace.filter(t => t.kind === 'Capability' && t.network === 'price').map(t => `${t.path.split('/').pop()}=${t.output.result}`).join(' ');
        console.log(`${context.channel}/${context.season}`);
        console.log(`  derived   ${derived}`);
        console.log(`  computed  ${priced}`);
        console.log(`  settled   ${JSON.stringify(r.trace.find(t => t.kind === 'Settled').output)}`);
        console.log(`  path      ${r.path.join(' -> ')}   out=${JSON.stringify(r.output)}\n`);
    } catch (e) {
        if (!(e instanceof ContextError || e instanceof BridgeError)) throw e;
        console.log(`${context.channel}/${context.season}\n  REJECTED ${e.code}: ${e.message}\n`);
    }
}
console.log('Illustrative fixtures in cents; not production monetary arithmetic.');
