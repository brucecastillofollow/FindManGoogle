import { useCallback, useMemo, useState } from "react";
import { apiUrl } from "./apiBase";
import type { PersonContact, SearchResponse } from "./types";

const defaultQuery = 'location:"United States" language:TypeScript type:user';

function Links({ label, urls }: { label: string; urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div>
      <strong>{label}</strong>
      <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
        {urls.map((u) => (
          <li key={u}>
            <a href={u} target="_blank" rel="noreferrer">
              {u}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonCard({ p }: { p: PersonContact }) {
  return (
    <article
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "1rem",
        background: "var(--panel)",
        display: "grid",
        gap: "0.5rem",
      }}
    >
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        {p.avatarUrl ? (
          <img
            src={p.avatarUrl}
            alt=""
            width={48}
            height={48}
            style={{ borderRadius: "50%" }}
          />
        ) : null}
        <div>
          <div style={{ fontWeight: 600 }}>{p.name || p.login}</div>
          <a href={p.githubUrl} target="_blank" rel="noreferrer">
            @{p.login}
          </a>
        </div>
      </div>
      <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        {[p.location, p.company].filter(Boolean).join(" · ") || "—"}
      </div>
      {p.rawBio ? (
        <p style={{ margin: 0, fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{p.rawBio}</p>
      ) : null}
      <dl style={{ margin: 0, display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
        <div>
          <dt style={{ display: "inline", color: "var(--muted)" }}>Email </dt>
          <dd style={{ display: "inline", margin: 0 }}>
            {p.email ? (
              <a href={`mailto:${p.email}`}>{p.email}</a>
            ) : (
              <span style={{ color: "var(--muted)" }}>not public in API</span>
            )}
          </dd>
        </div>
        <div>
          <dt style={{ display: "inline", color: "var(--muted)" }}>Blog </dt>
          <dd style={{ display: "inline", margin: 0 }}>
            {p.blog ? (
              <a href={p.blog} target="_blank" rel="noreferrer">
                {p.blog}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt style={{ display: "inline", color: "var(--muted)" }}>Twitter / X </dt>
          <dd style={{ display: "inline", margin: 0 }}>
            {p.twitterUrl ? (
              <a href={p.twitterUrl} target="_blank" rel="noreferrer">
                @{p.twitterUsername}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        {p.phoneNumbers.length > 0 ? (
          <div>
            <dt style={{ display: "inline", color: "var(--muted)" }}>Phones (from bio) </dt>
            <dd style={{ display: "inline", margin: 0 }}>{p.phoneNumbers.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      <Links label="LinkedIn" urls={p.linkedInUrls} />
      <Links label="Other links (from bio/blog)" urls={p.otherSocialUrls} />
    </article>
  );
}

export default function App() {
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

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem" }}>GitHub people search</h1>
        <p style={{ margin: 0, color: "var(--muted)", maxWidth: 720 }}>
          Uses the official GitHub Search + Users API with rotating tokens. Public{" "}
          <strong>email</strong> is rarely returned; <strong>phone</strong> and LinkedIn only appear
          if the user put them in <strong>bio</strong> or <strong>blog</strong>.
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "1rem",
            }}
          >
            {result.people.map((p) => (
              <PersonCard key={p.login} p={p} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
