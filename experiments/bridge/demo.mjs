import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRoutes, traverse, BridgeError} from './bridge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const input = {requested: 8, available: 5, unit_price: 250};
const show = trace => {
    for (const t of trace) {
        if (t.kind === 'Hop') console.log(`hop ${t.hop}  ${t.network}  ${t.passed ? 'PASS' : 'FAIL ' + t.error}  in=${JSON.stringify(t.input)}${t.output ? ' out=' + JSON.stringify(t.output) : ''}  (native trace: ${t.nativeTrace.length} entries)`);
        else if (t.kind === 'Bridge') console.log(`      bridge ${t.route ?? '-'}: ${t.from} -> ${t.to ?? '?'}  ${t.passed ? 'mapped=' + JSON.stringify(t.mapped) + ' discarded=[' + t.discarded + ']' : 'REJECTED ' + t.error}`);
        else console.log(`      terminal ${t.network}  out=${JSON.stringify(t.output)}`);
    }
};
try {
    const result = traverse(loadRoutes(path.join(here, 'routes.json')), input);
    show(result.trace);
    console.log(`completed at ${result.network} after ${result.hops} networks: ${JSON.stringify(result.output)}`);
} catch (error) {
    if (!(error instanceof BridgeError)) throw error;
    if (error.trace) show(error.trace);
    console.error(`${error.code}: ${error.message}`);
    process.exitCode = 1;
}
