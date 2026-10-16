import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { SiteScan } from '../shared/site-scan.js';
import type { PageSpeedResult } from '../shared/research.js';
import { webDomain } from '../shared/web-data.js';
import { saveSiteScan, savePageSpeed } from './web-data.js';

/** Scheduled rescans of saved websites. Runs in the server process only while it is up;
 * a missed run happens at the next check after the host computer wakes. */
export const autoScanInput = z.object({ domain: webDomain, enabled: z.boolean(), intervalDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7) });
type Entry = { enabled: boolean; intervalDays: 1 | 7 | 30; lastRun?: string; lastError?: string | null };
export type AutoScanStatus = Entry & { domain: string; nextRun: string | null };
const KEY = 'auto_scan';

export function createAutoScan(db: DatabaseSync, deps: { scan: (domain: string) => Promise<SiteScan>; speed?: { keyed: () => boolean; run: (domain: string, url: string) => Promise<PageSpeedResult> }; now?: () => number; log?: (message: string) => void }) {
  const now = deps.now || Date.now;
  let running = false;
  const read = (): Record<string, Entry> => {
    try { const row = db.prepare('SELECT value FROM settings WHERE key=?').get(KEY) as { value: string } | undefined; return row ? JSON.parse(row.value) : {}; } catch { return {}; }
  };
  const write = (map: Record<string, Entry>) => db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(KEY, JSON.stringify(map));
  const lastScan = (domain: string) => {
    const row = db.prepare("SELECT json_extract(payload,'$.scannedAt') AS at FROM web_site_scans WHERE domain=?").get(domain) as { at: string | null } | undefined;
    return row?.at ? Date.parse(row.at) : null;
  };
  const due = (domain: string, entry: Entry) => {
    const last = Math.max(lastScan(domain) ?? 0, entry.lastRun ? Date.parse(entry.lastRun) : 0);
    return last + entry.intervalDays * 86_400_000;
  };
  return {
    status(domain: string): AutoScanStatus {
      const entry = read()[domain] || { enabled: false, intervalDays: 7 as const };
      return { domain, ...entry, nextRun: entry.enabled ? new Date(Math.max(due(domain, entry), now())).toISOString() : null };
    },
    set(input: z.input<typeof autoScanInput>): AutoScanStatus {
      const { domain, enabled, intervalDays } = autoScanInput.parse(input);
      const map = read();
      map[domain] = { ...map[domain], enabled, intervalDays };
      write(map);
      return this.status(domain);
    },
    /** Rescan every enabled domain whose interval has passed, one at a time. */
    async runDue(): Promise<string[]> {
      if (running) return [];
      running = true;
      const done: string[] = [];
      try {
        for (const [domain, entry] of Object.entries(read())) {
          if (!entry.enabled || due(domain, entry) > now()) continue;
          const map = read();
          try {
            const result = saveSiteScan(db, { ...(await deps.scan(domain)), auto: true }, domain);
            if (deps.speed?.keyed()) {
              try { savePageSpeed(db, await deps.speed.run(domain, result.finalUrl)); } catch (error) { deps.log?.(`Automatic speed test for ${domain} failed: ${(error as Error).message}`); }
            }
            map[domain] = { ...entry, lastRun: new Date(now()).toISOString(), lastError: null };
            done.push(domain);
          } catch (error) {
            // Wait a full interval before retrying a failing site rather than hammering it.
            map[domain] = { ...entry, lastRun: new Date(now()).toISOString(), lastError: (error as Error).message.slice(0, 300) };
            deps.log?.(`Automatic scan of ${domain} failed: ${(error as Error).message}`);
          }
          write(map);
        }
      } finally { running = false; }
      return done;
    },
  };
}
export type AutoScan = ReturnType<typeof createAutoScan>;
