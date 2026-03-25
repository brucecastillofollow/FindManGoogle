import { loadAutomatedSearchNextPage, saveAutomatedSearchNextPage } from "./autoSearchPageRepo.js";
import { userToContact } from "./github/extractContact.js";
import { GitHubClient, enrichLogins } from "./github/githubClient.js";
import { KeyPool, getAllTokens } from "./github/keyPool.js";
import { appendSearchResults } from "./searchHistoryRepo.js";
import { upsertPersonSnapshot } from "./savedRepo.js";

/** Default spacing between automated runs (override with `AUTO_SEARCH_INTERVAL_MS`). */
export const AUTOMATED_SEARCH_SUCCESS_COOLDOWN_MS = 90_000;

export type AutomatedSearchState = {
  ok: boolean;
  query: string;
  /** GitHub Search `total_count` for the automated query (full index, not just page 1). */
  totalCount: number | null;
  incompleteResults: boolean | null;
  ranAt: string | null;
  error: string | null;
  /** First-page `per_page` used for search + enrich. */
  perPage: number | null;
  /** Profiles upserted into `saved_people` this run (same as manual “Save to table”). */
  savedToDbCount: number | null;
  /** GitHub Search API page used for this run (rotates each success for different users). */
  searchPage: number | null;
};

let state: AutomatedSearchState = {
  ok: false,
  query: "",
  totalCount: null,
  incompleteResults: null,
  ranAt: null,
  error: null,
  perPage: null,
  savedToDbCount: null,
  searchPage: null,
};

export function getAutomatedSearchState(): AutomatedSearchState {
  return { ...state };
}

/** Runtime toggle (default: not paused). When true, automated search skips startup / token triggers. */
let automaticSearchPaused = false;

export function isAutomaticSearchPaused(): boolean {
  return automaticSearchPaused;
}

let scheduledAutoSearchTimer: ReturnType<typeof setTimeout> | null = null;
/** ISO time when the next queued automatic run is expected to start (null if none). */
let nextScheduledAutoSearchAt: string | null = null;

function clearScheduledAutomatedSearch(): void {
  if (scheduledAutoSearchTimer != null) {
    clearTimeout(scheduledAutoSearchTimer);
    scheduledAutoSearchTimer = null;
  }
  nextScheduledAutoSearchAt = null;
}

function getAutoSearchIntervalMs(): number {
  const raw = process.env.AUTO_SEARCH_INTERVAL_MS;
  if (raw == null || raw.trim() === "") return AUTOMATED_SEARCH_SUCCESS_COOLDOWN_MS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return AUTOMATED_SEARCH_SUCCESS_COOLDOWN_MS;
  return Math.min(3_600_000, Math.max(5_000, n));
}

/**
 * After a run that hit GitHub, queue the next automatic run (spacing + token rotation).
 * Clears any previous timer so only one next run is pending.
 */
function scheduleFollowingAutomatedSearch(): void {
  clearScheduledAutomatedSearch();
  if (automaticSearchPaused) return;
  if (process.env.AUTO_SEARCH_ENABLED === "false") return;
  if (getAllTokens().length === 0) return;

  const delay = getAutoSearchIntervalMs();
  nextScheduledAutoSearchAt = new Date(Date.now() + delay).toISOString();
  scheduledAutoSearchTimer = setTimeout(() => {
    scheduledAutoSearchTimer = null;
    nextScheduledAutoSearchAt = null;
    void runAutomatedSearchOnStartup();
  }, delay);
}

export function setAutomaticSearchPaused(paused: boolean): void {
  automaticSearchPaused = paused;
  if (paused) clearScheduledAutomatedSearch();
}

/** GitHub Search only returns the first 1000 results for any query. */
const GITHUB_SEARCH_MAX_RESULTS = 1000;

function maxAccessibleSearchPage(totalCount: number, perPage: number): number {
  const pp = Math.max(1, perPage);
  const accessible = Math.min(Math.max(0, totalCount), GITHUB_SEARCH_MAX_RESULTS);
  return Math.max(1, Math.ceil(accessible / pp));
}

export function getNextScheduledAutoSearchAt(): string | null {
  return nextScheduledAutoSearchAt;
}

