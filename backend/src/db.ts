import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default: `backend/data/findman.sqlite` relative to this file's directory (works for `tsx` and compiled `dist/`). */
export function getDefaultDbPath(): string {
  return join(__dirname, "..", "data", "findman.sqlite");
}

export function getDbFilePath(): string {
  const fromEnv = process.env.SQLITE_PATH?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : getDefaultDbPath();
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const filePath = getDbFilePath();
    mkdirSync(dirname(filePath), { recursive: true });
    db = new Database(filePath);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS saved_people (
        login TEXT PRIMARY KEY NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        saved_at TEXT NOT NULL,
        person_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT NOT NULL,
        query TEXT NOT NULL,
        searched_at TEXT NOT NULL,
        person_json TEXT NOT NULL
      );
    `);
  }
  return db;
}
