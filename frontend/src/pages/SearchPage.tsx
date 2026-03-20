import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../apiBase";
import { PersonCard } from "../components/PersonCard";
import { useSavedPeople } from "../SavedPeopleContext";
import type { SearchResponse } from "../types";

const defaultQuery = 'location:"United States" type:user';

type AutomatedSnapshot = {
  ok: boolean;
  query: string;
  totalCount: number | null;
  incompleteResults: boolean | null;
  ranAt: string | null;
  error: string | null;
  perPage: number | null;
  savedToDbCount: number | null;
};

type StatsResponse = {
  automated: AutomatedSnapshot;
  contactedCount: number;
  savedTotal: number;
};

export default function SearchPage() {
  const {
    addOrUpdatePerson,
    savedLogins,
    error: savedError,
    rows: savedRows,
    loading: savedLoading,
    refresh: refreshSaved,
  } = useSavedPeople();

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/stats"));
      if (!res.ok) return;
      const j = (await res.json()) as StatsResponse;
      setStats(j);
    } catch {
      /* ignore */
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const githubMatchesDisplay = useMemo(() => {
    if (statsLoading && !stats?.automated?.ranAt) return null;
    const a = stats?.automated;
    if (!a) return "—";
    if (a.ok && a.totalCount != null) return a.totalCount.toLocaleString();
    return "—";
  }, [stats, statsLoading]);

  useEffect(() => {
    void fetchStats();
    // Auto-search runs ~750ms after backend start; refresh stats + saved rows after it can finish.
    const t1 = setTimeout(() => {
      void fetchStats();
      void refreshSaved();
    }, 1200);
    const t2 = setTimeout(() => {
      void fetchStats();
      void refreshSaved();
    }, 3500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fetchStats, refreshSaved]);

  const contactedCount = useMemo(() => {
    if (!savedLoading) {
      return savedRows.filter((r) => r.note.trim().length > 0).length;
    }
    return stats?.contactedCount ?? 0;
  }, [savedRows, savedLoading, stats?.contactedCount]);

  const savedTotalDisplay = useMemo(() => {
    if (!savedLoading) return savedRows.length;
    return stats?.savedTotal ?? 0;
  }, [savedRows, savedLoading, stats?.savedTotal]);

  const [query, setQuery] = useState(defaultQuery);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [tokensText, setTokensText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);

  const tokenList = useMemo(
    () =>
      tokensText
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    [tokensText],
  );

  const saveTokens = useCallback(async () => {
    setError(null);
    if (!tokenList.length) {
      setError("Add at least one token (or use backend .env GITHUB_TOKENS).");
      return;
    }
    const res = await fetch(apiUrl("/api/tokens"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: tokenList }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Failed to save tokens");
      return;
    }
    const j = (await res.json()) as { count: number };
    setError(null);
    alert(`Saved ${j.count} token(s) in server memory (until restart).`);
  }, [tokenList]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query, page: String(page), perPage: String(perPage) });
      const res = await fetch(apiUrl(`/api/search?${params}`));
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : res.statusText);
        setResult(null);
        return;
      }
      setResult(j as SearchResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [query, page, perPage]);

  const saveCurrentPage = useCallback(async () => {
    if (!result?.people.length) return;
    await Promise.all(result.people.map((p) => addOrUpdatePerson(p)));
  }, [result, addOrUpdatePerson]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem" }}>GitHub people search</h1>
        <p style={{ margin: 0, color: "var(--muted)", maxWidth: 720 }}>
          Uses the official GitHub Search + Users API with rotating tokens. Public{" "}
          <strong>email</strong> is rarely returned; <strong>phone</strong> and LinkedIn only appear
          if the user put them in <strong>bio</strong> or <strong>blog</strong>.
        </p>
        <p style={{ margin: "0.75rem 0 0" }}>
          <Link to="/saved">Open saved table →</Link>
        </p>
      </header>

      <section
        style={{
          marginBottom: "1.5rem",
          padding: "1rem",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "grid",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <strong style={{ fontSize: "0.95rem" }}>Overview</strong>
          <button
            type="button"
            onClick={() => {
              setStatsLoading(true);
              void fetchStats();
              void refreshSaved();
            }}
            style={{ padding: "0.3rem 0.6rem", borderRadius: 6, fontSize: "0.85rem", cursor: "pointer" }}
          >
            Refresh metrics
          </button>
        </div>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
          On server start the backend runs an automated search (page 1, configurable <code>AUTO_SEARCH_PER_PAGE</code>, max
          30), enriches those users (same as manual search), and <strong>upserts them into SQLite</strong>. One Search API
          call plus one Users call per profile — tune <code>AUTO_SEARCH_PER_PAGE</code> to balance results vs rate limits.{" "}
          <strong>Contacted</strong> means saved rows with a non-empty <strong>note</strong>.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
          }}
        >
          <div
            style={{
              padding: "0.75rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>GitHub matches (automated query)</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
              {githubMatchesDisplay === null ? "…" : githubMatchesDisplay}
            </div>
            {stats?.automated?.incompleteResults ? (
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                incomplete_results from GitHub
              </div>
            ) : null}
            {stats?.automated?.error ? (
              <div style={{ fontSize: "0.75rem", color: "var(--err)", marginTop: "0.35rem" }}>{stats.automated.error}</div>
            ) : null}
            {stats?.automated?.query ? (
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.35rem", wordBreak: "break-word" }}>
                Query: <code>{stats.automated.query}</code>
              </div>
            ) : null}
            {stats?.automated?.ok && stats.automated.savedToDbCount != null ? (
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.35rem" }}>
                Auto-saved to DB this run: <strong style={{ color: "var(--text)" }}>{stats.automated.savedToDbCount}</strong>
                {stats.automated.perPage != null ? (
                  <>
                    {" "}
                    (page size {stats.automated.perPage})
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <div
            style={{
              padding: "0.75rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Contacted (note saved)</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--ok)" }}>
              {contactedCount.toLocaleString()}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              Rows in your table with a non-empty note
            </div>
          </div>
          <div
            style={{
              padding: "0.75rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Saved profiles</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>{savedTotalDisplay.toLocaleString()}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              Total rows in SQLite (with or without a note)
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          marginBottom: "1.5rem",
          padding: "1rem",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 10,
        }}
      >
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span>GitHub user search query</span>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={3}
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.85rem",
              padding: "0.5rem",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "end" }}>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            Page
            <input
              type="number"
              min={1}
              value={page}
              onChange={(e) => setPage(Number(e.target.value) || 1)}
              style={{ width: 80, padding: "0.35rem" }}
            />
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            Per page (max 30)
            <input
              type="number"
              min={1}
              max={30}
              value={perPage}
              onChange={(e) => setPerPage(Math.min(30, Number(e.target.value) || 15))}
              style={{ width: 100, padding: "0.35rem" }}
            />
          </label>
          <button
            type="button"
            onClick={runSearch}
            disabled={loading}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: 6,
              border: "none",
              background: "var(--accent)",
              color: "#0f1419",
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <details>
          <summary style={{ cursor: "pointer", color: "var(--muted)" }}>
            Optional: paste PATs (stored in server memory until restart)
          </summary>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0.5rem 0" }}>
            Prefer <code>GITHUB_TOKENS</code> in <code>backend/.env</code> for local dev. Docs:{" "}
            <a
              href="https://docs.github.com/en/rest/search/search#search-users"
              target="_blank"
              rel="noreferrer"
            >
              Search users API
            </a>
            .
          </p>
          <textarea
            placeholder="ghp_xxx ghp_yyy (space or comma separated)"
            value={tokensText}
            onChange={(e) => setTokensText(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.8rem",
              padding: "0.5rem",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
          <button
            type="button"
            onClick={saveTokens}
            style={{ marginTop: "0.5rem", padding: "0.35rem 0.75rem", borderRadius: 6 }}
          >
            Save tokens on server
          </button>
        </details>
      </section>

      {error ? (
        <p style={{ color: "var(--err)", marginTop: 0 }} role="alert">
          {error}
        </p>
      ) : null}
      {savedError ? (
        <p style={{ color: "var(--err)", marginTop: error ? "0.5rem" : 0 }} role="alert">
          Saved list (API): {savedError}
        </p>
      ) : null}

      {result ? (
        <>
          <p style={{ color: "var(--muted)" }}>
            Total matches (GitHub cap applies): <strong>{result.totalCount}</strong>
            {result.incompleteResults ? " (incomplete_results)" : ""} · Tokens in pool:{" "}
            <strong>{result.usedTokens}</strong> · Page <strong>{result.page}</strong> · Showing{" "}
            <strong>{result.people.length}</strong>
          </p>
          <div style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={saveCurrentPage}
              disabled={!result.people.length}
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--panel)",
                color: "var(--text)",
                fontWeight: 600,
                cursor: result.people.length ? "pointer" : "not-allowed",
              }}
            >
              Save all on this page to table
            </button>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Stored on the server (SQLite). Add notes on the <Link to="/saved">saved table</Link> page.
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "1rem",
            }}
          >
            {result.people.map((p) => (
              <PersonCard
                key={p.login}
                p={p}
                onSave={() => void addOrUpdatePerson(p)}
                saved={savedLogins.has(p.login)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
