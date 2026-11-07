import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RoomRecord } from './room';

const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

/** One JSON file per room; written atomically (temp file + rename). */
export class RoomStore {
  constructor(private dir: string | null) {
    if (dir) mkdirSync(dir, { recursive: true });
  }

  private file(code: string): string {
    return join(this.dir!, `${code}.json`);
  }

  save(record: RoomRecord): void {
    if (!this.dir) return;
    const tmp = this.file(record.code) + '.tmp';
    writeFileSync(tmp, JSON.stringify(record));
    renameSync(tmp, this.file(record.code));
  }

  remove(code: string): void {
    if (this.dir && existsSync(this.file(code))) rmSync(this.file(code));
  }

  /** Loads every saved room, dropping the ones nobody has touched for a week. */
  loadAll(): RoomRecord[] {
    if (!this.dir) return [];
    const out: RoomRecord[] = [];
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as RoomRecord;
        if (Date.now() - rec.updatedAt > MAX_AGE_MS) rmSync(join(this.dir, f));
        else out.push(rec);
      } catch {
        // a half-written or corrupt file must not stop the server
      }
    }
    return out;
  }
}
