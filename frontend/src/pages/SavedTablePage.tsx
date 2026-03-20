import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useSavedPeople } from "../SavedPeopleContext";

export default function SavedTablePage() {
  const { rows, setNote, remove, clearAll } = useSavedPeople();

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    [rows],
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>
      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem" }}>Saved people</h1>
        <p style={{ margin: 0, color: "var(--muted)", maxWidth: 720 }}>
          Table of profiles you saved from search. Notes are stored only in this browser (localStorage).
        </p>
        <p style={{ margin: "0.75rem 0 0" }}>
          <Link to="/">← Back to search</Link>
        </p>
      </header>

      {rows.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          Nothing saved yet. Run a search and use <strong>Save to table</strong> on a card, or{" "}
          <strong>Save all on this page</strong>.
        </p>
      ) : (
        <>
          <div style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <span style={{ color: "var(--muted)" }}>
              <strong>{rows.length}</strong> row{rows.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Remove all saved rows from this browser?")) clearAll();
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
                  <th style={{ padding: "0.65rem 0.75rem", minWidth: 120 }}>Name</th>
                  <th style={{ padding: "0.65rem 0.75rem", minWidth: 100 }}>Login</th>
                  <th style={{ padding: "0.65rem 0.75rem", minWidth: 140 }}>Location</th>
                  <th style={{ padding: "0.65rem 0.75rem", minWidth: 160 }}>Email</th>
                  <th style={{ padding: "0.65rem 0.75rem", minWidth: 220 }}>Note</th>
                  <th style={{ padding: "0.65rem 0.75rem", whiteSpace: "nowrap" }}>Saved</th>
                  <th style={{ padding: "0.65rem 0.75rem" }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
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
                      <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "top", wordBreak: "break-all" }}>
                        {p.email ? (
                          <a href={`mailto:${p.email}`}>{p.email}</a>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "top", minWidth: 240 }}>
                        <textarea
                          value={row.note}
                          onChange={(e) => setNote(row.login, e.target.value)}
                          rows={3}
                          placeholder="Your notes…"
                          style={{
                            width: "100%",
                            minWidth: 200,
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
                          onClick={() => remove(row.login)}
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
        </>
      )}
    </div>
  );
}
