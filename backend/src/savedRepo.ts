import type { PersonContact, SavedPersonRow } from "./types.js";
import { getDb } from "./db.js";

type Row = {
  login: string;
  note: string;
  saved_at: string;
  person_json: string;
};

export function listSaved(): SavedPersonRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT login, note, saved_at, person_json FROM saved_people ORDER BY saved_at DESC`,
    )
    .all() as Row[];
  return rows.map((r) => ({
    login: r.login,
    note: r.note,
    savedAt: r.saved_at,
    person: JSON.parse(r.person_json) as PersonContact,
  }));
}

export function upsertPersonSnapshot(person: PersonContact): SavedPersonRow {
  const db = getDb();
  const login = person.login;
  const personJson = JSON.stringify(person);
  const existing = db
    .prepare(`SELECT note, saved_at FROM saved_people WHERE login = ?`)
    .get(login) as { note: string; saved_at: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE saved_people SET person_json = ? WHERE login = ?`,
    ).run(personJson, login);
    return {
      login,
      note: existing.note,
      savedAt: existing.saved_at,
      person,
    };
  }

  const savedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO saved_people (login, note, saved_at, person_json) VALUES (?, '', ?, ?)`,
  ).run(login, savedAt, personJson);

  return {
    login,
    note: "",
    savedAt,
    person,
  };
}

export function updateNote(login: string, note: string): SavedPersonRow | null {
  const db = getDb();
  const existing = db
    .prepare(`SELECT saved_at, person_json FROM saved_people WHERE login = ?`)
    .get(login) as { saved_at: string; person_json: string } | undefined;
  if (!existing) return null;

  db.prepare(`UPDATE saved_people SET note = ? WHERE login = ?`).run(note, login);

  return {
    login,
    note,
    savedAt: existing.saved_at,
    person: JSON.parse(existing.person_json) as PersonContact,
  };
}

export function deleteSaved(login: string): boolean {
  const db = getDb();
  const info = db.prepare(`DELETE FROM saved_people WHERE login = ?`).run(login);
  return info.changes > 0;
}

export function deleteAllSaved(): number {
  const db = getDb();
  const info = db.prepare(`DELETE FROM saved_people`).run();
  return Number(info.changes);
}

/** Rows where you added a note (non-empty after trim). */
export function countContacted(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM saved_people WHERE LENGTH(TRIM(COALESCE(note, ''))) > 0`,
    )
    .get() as { c: number };
  return Number(row.c);
}

export function countSaved(): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) AS c FROM saved_people`).get() as { c: number };
  return Number(row.c);
}
