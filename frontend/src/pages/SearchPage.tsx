import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../apiBase";
import { PersonCard } from "../components/PersonCard";
import { useSavedPeople } from "../SavedPeopleContext";
import type { SearchResponse } from "../types";

const defaultQuery = 'location:"United States" language:TypeScript type:user';

export default function SearchPage() {
  const { addOrUpdatePerson, savedLogins } = useSavedPeople();

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

  const saveCurrentPage = useCallback(() => {
    if (!result?.people.length) return;
    for (const p of result.people) {
      addOrUpdatePerson(p);
    }
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
              Stored in this browser (localStorage). Add notes on the{" "}
              <Link to="/saved">saved table</Link> page.
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
                onSave={() => addOrUpdatePerson(p)}
                saved={savedLogins.has(p.login)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