/** When the next automated search is allowed after a successful run (server-side spacing). */
export function getAutomatedSearchCooldownInfo() {
  const enabled = process.env.AUTO_SEARCH_ENABLED !== "false";
  const spacingMs = getAutoSearchIntervalMs();
  const scheduledAt = nextScheduledAutoSearchAt;
  const lastOk = state.ok && !state.error;
  if (!lastOk || !state.ranAt) {
    return {
      enabled,
      cooldownMs: spacingMs,
      inCooldown: false,
      nextAllowedAt: null as string | null,
      msRemaining: 0,
      lastRunAt: state.ranAt,
      lastSavedToDb: state.savedToDbCount,
      nextScheduledRunAt: scheduledAt,
      note:
        state.error && state.ranAt
          ? "Last automated run failed — fix tokens/GitHub errors, then use Resume or manual Search. Automatic scheduling resumes after a successful run."
          : "No successful automated run yet (needs tokens and AUTO_SEARCH_ENABLED). When a run succeeds, the next run is scheduled automatically.",
    };
  }
  const ran = new Date(state.ranAt).getTime();
  const next = ran + spacingMs;
  const now = Date.now();
  if (now >= next) {
    return {
      enabled,
      cooldownMs: spacingMs,
      inCooldown: false,
      nextAllowedAt: null as string | null,
      msRemaining: 0,
      lastRunAt: state.ranAt,
      lastSavedToDb: state.savedToDbCount,
      nextScheduledRunAt: scheduledAt,
      note: scheduledAt
        ? `Automatic runs are on: next search is scheduled for ${new Date(scheduledAt).toLocaleString()} (spacing ${spacingMs / 1000}s, rotating search pages + PATs). Profiles are saved to SQLite each run.`
        : "Spacing window is open; if automatic search is active, the next run is queued after each successful save.",
    };
  }
  return {
    enabled,
    cooldownMs: spacingMs,
    inCooldown: true,
    nextAllowedAt: new Date(next).toISOString(),
    msRemaining: next - now,
    lastRunAt: state.ranAt,
    lastSavedToDb: state.savedToDbCount,
    nextScheduledRunAt: scheduledAt,
    note: `Waiting ${spacingMs / 1000}s before another automated run can start (spacing). ${scheduledAt ? `Next run at ${new Date(scheduledAt).toLocaleString()}.` : ""} Manual Search is not blocked.`,
  };
}

let runQueue: Promise<void> = Promise.resolve();

const DEFAULT_QUERY = 'location:"United States" type:user';

/** Default 15, max 30 to align with interactive search and limit user API calls. */
function getAutoSearchPerPage(): number {
  const raw = process.env.AUTO_SEARCH_PER_PAGE;
  const n = raw ? parseInt(raw, 10) : 15;
  if (Number.isNaN(n)) return 15;
  return Math.min(30, Math.max(1, n));
}

export type RunAutomatedSearchOptions = {
  /** Skip the 90s minimum gap (used by Resume so a run starts immediately). */
  force?: boolean;
};

/**
 * Runs after server startup and when tokens first become available via POST /api/tokens.
 * Queued so overlapping triggers do not run two searches in parallel.
 */
export function runAutomatedSearchOnStartup(opts?: RunAutomatedSearchOptions): Promise<void> {
  const p = runQueue.then(() => runAutomatedSearchOnce(!!opts?.force));
  runQueue = p.catch(() => {});
  return p;
}

