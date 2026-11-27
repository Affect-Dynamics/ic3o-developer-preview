import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {run} from '../../runtime.mjs';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const genesis = '0'.repeat(64);
// Shared primitives: the caller owns the transaction.
export function initializeEvidence(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS execution_evidence (
        seq INTEGER PRIMARY KEY, previous TEXT NOT NULL, payload TEXT NOT NULL, hash TEXT NOT NULL
    )`);
}
export function appendEvidence(db,payload) {
    const last=db.prepare('SELECT seq,hash FROM execution_evidence ORDER BY seq DESC LIMIT 1').get();
    const seq=(last?.seq??0)+1, previous=last?.hash??genesis;
    const body=JSON.stringify(payload), commitment=hash([seq,previous,body]);
    db.prepare('INSERT INTO execution_evidence VALUES (?,?,?,?)').run(seq,previous,body,commitment);
    return {seq,hash:commitment};
}
// Standalone execution journal remains compatible with v0.9.
export class Journal {
    constructor(file) {
        this.db = new DatabaseSync(file);
        this.db.exec('PRAGMA busy_timeout=5000');
        initializeEvidence(this.db);
    }
    append(payload) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const checkpoint = appendEvidence(this.db,payload);
            this.db.exec('COMMIT');
            return checkpoint;
        } catch(error) { this.db.exec('ROLLBACK'); throw error; }
    }
    verify(checkpoint) {
        let previous = genesis, seq = 0, anchored = !checkpoint;
        for (const row of this.db.prepare('SELECT * FROM execution_evidence ORDER BY seq').iterate()) {
            if(row.seq !== ++seq || row.previous !== previous || row.hash !== hash([seq,previous,row.payload])) throw Error('Invalid evidence chain at '+seq);
            previous = row.hash;
            if(checkpoint?.seq === seq) { if(checkpoint.hash !== previous) throw Error('Checkpoint mismatch'); anchored = true; }
        }
        if(!anchored) throw Error('Missing checkpoint');
        return {seq,hash:previous};
    }
    close() { this.db.close(); }
}
export function runJournaled(network,input,journal) {
    const trace=[], id=randomUUID(); let result,error;
    try { result=run(network,input,trace); } catch(e) { error=e; }
    const events=trace.filter(e=>e.kind==='Sidechain' && e.ref==='provenance:provenance.pep');
    if(events.length) journal.append({id, timestamp:new Date().toISOString(), status:error?'rejected':'passed', events});
    if(error) throw error;
    return result;
}
