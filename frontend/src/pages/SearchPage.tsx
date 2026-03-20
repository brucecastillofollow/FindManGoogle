import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../apiBase";
import { PersonCard } from "../components/PersonCard";
import { useSavedPeople } from "../SavedPeopleContext";
import type { SearchHistoryRow, SearchResponse } from "../types";

const defaultQuery = 'location:"United States" type:user';

/** GitHub Search API: max `per_page` for user search (also our UI cap). */
export const GITHUB_SEARCH_MAX_PER_PAGE = 30;

type AutomatedSnapshot = {
  ok: boolean;
  query: string;
  totalCount: number | null;
  incompleteResults: boolean | null;
  ranAt: string | null;
  error: string | null;
  perPage: number | null;
  savedToDbCount: number | null;
  /** GitHub Search API page for this automated run (backend cycles pages between runs). */
  searchPage?: number | null;
};

type GithubRateLimitRow = {
  resource: string;
  limit: number | null;
  remaining: number | null;
  used: number | null;
  reset: number | null;
  updatedAt: string;
  secondsUntilReset: number | null;
  resetAtIso: string | null;
};

type PerTokenRateLimitRow = GithubRateLimitRow & {
  tokenSuffix: string;
};

type AutomatedCooldownInfo = {
  enabled: boolean;
  cooldownMs: number;
  inCooldown: boolean;
  nextAllowedAt: string | null;
  msRemaining: number;
  lastRunAt: string | null;
  lastSavedToDb: number | null;
  /** When the backend will start the next automatic search (if not paused). */
  nextScheduledRunAt?: string | null;
  note: string;
};

type StatsResponse = {
  automated: AutomatedSnapshot;
  automatedCooldown: AutomatedCooldownInfo;
  automaticSearchPaused?: boolean;
  githubRateLimits: GithubRateLimitRow[];
  githubRateLimitsByToken?: PerTokenRateLimitRow[];
  contactedCount: number;
  savedTotal: number;
};

