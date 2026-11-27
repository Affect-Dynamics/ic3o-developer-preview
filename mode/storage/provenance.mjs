// Revision addresses are immutable; metadata is recorded, not independently authenticated.
export class Provenance {
    constructor(db) {
        this.db = db;
        db.exec(`CREATE TABLE IF NOT EXISTS revisions (
            scope TEXT NOT NULL, id TEXT NOT NULL, field TEXT NOT NULL,
            revision INTEGER NOT NULL, value TEXT NOT NULL, evidence TEXT NOT NULL,
            PRIMARY KEY(scope,id,field,revision)
        ) WITHOUT ROWID`);
        this.latest = db.prepare('SELECT revision,value,evidence FROM revisions WHERE scope=? AND id=? AND field=? ORDER BY revision DESC LIMIT 1');
        this.byRevision = db.prepare('SELECT revision,value,evidence FROM revisions WHERE scope=? AND id=? AND field=? AND revision=?');
        this.add = db.prepare('INSERT INTO revisions VALUES (?,?,?,?,?,?)');
    }
    record(address,value,evidence) {
        const previous = this.latest.get(...address);
        if (previous?.value === value) return;
        this.add.run(...address,(previous?.revision ?? 0)+1,value,JSON.stringify(evidence));
    }
    validate(evidence) {
        if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw Error('Invalid provenance');
        for (const key of ['origin','actor','contract','capability']) {
            if (evidence[key] !== undefined && (typeof evidence[key] !== 'string' || !evidence[key])) throw Error(`Invalid provenance ${key}`);
        }
        const dependencies = evidence.dependencies ?? [];
        if (!Array.isArray(dependencies)) throw Error('Invalid dependencies');
        for (const ref of dependencies) {
            if (!Array.isArray(ref) || ref.length !== 4 || !ref.slice(0,3).every(x=>typeof x==='string') || !Number.isSafeInteger(ref[3]) || ref[3]<1 || !this.byRevision.get(...ref)) throw Error('Missing dependency revision');
        }
        return {origin:evidence.origin??'local storage',actor:evidence.actor??null,contract:evidence.contract??null,capability:evidence.capability??null,dependencies,timestamp:new Date().toISOString(),verification:'schema-validated',trust:'recorded'};
    }
    read(address,revision) {
        const row = revision === undefined ? this.latest.get(...address) : this.byRevision.get(...address,revision);
        return row ? {address,revision:row.revision,value:JSON.parse(row.value),...JSON.parse(row.evidence)} : null;
    }
}
