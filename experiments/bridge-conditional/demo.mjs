// Experiment 02B demo: one topology, three traversal paths chosen by settled contractual data.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRoutes, traverse, BridgeError} from './bridge.mjs';

const compiled = loadRoutes(path.join(path.dirname(fileURLToPath(import.meta.url)), 'routes.json'));
const cases = [
    {label: 'ample stock', input: {requested: 8, available: 20, unit_price: 250}},
    {label: 'short stock', input: {requested: 8, available: 5, unit_price: 250}},
    {label: 'no stock', input: {requested: 8, available: 0, unit_price: 250}}
];
for (const {label, input} of cases) {
    try {
        const r = traverse(compiled, input);
        console.log(`${label}: ${JSON.stringify(input)}`);
        for (const b of r.trace.filter(t => t.kind === 'Bridge')) {
            for (const c of b.candidates) console.log(`  ${c.selected ? '*' : ' '} ${c.id.padEnd(15)} when ${c.when}  => ${c.selected ? 'selected' : c.rejection}`);
        }
        console.log(`  path ${r.path.join(' -> ')}  out=${JSON.stringify(r.output)}\n`);
    } catch (e) {
        if (!(e instanceof BridgeError)) throw e;
        console.log(`${label}: ${e.code}: ${e.message}`);
    }
}
