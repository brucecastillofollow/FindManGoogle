import type { PersonContact } from "./types.js";
import { getDb } from "./db.js";

const MAX_ROWS = 500;

export type SearchHistoryRow = {
  id: number;
  login: string;
  query: string;
  searchedAt: string;
  person: PersonContact;
};

type DbRow = {
  id: number;
  login: string;
  query: string;
  searched_at: string;
  person_json: string;
};

/** Append one row per profile from a search (manual or automated). Prunes old rows to keep DB small. */
export function appendSearchResults(query: string, people: PersonContact[]): void {
  if (people.length === 0) return;
  const db = getDb();
  const searchedAt = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO search_history (login, query, searched_at, person_json) VALUES (?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    for (const p of people) {
      insert.run(p.login, query, searchedAt, JSON.stringify(p));
    }
  });
  tx();

  const count = (db.prepare(`SELECT COUNT(*) as c FROM search_history`).get() as { c: number }).c;
  if (count > MAX_ROWS) {
    const excess = count - MAX_ROWS;
    db.prepare(
      `DELETE FROM search_history WHERE id IN (SELECT id FROM search_history ORDER BY id ASC LIMIT ?)`,
    ).run(excess);
  }
}

export function listRecentSearchProfiles(limit: number): SearchHistoryRow[] {
  const db = getDb();
  const cap = Math.min(100, Math.max(1, limit));
  const rows = db
    .prepare(
      `SELECT id, login, query, searched_at, person_json FROM search_history ORDER BY id DESC LIMIT ?`,
    )
    .all(cap) as DbRow[];

  return rows.map((r) => ({
    id: r.id,
    login: r.login,
    query: r.query,
    searchedAt: r.searched_at,
    person: JSON.parse(r.person_json) as PersonContact,
  }));
}
