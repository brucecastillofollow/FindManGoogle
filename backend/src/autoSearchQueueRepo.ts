import { getDb } from "./db.js";

export type AutoSearchQueueItem = {
  /**
   * Full GitHub search query we will execute (may or may not include `created:`).
   * When splitting, we rebuild queries from the same "core" query.
   */
  q: string;
  /**
   * Created range associated with this queue item. We use it for splitting and sorting.
   * Format: `YYYY-MM-DD`.
   */
  rangeFrom: string;
  rangeTo: string;
};

export type AutoSearchActiveItem = {
  q: string;
  rangeFrom: string;
  rangeTo: string;
  totalCount: number;
  page: number;
};

const KEY_QUEUE = "automated_search_queue";
const KEY_ACTIVE = "automated_search_active";

function safeJsonParse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadAutoSearchQueue(): AutoSearchQueueItem[] {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(KEY_QUEUE) as
    | { value: string }
    | undefined;
  if (!row?.value) return [];
  const parsed = safeJsonParse<AutoSearchQueueItem[]>(row.value);
  if (!Array.isArray(parsed)) return [];
  // Basic shape validation
  return parsed.filter(
    (x) =>
      x &&
      typeof x.q === "string" &&
      typeof x.rangeFrom === "string" &&
      typeof x.rangeTo === "string",
  );
}

export function saveAutoSearchQueue(queue: AutoSearchQueueItem[]): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KEY_QUEUE, JSON.stringify(queue));
}

export function loadAutoSearchActive(): AutoSearchActiveItem | null {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(KEY_ACTIVE) as
    | { value: string }
    | undefined;
  if (!row?.value) return null;
  const parsed = safeJsonParse<AutoSearchActiveItem>(row.value);
  if (!parsed) return null;
  if (
    typeof parsed.q !== "string" ||
    typeof parsed.rangeFrom !== "string" ||
    typeof parsed.rangeTo !== "string" ||
    !Number.isFinite(parsed.totalCount) ||
    typeof parsed.page !== "number"
  ) {
    return null;
  }
  return parsed;
}

export function saveAutoSearchActive(active: AutoSearchActiveItem | null): void {
  const db = getDb();
  if (active == null) {
    db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(KEY_ACTIVE);
    return;
  }
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KEY_ACTIVE, JSON.stringify(active));
}

