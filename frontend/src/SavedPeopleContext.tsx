import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PersonContact } from "./types";
import { loadSaved, persistSaved } from "./savedStorage";
import type { SavedPersonRow } from "./savedTypes";

export type SavedPeopleContextValue = {
  rows: SavedPersonRow[];
  savedLogins: Set<string>;
  addOrUpdatePerson: (person: PersonContact) => void;
  setNote: (login: string, note: string) => void;
  remove: (login: string) => void;
  clearAll: () => void;
};

const SavedPeopleContext = createContext<SavedPeopleContextValue | null>(null);

export function SavedPeopleProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<SavedPersonRow[]>(() => loadSaved());

  useEffect(() => {
    persistSaved(rows);
  }, [rows]);

  const addOrUpdatePerson = useCallback((person: PersonContact) => {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.login === person.login);
      if (i >= 0) {
        const next = [...prev];
        next[i] = {
          ...next[i],
          person,
          savedAt: next[i].savedAt,
        };
        return next;
      }
      return [
        ...prev,
        {
          login: person.login,
          note: "",
          savedAt: new Date().toISOString(),
          person,
        },
      ];
    });
  }, []);

  const setNote = useCallback((login: string, note: string) => {
    setRows((prev) => prev.map((r) => (r.login === login ? { ...r, note } : r)));
  }, []);

  const remove = useCallback((login: string) => {
    setRows((prev) => prev.filter((r) => r.login !== login));
  }, []);

  const clearAll = useCallback(() => setRows([]), []);

  const savedLogins = useMemo(() => new Set(rows.map((r) => r.login)), [rows]);

  const value = useMemo(
    (): SavedPeopleContextValue => ({
      rows,
      savedLogins,
      addOrUpdatePerson,
      setNote,
      remove,
      clearAll,
    }),
    [rows, savedLogins, addOrUpdatePerson, setNote, remove, clearAll],
  );

  return <SavedPeopleContext.Provider value={value}>{children}</SavedPeopleContext.Provider>;
}

export function useSavedPeople(): SavedPeopleContextValue {
  const ctx = useContext(SavedPeopleContext);
  if (!ctx) {
    throw new Error("useSavedPeople must be used within SavedPeopleProvider");
  }
  return ctx;
}
