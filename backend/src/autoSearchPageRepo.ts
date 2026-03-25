import { getDb } from "./db.js";

/** Persisted next GitHub Search `page` for automated runs (1-based). */
const KEY = "automated_search_next_page";

export function loadAutomatedSearchNextPage(): number {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(KEY) as
    | { value: string }
    | undefined;
  if (!row?.value) return 1;
  const n = parseInt(row.value, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/** Save the page the backend should use on the *next* automated run (after current run finishes). */
export function saveAutomatedSearchNextPage(page: number): void {
  const db = getDb();
  const p = Math.max(1, Math.floor(page));
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KEY, String(p));
}
