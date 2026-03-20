import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { SavedPersonRow } from "../savedTypes";
import { useSavedPeople } from "../SavedPeopleContext";

function rowMatchesFilters(row: SavedPersonRow, f: Record<string, string>): boolean {
  const p = row.person;
  const checks: [string, string][] = [
    [p.name ?? "", f.name],
    [p.login, f.login],
    [p.location ?? "", f.location],
    [p.company ?? "", f.company],
    [p.email ?? "", f.email],
    [p.blog ?? "", f.blog],
    [p.twitterUsername ?? "", f.twitter],
    [p.rawBio ?? "", f.bio],
    [row.note, f.note],
    [new Date(row.savedAt).toLocaleString(), f.saved],
  ];
  for (const [hay, needle] of checks) {
    const n = needle.trim();
    if (!n) continue;
    if (!hay.toLowerCase().includes(n.toLowerCase())) return false;
  }
  return true;
}

const emptyFilters = {
  name: "",
  login: "",
  location: "",
  company: "",
  email: "",
  blog: "",
  twitter: "",
  bio: "",
  note: "",
  saved: "",
};

export default function SavedTablePage() {
  const { rows, setNote, remove, clearAll, loading, error, refresh } = useSavedPeople();
  const [filters, setFilters] = useState(() => ({ ...emptyFilters }));

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    [rows],
  );

  const filtered = useMemo(
    () => sorted.filter((row) => rowMatchesFilters(row, filters)),
    [sorted, filters],
  );

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((v) => v.trim().length > 0),
    [filters],
  );

  const inputStyle: CSSProperties = {
    width: "100%",
    minWidth: 0,
    padding: "0.35rem 0.45rem",
    fontSize: "0.8rem",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "1.5rem" }}>
      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem" }}>Saved people</h1>
        <p style={{ margin: 0, color: "var(--muted)", maxWidth: 720 }}>
          Table of profiles you saved from search. Data is stored in the backend SQLite database (see{" "}
          <code>SQLITE_PATH</code> / <code>backend/data/findman.sqlite</code>). Use the filter row to narrow by field;
          GitHub Search returns at most <strong>30</strong> users per API page — your DB can hold more over time.
        </p>
        <p style={{ margin: "0.75rem 0 0", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <Link to="/">← Back to search</Link>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            style={{ padding: "0.25rem 0.5rem", borderRadius: 6, cursor: loading ? "wait" : "pointer" }}
          >
            Refresh
          </button>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => setFilters({ ...emptyFilters })}
              style={{ padding: "0.25rem 0.5rem", borderRadius: 6 }}
            >
              Clear filters
            </button>
          ) : null}
        </p>
      </header>

      {error ? (
        <p style={{ color: "var(--err)", marginBottom: "1rem" }} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading saved rows…</p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          Nothing saved yet. Run a search and use <strong>Save to table</strong> on a card, or{" "}
          <strong>Save all on this page</strong>.
        </p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <>
          <div style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <span style={{ color: "var(--muted)" }}>
              <strong>{filtered.length}</strong> shown
              {hasActiveFilters ? (
                <>
                  {" "}
                  of <strong>{rows.length}</strong> in DB
                </>
              ) : (
                <>
                  {" "}
                  row{rows.length === 1 ? "" : "s"} (total_count = <strong>{rows.length}</strong> in database)
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Remove all saved rows from the database?")) void clearAll();
              }}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: 6,
                border: "1px solid var(--err)",
                background: "transparent",
                color: "var(--err)",
                cursor: "pointer",
              }}
            >
              Clear all
            </button>
          </div>

          <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: "var(--muted)" }}>
            Filter each column below (substring match, case-insensitive). Empty = no filter on that field.
          </p>

          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9rem",
                background: "var(--panel)",
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "0.65rem 0.75rem", whiteSpace: "nowrap" }}>Avatar</th>
                  <th style={{ padding: "0.65rem 0.75rem", minWidth: 100 }}>Name</th>
                  <th style={{ padding: "0.65rem 0.75rem", minWidth: 90 }}>Login</th>
                  <th style={{ padding: "0.65rem 0.75rem", minWidth: 100 }}>Location</th>
                  <th style={{ padding: "0.65rem 0.75rem", minWidth: 90 }}>Company</th>
                  <th style={{ padding: "0.65rem 0.75rem", minWidth: 120 }}>Email</th>
                  <th style={{ padding: "0.65rem 0.75rem", minWidth: 180 }}>Note</th>
                  <th style={{ padding: "0.65rem 0.75rem", whiteSpace: "nowrap" }}>Saved</th>
                  <th style={{ padding: "0.65rem 0.75rem" }} />
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
                  <th style={{ padding: "0.35rem 0.5rem" }} />
                  <th style={{ padding: "0.35rem 0.5rem" }}>
                    <input
                      aria-label="Filter name"
                      value={filters.name}
                      onChange={(e) => setFilters((x) => ({ ...x, name: e.target.value }))}
                      placeholder="Filter…"
                      style={inputStyle}
                    />
                  </th>
                  <th style={{ padding: "0.35rem 0.5rem" }}>
                    <input
                      aria-label="Filter login"
                      value={filters.login}
                      onChange={(e) => setFilters((x) => ({ ...x, login: e.target.value }))}
                      placeholder="Filter…"
                      style={inputStyle}
                    />
                  </th>
                  <th style={{ padding: "0.35rem 0.5rem" }}>
                    <input
                      aria-label="Filter location"
                      value={filters.location}
                      onChange={(e) => setFilters((x) => ({ ...x, location: e.target.value }))}
                      placeholder="Filter…"
                      style={inputStyle}
                    />
                  </th>
                  <th style={{ padding: "0.35rem 0.5rem" }}>
                    <input
                      aria-label="Filter company"
                      value={filters.company}
                      onChange={(e) => setFilters((x) => ({ ...x, company: e.target.value }))}
                      placeholder="Filter…"
                      style={inputStyle}
                    />
                  </th>
                  <th style={{ padding: "0.35rem 0.5rem" }}>
                    <input
                      aria-label="Filter email"
                      value={filters.email}
                      onChange={(e) => setFilters((x) => ({ ...x, email: e.target.value }))}
                      placeholder="Filter…"
                      style={inputStyle}
                    />
                  </th>
                  <th style={{ padding: "0.35rem 0.5rem" }}>
                    <input
                      aria-label="Filter note"
                      value={filters.note}
                      onChange={(e) => setFilters((x) => ({ ...x, note: e.target.value }))}
                      placeholder="Filter…"
                      style={inputStyle}
                    />
                  </th>
                  <th style={{ padding: "0.35rem 0.5rem" }}>
                    <input
                      aria-label="Filter saved date"
                      value={filters.saved}
                      onChange={(e) => setFilters((x) => ({ ...x, saved: e.target.value }))}
                      placeholder="Filter…"
                      style={inputStyle}
                    />
                  </th>
                  <th style={{ padding: "0.35rem 0.5rem" }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const p = row.person;
                  return (
                    <tr key={row.login} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "middle" }}>
                        {p.avatarUrl ? (
                          <img
                            src={p.avatarUrl}
                            alt=""
                            width={40}
                            height={40}
                            style={{ borderRadius: "50%", display: "block" }}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "top" }}>
                        {p.name || "—"}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "top" }}>
                        <a href={p.githubUrl} target="_blank" rel="noreferrer">
                          @{p.login}
                        </a>
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "top" }}>
                        {p.location || "—"}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "top" }}>
                        {p.company || "—"}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "top", wordBreak: "break-all" }}>
                        {p.email ? (
                          <a href={`mailto:${p.email}`}>{p.email}</a>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "top", minWidth: 200 }}>
                        <textarea
                          value={row.note}
                          onChange={(e) => setNote(row.login, e.target.value)}
                          rows={3}
                          placeholder="Your notes…"
                          style={{
                            width: "100%",
                            minWidth: 160,
                            resize: "vertical",
                            fontFamily: "inherit",
                            fontSize: "0.85rem",
                            padding: "0.4rem",
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                            color: "var(--text)",
                          }}
                        />
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "top", color: "var(--muted)", fontSize: "0.8rem" }}>
                        {new Date(row.savedAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "top" }}>
                        <button
                          type="button"
                          onClick={() => void remove(row.login)}
                          style={{
                            padding: "0.4rem 0.6rem",
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                            color: "var(--text)",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <details style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--muted)" }}>
            <summary style={{ cursor: "pointer" }}>Extra field filters (blog, Twitter/X, bio)</summary>
            <div
              style={{
                marginTop: "0.75rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.75rem",
              }}
            >
              <label style={{ display: "grid", gap: "0.25rem" }}>
                Blog
                <input
                  value={filters.blog}
                  onChange={(e) => setFilters((x) => ({ ...x, blog: e.target.value }))}
                  placeholder="Filter…"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem" }}>
                Twitter / X username
                <input
                  value={filters.twitter}
                  onChange={(e) => setFilters((x) => ({ ...x, twitter: e.target.value }))}
                  placeholder="Filter…"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "grid", gap: "0.25rem", gridColumn: "1 / -1" }}>
                Bio (raw)
                <input
                  value={filters.bio}
                  onChange={(e) => setFilters((x) => ({ ...x, bio: e.target.value }))}
                  placeholder="Filter…"
                  style={inputStyle}
                />
              </label>
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
