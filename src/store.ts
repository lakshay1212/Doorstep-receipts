import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DbShape } from './types.js';

const MAX_REQUEST_IDS = 5000;
const MAX_DEVICE_LOG = 5000;

function emptyDb(): DbShape {
  return { visits: [], deviceLog: [], seenRequestIds: [], counters: { kept: 0, discarded: 0 } };
}

/** Tiny JSON-file store with atomic writes. Pass ':memory:' for tests. */
export class Store {
  readonly db: DbShape;

  constructor(private readonly file: string) {
    if (file !== ':memory:' && existsSync(file)) {
      this.db = { ...emptyDb(), ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<DbShape>) };
    } else {
      this.db = emptyDb();
    }
  }

  save(): void {
    if (this.db.seenRequestIds.length > MAX_REQUEST_IDS) {
      this.db.seenRequestIds = this.db.seenRequestIds.slice(-MAX_REQUEST_IDS);
    }
    if (this.db.deviceLog.length > MAX_DEVICE_LOG) {
      this.db.deviceLog = this.db.deviceLog.slice(-MAX_DEVICE_LOG);
    }
    if (this.file === ':memory:') return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    renameSync(tmp, this.file);
  }
}
