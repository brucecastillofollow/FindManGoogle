import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiUrl } from "./apiBase";
import type { PersonContact } from "./types";
import type { SavedPersonRow } from "./savedTypes";

const NOTE_DEBOUNCE_MS = 400;

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: unknown };
    if (typeof j.error === "string") return j.error;
    if (j.error && typeof j.error === "object") return JSON.stringify(j.error);
  } catch {
    /* ignore */
  }
  return text || res.statusText;
}

export type SavedPeopleContextValue = {
  rows: SavedPersonRow[];
  savedLogins: Set<string>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addOrUpdatePerson: (person: PersonContact) => Promise<void>;
  setNote: (login: string, note: string) => void;
  remove: (login: string) => Promise<void>;
  clearAll: () => Promise<void>;
};

const SavedPeopleContext = createContext<SavedPeopleContextValue | null>(null);

export function SavedPeopleProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<SavedPersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const noteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/saved"));
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const j = (await res.json()) as { rows?: SavedPersonRow[] };
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () => () => {
      for (const t of noteTimers.current.values()) clearTimeout(t);
    },
    [],
  );

  const addOrUpdatePerson = useCallback(async (person: PersonContact) => {
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/saved/${encodeURIComponent(person.login)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const row = (await res.json()) as SavedPersonRow;
      setRows((prev) => {
        const i = prev.findIndex((r) => r.login === row.login);
        if (i >= 0) {
          const next = [...prev];
          next[i] = row;
          return next;
        }
        return [...prev, row].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const setNote = useCallback(
    (login: string, note: string) => {
      setRows((prev) => prev.map((r) => (r.login === login ? { ...r, note } : r)));
      const prevTimer = noteTimers.current.get(login);
      if (prevTimer) clearTimeout(prevTimer);
      const t = setTimeout(() => {
        void (async () => {
          try {
            const res = await fetch(apiUrl(`/api/saved/${encodeURIComponent(login)}`), {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ note }),
            });
            if (!res.ok) {
              setError(await readError(res));
              await refresh();
              return;
            }
            const row = (await res.json()) as SavedPersonRow;
            setRows((rprev) => rprev.map((r) => (r.login === login ? row : r)));
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            await refresh();
          }
        })();
      }, NOTE_DEBOUNCE_MS);
      noteTimers.current.set(login, t);
    },
    [refresh],
  );

  const remove = useCallback(async (login: string) => {
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/saved/${encodeURIComponent(login)}`), {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      setRows((prev) => prev.filter((r) => r.login !== login));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const clearAll = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/saved"), { method: "DELETE" });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      setRows([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const savedLogins = useMemo(() => new Set(rows.map((r) => r.login)), [rows]);

  const value = useMemo(
    (): SavedPeopleContextValue => ({
      rows,
      savedLogins,
      loading,
      error,
      refresh,
      addOrUpdatePerson,
      setNote,
      remove,
      clearAll,
    }),
    [rows, savedLogins, loading, error, refresh, addOrUpdatePerson, setNote, remove, clearAll],
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
