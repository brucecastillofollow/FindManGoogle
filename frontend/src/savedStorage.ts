import type { SavedPersonRow } from "./savedTypes";
import type { PersonContact } from "./types";

const STORAGE_KEY = "findman-github-saved-people-v1";

function isPersonContact(x: unknown): x is PersonContact {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.login === "string" &&
    (o.name === null || typeof o.name === "string") &&
    typeof o.githubUrl === "string" &&
    typeof o.avatarUrl === "string" &&
    (o.location === null || typeof o.location === "string") &&
    (o.company === null || typeof o.company === "string") &&
    (o.email === null || typeof o.email === "string") &&
    (o.blog === null || typeof o.blog === "string") &&
    (o.twitterUsername === null || typeof o.twitterUsername === "string") &&
    (o.twitterUrl === null || typeof o.twitterUrl === "string") &&
    Array.isArray(o.linkedInUrls) &&
    Array.isArray(o.otherSocialUrls) &&
    Array.isArray(o.phoneNumbers) &&
    (o.rawBio === null || typeof o.rawBio === "string")
  );
}

function isSavedRow(x: unknown): x is SavedPersonRow {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.login === "string" &&
    typeof o.note === "string" &&
    typeof o.savedAt === "string" &&
    isPersonContact(o.person)
  );
}

export function loadSaved(): SavedPersonRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedRow);
  } catch {
    return [];
  }
}

export function persistSaved(rows: SavedPersonRow[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // ignore quota / private mode
  }
}
