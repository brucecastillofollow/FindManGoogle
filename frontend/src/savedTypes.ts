import type { PersonContact } from "./types";

/** One saved row: snapshot of profile + your note (persisted in backend SQLite via API). */
export interface SavedPersonRow {
  login: string;
  note: string;
  /** ISO timestamp when first saved */
  savedAt: string;
  person: PersonContact;
}