async function runAutomatedSearchOnce(force = false): Promise<void> {
  const enabled = process.env.AUTO_SEARCH_ENABLED !== "false";
  const q = process.env.AUTO_SEARCH_QUERY?.trim() || DEFAULT_QUERY;
  const perPage = getAutoSearchPerPage();

  if (!force && state.ok && state.ranAt && !state.error) {
    const spacingMs = getAutoSearchIntervalMs();
    const age = Date.now() - new Date(state.ranAt).getTime();
    if (age >= 0 && age < spacingMs) {
      const wait = Math.max(500, spacingMs - age);
      console.log(
        `[auto-search] skip — last success ${Math.round(age / 1000)}s ago; rescheduling in ${Math.round(wait / 1000)}s`,
      );
      clearScheduledAutomatedSearch();
      if (!automaticSearchPaused && process.env.AUTO_SEARCH_ENABLED !== "false" && getAllTokens().length > 0) {
        nextScheduledAutoSearchAt = new Date(Date.now() + wait).toISOString();
        scheduledAutoSearchTimer = setTimeout(() => {
          scheduledAutoSearchTimer = null;
          nextScheduledAutoSearchAt = null;
          void runAutomatedSearchOnStartup();
        }, wait);
      }
      return;
    }
  }

  if (!enabled) {
    state = {
      ok: false,
      query: q,
      totalCount: null,
      incompleteResults: null,
      ranAt: new Date().toISOString(),
      error: "Automated search off (AUTO_SEARCH_ENABLED=false).",
      perPage,
      savedToDbCount: null,
      searchPage: null,
    };
    console.log("[auto-search] skipped (AUTO_SEARCH_ENABLED=false)");
    return;
  }

  if (automaticSearchPaused) {
    console.log("[auto-search] skipped (paused via API / UI)");
    return;
  }

  if (getAllTokens().length === 0) {
    state = {
      ok: false,
      query: q,
      totalCount: null,
      incompleteResults: null,
      ranAt: new Date().toISOString(),
      error: "No GitHub tokens configured. Set GITHUB_TOKENS or POST /api/tokens.",
      perPage,
      savedToDbCount: null,
      searchPage: null,
    };
    console.warn("[auto-search] skipped: no tokens");
    return;
  }

  const pool = new KeyPool(getAllTokens());
  const client = new GitHubClient(pool);

  let attemptedSearch = false;
  let page = Math.max(1, loadAutomatedSearchNextPage());

  try {
    attemptedSearch = true;
    let search = await client.searchUsers(q, page, perPage);
    let maxPage = maxAccessibleSearchPage(search.total_count, perPage);

    if (page > maxPage) {
      console.log(
        `[auto-search] persisted page ${page} > maxPage ${maxPage} (GitHub total_count=${search.total_count}); restarting from page 1`,
      );
      page = 1;
      search = await client.searchUsers(q, 1, perPage);
      maxPage = maxAccessibleSearchPage(search.total_count, perPage);
    }

    const logins = search.items.map((i) => i.login);

    if (logins.length === 0) {
      const nextPage = page >= maxPage ? 1 : page + 1;
      saveAutomatedSearchNextPage(nextPage);

      state = {
        ok: true,
        query: q,
        totalCount: search.total_count,
        incompleteResults: search.incomplete_results,
        ranAt: new Date().toISOString(),
        error: null,
        perPage,
        savedToDbCount: 0,
        searchPage: page,
      };
      console.log(
        `[auto-search] ok total_count=${search.total_count} saved=0 (no items) page=${page} q=${q.slice(0, 80)}…`,
      );
      return;
    }

    const concurrency = Math.min(10, Math.max(3, getAllTokens().length));
    const details = await enrichLogins(client, logins, concurrency);
    const people = details.map(userToContact);

    let savedToDbCount = 0;
    for (const person of people) {
      upsertPersonSnapshot(person);
      savedToDbCount++;
    }

    appendSearchResults(q, people);

    const nextPage = page >= maxPage ? 1 : page + 1;
    saveAutomatedSearchNextPage(nextPage);

    state = {
      ok: true,
      query: q,
      totalCount: search.total_count,
      incompleteResults: search.incomplete_results,
      ranAt: new Date().toISOString(),
      error: null,
      perPage,
      savedToDbCount,
      searchPage: page,
    };
    console.log(
      `[auto-search] ok total_count=${search.total_count} saved_to_db=${savedToDbCount} page=${page}/${maxPage} per_page=${perPage} q=${q.slice(0, 80)}…`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state = {
      ok: false,
      query: q,
      totalCount: null,
      incompleteResults: null,
      ranAt: new Date().toISOString(),
      error: msg,
      perPage,
      savedToDbCount: null,
      searchPage: attemptedSearch ? page : null,
    };
    console.warn(`[auto-search] failed: ${msg}`);
  } finally {
    if (attemptedSearch && !automaticSearchPaused) {
      scheduleFollowingAutomatedSearch();
    }
  }
}
