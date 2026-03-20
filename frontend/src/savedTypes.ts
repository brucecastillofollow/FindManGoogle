import type { PersonContact } from "./types";

/** One saved row: snapshot of profile + your note (persisted in localStorage). */
export interface SavedPersonRow {
  login: string;
  note: string;
  /** ISO timestamp when first saved */
  savedAt: string;
  person: PersonContact;
}