function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const sec = s % 60;
  const min = m % 60;
  if (h > 0) return `${h}h ${min}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

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
  const [autoControlBusy, setAutoControlBusy] = useState(false);

  const fetchStats = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setStatsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/stats"));
      if (!res.ok) return;
      const j = (await res.json()) as StatsResponse;
      setStats(j);
    } catch {
      /* ignore */
    } finally {
      if (!opts?.silent) setStatsLoading(false);
    }
  }, []);

  const [searchHistory, setSearchHistory] = useState<SearchHistoryRow[]>([]);
  const [searchHistoryLoading, setSearchHistoryLoading] = useState(true);

  const fetchSearchHistory = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setSearchHistoryLoading(true);
    try {
      const res = await fetch(apiUrl("/api/search/history?limit=10"));
      if (!res.ok) {
        setSearchHistory([]);
        return;
      }
      const j = (await res.json()) as { rows?: SearchHistoryRow[] };
      setSearchHistory(Array.isArray(j.rows) ? j.rows : []);
    } catch {
      setSearchHistory([]);
    } finally {
      if (!opts?.silent) setSearchHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSearchHistory();
  }, [fetchSearchHistory]);

  const githubMatchesDisplay = useMemo(() => {
    if (statsLoading && !stats?.automated?.ranAt) return null;
    const a = stats?.automated;
    if (!a) return "—";
    if (a.ok && a.totalCount != null) return a.totalCount.toLocaleString();
    return "—";
  }, [stats, statsLoading]);

  const [clock, setClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClock((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void fetchStats();
    // Auto-search runs ~750ms after backend start; refresh stats + saved rows after it can finish.
    const t1 = setTimeout(() => {
      void fetchStats();
      void refreshSaved();
      void fetchSearchHistory({ silent: true });
    }, 1200);
    const t2 = setTimeout(() => {
      void fetchStats();
      void refreshSaved();
      void fetchSearchHistory({ silent: true });
    }, 3500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fetchStats, refreshSaved, fetchSearchHistory]);

  useEffect(() => {
    const id = setInterval(() => {
      void fetchStats({ silent: true });
      void refreshSaved();
      void fetchSearchHistory({ silent: true });
    }, 5000);
    return () => clearInterval(id);
  }, [fetchStats, refreshSaved, fetchSearchHistory]);

  const automatedCooldownLeftMs = useMemo(() => {
    void clock;
    const c = stats?.automatedCooldown;
    if (!c?.inCooldown || !c.nextAllowedAt) return 0;
    return Math.max(0, new Date(c.nextAllowedAt).getTime() - Date.now());
  }, [stats?.automatedCooldown, clock]);

  const nextAutoRunInMs = useMemo(() => {
    void clock;
    const iso = stats?.automatedCooldown?.nextScheduledRunAt;
    if (!iso) return null as number | null;
    return Math.max(0, new Date(iso).getTime() - Date.now());
  }, [stats?.automatedCooldown?.nextScheduledRunAt, clock]);

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
  const [searchElapsedSec, setSearchElapsedSec] = useState(0);
  const [searchProgress, setSearchProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);

  useEffect(() => {
    if (!loading) {
      setSearchElapsedSec(0);
      setSearchProgress(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setSearchElapsedSec((Date.now() - t0) / 1000);
      setSearchProgress((p) => Math.min(92, p + 1.2 + Math.random() * 2));
    }, 100);
    return () => clearInterval(id);
  }, [loading]);

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
      void fetchSearchHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [query, page, perPage, fetchSearchHistory]);

  const saveCurrentPage = useCallback(async () => {
    if (!result?.people.length) return;
    await Promise.all(result.people.map((p) => addOrUpdatePerson(p)));
  }, [result, addOrUpdatePerson]);

  const pauseAutomaticSearch = useCallback(async () => {
    setAutoControlBusy(true);
    try {
      const res = await fetch(apiUrl("/api/automated-search/pause"), { method: "POST" });
      if (!res.ok) return;
      await fetchStats({ silent: true });
    } finally {
      setAutoControlBusy(false);
    }
  }, [fetchStats]);

  const resumeAutomaticSearch = useCallback(async () => {
    setAutoControlBusy(true);
    try {
      const res = await fetch(apiUrl("/api/automated-search/resume"), { method: "POST" });
      if (!res.ok) return;
      await fetchStats();
      void refreshSaved();
      setTimeout(() => void refreshSaved(), 2500);
    } finally {
      setAutoControlBusy(false);
    }
  }, [fetchStats, refreshSaved]);

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
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <strong style={{ fontSize: "0.95rem" }}>Recent search history</strong>
          <button
            type="button"
            onClick={() => void fetchSearchHistory()}
            disabled={searchHistoryLoading}
            style={{ padding: "0.3rem 0.6rem", borderRadius: 6, fontSize: "0.85rem", cursor: searchHistoryLoading ? "wait" : "pointer" }}
          >
            Refresh
          </button>
        </div>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "var(--muted)" }}>
          Last <strong>10</strong> profiles returned from any search (manual or automated), newest first. Stored in SQLite.
        </p>
        {searchHistoryLoading && !searchHistory.length ? (
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>Loading…</p>
        ) : searchHistory.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>
            No history yet — run a search below or use automated search (when tokens are set).
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.82rem",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>Login</th>
                  <th style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>Name</th>
                  <th style={{ padding: "0.45rem 0.5rem" }}>Location</th>
                  <th style={{ padding: "0.45rem 0.5rem" }}>Email</th>
                  <th style={{ padding: "0.45rem 0.5rem", minWidth: 140 }}>Query</th>
                  <th style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>When</th>
                </tr>
              </thead>
              <tbody>
                {searchHistory.map((row) => {
                  const p = row.person;
                  return (
                    <tr key={`${row.id}-${row.login}`} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.4rem 0.5rem", fontWeight: 600 }}>
                        <a href={p.githubUrl} target="_blank" rel="noreferrer">
                          {p.login}
                        </a>
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>{p.name ?? "—"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", maxWidth: 220 }}>{p.location ?? "—"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", maxWidth: 180, wordBreak: "break-all" }}>{p.email ?? "—"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", maxWidth: 280, wordBreak: "break-word" }}>
                        <code style={{ fontSize: "0.75rem" }}>{row.query.length > 90 ? `${row.query.slice(0, 90)}…` : row.query}</code>
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {new Date(row.searchedAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Automatic search:{" "}
              <strong style={{ color: stats?.automaticSearchPaused ? "var(--err)" : "var(--ok)" }}>
                {stats?.automaticSearchPaused ? "Paused" : "Active"}
              </strong>
            </span>
            {stats?.automaticSearchPaused ? (
              <button
                type="button"
                disabled={autoControlBusy}
                onClick={() => void resumeAutomaticSearch()}
                style={{
                  padding: "0.3rem 0.65rem",
                  borderRadius: 6,
                  fontSize: "0.85rem",
                  cursor: autoControlBusy ? "wait" : "pointer",
                  border: "1px solid var(--ok)",
                  background: "rgba(63, 185, 80, 0.12)",
                  color: "var(--ok)",
                  fontWeight: 600,
                }}
              >
                Resume automatic search
              </button>
            ) : (
              <button
                type="button"
                disabled={autoControlBusy}
                onClick={() => void pauseAutomaticSearch()}
                style={{
                  padding: "0.3rem 0.65rem",
                  borderRadius: 6,
                  fontSize: "0.85rem",
                  cursor: autoControlBusy ? "wait" : "pointer",
                  border: "1px solid var(--muted)",
                  background: "var(--panel)",
                  color: "var(--text)",
                }}
              >
                Pause automatic search
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void fetchStats();
                void refreshSaved();
                void fetchSearchHistory({ silent: true });
              }}
              style={{ padding: "0.3rem 0.6rem", borderRadius: 6, fontSize: "0.85rem", cursor: "pointer" }}
            >
              Refresh metrics
            </button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
          After the backend is up, it runs an automated search (~0.75s delay), then <strong>schedules the next run</strong>{" "}
          automatically (default <code>AUTO_SEARCH_INTERVAL_MS=90000</code>). Each run uses the next GitHub Search page (cycles
          within the 1000-result cap), rotates PATs per request, enriches users, and <strong>upserts into SQLite</strong>.{" "}
          <strong>Pause</strong> stops the timer; <strong>Resume</strong> runs once immediately, then automatic scheduling
          continues. <strong>Contacted</strong> = saved rows with a note.
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
                    (page size {stats.automated.perPage}
                    {stats.automated.searchPage != null ? (
                      <>
                        , GitHub search page <strong>{stats.automated.searchPage}</strong>
                      </>
                    ) : null}
                    )
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
              <strong>total_count</strong> = SQLite <code>COUNT(*)</code> (your saved rows). GitHub Search returns at most{" "}
              <strong>{GITHUB_SEARCH_MAX_PER_PAGE}</strong> users per API page — your DB can grow beyond that.
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.75rem",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          <strong style={{ fontSize: "0.9rem" }}>GitHub API &amp; automated-search timing</strong>
          <p style={{ margin: "0.35rem 0 0.75rem", fontSize: "0.8rem", color: "var(--muted)" }}>
            <strong>Automated search writes to SQLite</strong> on every successful run (same upsert as “Save to table”). The
            backend <strong>queues the next run</strong> after each attempt (spacing from <code>AUTO_SEARCH_INTERVAL_MS</code>,
            default 90s). PATs rotate on each API call; the GitHub Search <strong>page number</strong> advances each run so you
            get different users when the index has more than one page. Rate limits below come from GitHub (
            <code>X-RateLimit-*</code>).
          </p>

          {stats?.automatedCooldown ? (
            <div style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Automated search (server-only spacing)</div>
              <p style={{ margin: "0 0 0.5rem", color: "var(--muted)" }}>{stats.automatedCooldown.note}</p>
              {stats.automatedCooldown.inCooldown && stats.automatedCooldown.nextAllowedAt ? (
                <p style={{ margin: "0 0 0.35rem" }}>
                  <strong>Spacing</strong> until another run can start:{" "}
                  <strong style={{ color: "var(--accent)" }}>{formatDurationMs(automatedCooldownLeftMs)}</strong>
                  <span style={{ color: "var(--muted)", marginLeft: "0.5rem" }}>
                    (clock: {new Date(stats.automatedCooldown.nextAllowedAt).toLocaleTimeString()})
                  </span>
                </p>
              ) : stats.automated?.ok && stats.automated.ranAt ? (
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                  Spacing window is open. Last success: {new Date(stats.automated.ranAt).toLocaleString()}.
                  {stats.automaticSearchPaused ? (
                    <> Automatic runs are paused — use Resume to continue.</>
                  ) : stats.automatedCooldown.nextScheduledRunAt && nextAutoRunInMs != null ? (
                    <>
                      {" "}
                      Next automatic run in{" "}
                      <strong style={{ color: "var(--accent)" }}>{formatDurationMs(nextAutoRunInMs)}</strong> (
                      {new Date(stats.automatedCooldown.nextScheduledRunAt).toLocaleString()}).
                    </>
                  ) : (
                    <> Next run is queued after the last API attempt completes.</>
                  )}
                </p>
              ) : (
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                  Spacing applies between successful runs. Fix errors above or run Search manually; when a run succeeds, the
                  server schedules the next one automatically.
                </p>
              )}
              {stats.automatedCooldown.lastRunAt ? (
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  Last automated attempt: {new Date(stats.automatedCooldown.lastRunAt).toLocaleString()} · Profiles saved
                  that run: {stats.automatedCooldown.lastSavedToDb ?? "—"}
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ fontWeight: 600, marginBottom: "0.35rem", fontSize: "0.85rem" }}>
            GitHub rate limits <span style={{ fontWeight: 400, color: "var(--muted)" }}>(per PAT)</span>
          </div>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "var(--muted)" }}>
            Each token has its <strong>own</strong> quota. Rows show the last response that used PAT ending in{" "}
            <code>…suffix</code> for that resource (<code>core</code> vs <code>search</code>). Three PATs ⇒ up to three rows
            per resource after traffic uses each token.
          </p>
          {!stats?.githubRateLimitsByToken?.length ? (
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
              No per-token data yet — run a <strong>Search</strong> (uses multiple tokens) or wait for automated search.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "0.35rem" }}>PAT …</th>
                    <th style={{ padding: "0.35rem" }}>Resource</th>
                    <th style={{ padding: "0.35rem" }}>Remaining</th>
                    <th style={{ padding: "0.35rem" }}>Limit</th>
                    <th style={{ padding: "0.35rem" }}>Resets in</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.githubRateLimitsByToken.map((r) => (
                    <tr key={`${r.tokenSuffix}-${r.resource}`} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.35rem", fontFamily: "ui-monospace, monospace" }}>…{r.tokenSuffix}</td>
                      <td style={{ padding: "0.35rem" }}>
                        <code>{r.resource}</code>
                      </td>
                      <td style={{ padding: "0.35rem" }}>{r.remaining ?? "—"}</td>
                      <td style={{ padding: "0.35rem" }}>{r.limit ?? "—"}</td>
                      <td style={{ padding: "0.35rem" }}>
                        {r.secondsUntilReset != null ? (
                          <>
                            <strong>{formatDurationMs(r.secondsUntilReset * 1000)}</strong>
                            {r.resetAtIso ? (
                              <span style={{ color: "var(--muted)", marginLeft: "0.35rem" }}>
                                ({new Date(r.resetAtIso).toLocaleString()})
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.72rem", color: "var(--muted)" }}>
            <code>search</code> = Search API; <code>core</code> = most REST (e.g. <code>/users/:login</code>). Panel polls
            every 5s.
          </p>
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
            Per page (max {GITHUB_SEARCH_MAX_PER_PAGE})
            <input
              type="number"
              min={1}
              max={GITHUB_SEARCH_MAX_PER_PAGE}
              value={perPage}
              onChange={(e) =>
                setPerPage(Math.min(GITHUB_SEARCH_MAX_PER_PAGE, Number(e.target.value) || 15))
              }
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

        {loading ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: "0.5rem",
              padding: "0.75rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600 }}>Searching GitHub…</span>
              <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--muted)" }}>
                {searchElapsedSec.toFixed(1)}s elapsed
              </span>
            </div>
            <div
              style={{
                marginTop: "0.5rem",
                height: 6,
                borderRadius: 3,
                background: "var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${searchProgress}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, var(--accent), #79c0ff)",
                  borderRadius: 3,
                  transition: "width 0.15s ease-out",
                }}
              />
            </div>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
              Progress is approximate (GitHub rate limits / network). Time shows wall-clock duration for this request.
            </p>
          </div>
        ) : null}
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
            GitHub index <strong>total_count</strong>: <strong>{result.totalCount.toLocaleString()}</strong>
            {result.incompleteResults ? " (incomplete_results)" : ""} · This page: <strong>{result.people.length}</strong>{" "}
            (max <strong>{GITHUB_SEARCH_MAX_PER_PAGE}</strong> per request) · Page <strong>{result.page}</strong> · Tokens:{" "}
            <strong>{result.usedTokens}</strong> · <strong>Database total_count</strong> (saved rows):{" "}
            <strong>{savedTotalDisplay.toLocaleString()}</strong>
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
