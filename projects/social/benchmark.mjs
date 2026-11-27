import { performance } from 'node:perf_hooks';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemas, compile, Store } from '../../mode/storage/store.mjs';
import { seed, policy } from './demo.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sizes = (process.argv[2] || '1000,10000,100000').split(',').map(Number);
const iterations = Number(process.argv[3] || 2000);
if (!sizes.every(n => Number.isSafeInteger(n) && n > 0) || !Number.isSafeInteger(iterations) || iterations < 100) throw Error('Supply positive dataset sizes and at least 100 iterations');
const timed = fn => { const start = performance.now(); const value = fn(); return { value, ms: performance.now() - start }; };
const round = n => Number(n.toFixed(4));
const results = [];
const tracked = process.argv[4] !== "off";
const projectProvenance = process.argv[4] === "project";
for (const size of sizes) {
    const temp = mkdtempSync(path.join(tmpdir(), 'ilk-bench-'));
    const file = path.join(temp, 'data.db');
    let store;
    try {
        const schema = timed(() => schemas(path.join(dir, 'context')));
        const compiled = timed(() => compile(schema.value, path.join(dir, projectProvenance ? 'contract/post-provenance.contract' : 'contract/post.contract')));
        store = new Store(schema.value, file,{provenance:tracked});
        const insertion = timed(() => seed(store, size));
        const actualPosts = store.db.prepare('SELECT COUNT(*) AS count FROM entities WHERE scope=?').get('posts.Post').count;
        store.close(); store = null;
        const opened = timed(() => new Store(schema.value, file,{provenance:tracked})); store = opened.value;
        const resolve = i => store.resolve(compiled.value, {post_id: `p${i}`}, policy, policy);
        const first = timed(() => resolve(0));
        let state = 123456789;
        const nextId = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % size; };
        for (let i = 0; i < 200; i++) resolve(nextId());
        const samples = [];
        for (let i = 0; i < iterations; i++) {
            const id = nextId(); const sample = timed(() => resolve(id));
            if (sample.value.output.id !== `p${id}` || sample.value.cellReads !== 10 || sample.value.modelCalls !== 0) throw Error('Unexpected retrieval result');
            samples.push(sample.ms);
        }
        samples.sort((a,b) => a-b);
        const percentile = p => round(samples[Math.ceil(p * samples.length) - 1]);
        results.push({posts: actualPosts, iterations, schema_ms: round(schema.ms), compile_ms: round(compiled.ms), seed_ms: round(insertion.ms), reopen_ms: round(opened.ms), first_ms: round(first.ms), p50_ms: percentile(.5), p95_ms: percentile(.95), p99_ms: percentile(.99), mean_ms: round(samples.reduce((a,b)=>a+b,0)/samples.length), cellReads: first.value.cellReads, modelCalls: first.value.modelCalls});
    } finally { if (store) store.close(); rmSync(temp, {recursive:true,force:true}); }
}
console.table(results);
console.log(JSON.stringify({node:process.version, platform:process.platform, arch:process.arch, warmup:200, provenance:tracked, projectProvenance, results},null,2));
