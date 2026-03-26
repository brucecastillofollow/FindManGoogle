import { userToContact } from "./github/extractContact.js";
import { GitHubClient, enrichLogins } from "./github/githubClient.js";
import { KeyPool, getAllTokens } from "./github/keyPool.js";
import { appendSearchResults } from "./searchHistoryRepo.js";
import { upsertPersonSnapshot } from "./savedRepo.js";
import { loadAutoSearchActive, loadAutoSearchQueue, saveAutoSearchActive, saveAutoSearchQueue } from "./autoSearchQueueRepo.js";

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

const DEFAULT_CREATED_FROM = "2008-01-01";
function utcTodayYmd(): string {
  // Use UTC to keep created: slicing stable regardless of local timezone.
  return new Date().toISOString().slice(0, 10);
}

function stripCreatedFilter(q: string): string {
  // Matches: created:YYYY-MM-DD..YYYY-MM-DD (GitHub-style date range).
  const stripped = q.replace(/\bcreated:\s*\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}\b/gi, "").trim();
  return stripped.replace(/\s+/g, " ");
}

function parseCreatedRange(q: string): { from: string; to: string } | null {
  const m = q.match(/\bcreated:\s*(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})\b/i);
  if (!m) return null;
  return { from: m[1]!, to: m[2]! };
}

function joinQueryCoreWithCreated(core: string, from: string, to: string): string {
  const created = `created:${from}..${to}`;
  if (!core || core.trim() === "") return created;
  return `${core} ${created}`;
}

function canSplitCreatedRange(from: string, to: string): boolean {
  // If the range is a single day, splitting would either overlap or be identical and can loop forever.
  return from !== to;
}

function splitCreatedRangeInTwo(
  rangeFrom: string,
  rangeTo: string,
): { olderFrom: string; olderTo: string; newerFrom: string; newerTo: string } {
  const dayMs = 86_400_000;
  // Convert to UTC day indices.
  const d0 = Math.floor(new Date(`${rangeFrom}T00:00:00.000Z`).getTime() / dayMs);
  const d1 = Math.floor(new Date(`${rangeTo}T00:00:00.000Z`).getTime() / dayMs);
  const lo = Math.min(d0, d1);
  const hi = Math.max(d0, d1);

  const days = hi - lo + 1;
  const mid = Math.floor(days / 2); // older covers [lo, lo+mid-1]

  const olderFrom = new Date(lo * dayMs).toISOString().slice(0, 10);
  const olderTo = new Date((lo + mid - 1) * dayMs).toISOString().slice(0, 10);
  const newerFrom = new Date((lo + mid) * dayMs).toISOString().slice(0, 10);
  const newerTo = new Date(hi * dayMs).toISOString().slice(0, 10);

  return { olderFrom, olderTo, newerFrom, newerTo };
}

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
  const perPage = getAutoSearchPerPage();
  const baseQuery = process.env.AUTO_SEARCH_QUERY?.trim() || DEFAULT_QUERY;
  const createdFromDefault = process.env.AUTO_SEARCH_CREATED_FROM?.trim() || DEFAULT_CREATED_FROM;
  const createdToDefault = process.env.AUTO_SEARCH_CREATED_TO?.trim() || utcTodayYmd();

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
      query: baseQuery,
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
      query: baseQuery,
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
  try {
    attemptedSearch = true;

    const baseCreatedParsed = parseCreatedRange(baseQuery);
    const splitRangeFrom = baseCreatedParsed?.from ?? createdFromDefault;
    const splitRangeTo = baseCreatedParsed?.to ?? createdToDefault;

    // Queue algorithm:
    // - If we have an active paging task, keep paging it.
    // - Otherwise, pop the oldest queued task, probe total_count, and either split or start paging it.
    let queue = loadAutoSearchQueue().sort((a, b) => a.rangeFrom.localeCompare(b.rangeFrom));
    let active = loadAutoSearchActive();

    if (!active && queue.length === 0) {
      // Initialize queue with a single “probe” task (default query).
      queue = [
        {
          q: baseQuery,
          rangeFrom: splitRangeFrom,
          rangeTo: splitRangeTo,
        },
      ];
      saveAutoSearchQueue(queue);
    }

    // Ensure we keep the "core" query consistent for splitting.
    const baseCore = stripCreatedFilter(baseQuery);

    if (active) {
      const page = Math.max(1, Math.floor(active.page));
      const totalCount = active.totalCount;
      const maxPage = maxAccessibleSearchPage(totalCount, perPage);

      // Safety: if we somehow got an invalid page beyond max, reset to 1.
      const pageToRun = page > maxPage ? 1 : page;
      const q = active.q;

      let search = await client.searchUsers(q, pageToRun, perPage);
      // Use stored totalCount for decision; refresh incomplete_results for UI.
      const logins = search.items.map((i) => i.login);

      let savedToDbCount = 0;
      if (logins.length > 0) {
        const concurrency = Math.min(10, Math.max(3, getAllTokens().length));
        const details = await enrichLogins(client, logins, concurrency);
        const people = details.map(userToContact);
        for (const person of people) {
          upsertPersonSnapshot(person);
          savedToDbCount++;
        }
        appendSearchResults(q, people);
      }

      const nextPage = pageToRun >= maxPage ? null : pageToRun + 1;
      if (nextPage == null) {
        saveAutoSearchActive(null);
      } else {
        saveAutoSearchActive({ ...active, page: nextPage });
      }

      state = {
        ok: true,
        query: q,
        totalCount,
        incompleteResults: search.incomplete_results,
        ranAt: new Date().toISOString(),
        error: null,
        perPage,
        savedToDbCount,
        searchPage: pageToRun,
      };

      console.log(
        `[auto-search] ok active total_count=${totalCount} saved_to_db=${savedToDbCount} page=${pageToRun}/${maxPage} per_page=${perPage} q=${q.slice(0, 80)}…`,
      );
      return;
    }

    // Pop the oldest queue item.
    queue = loadAutoSearchQueue().sort((a, b) => a.rangeFrom.localeCompare(b.rangeFrom));
    if (queue.length === 0) {
      // Should not happen because we initialize above, but be defensive.
      saveAutoSearchQueue([
        {
          q: baseQuery,
          rangeFrom: splitRangeFrom,
          rangeTo: splitRangeTo,
        },
      ]);
      state = {
        ok: false,
        query: baseQuery,
        totalCount: null,
        incompleteResults: null,
        ranAt: new Date().toISOString(),
        error: "Auto-search queue was empty; reinitialized. No work performed this run.",
        perPage,
        savedToDbCount: null,
        searchPage: null,
      };
      return;
    }

    const item = queue.shift()!;

    // Probe total_count with a cheap call (page 1, per_page 1).
    const probe = await client.searchUsers(item.q, 1, 1);
    const totalCount = probe.total_count;

    if (totalCount > 1000 && canSplitCreatedRange(item.rangeFrom, item.rangeTo)) {
      const core = stripCreatedFilter(item.q) || baseCore;

      const { olderFrom, olderTo, newerFrom, newerTo } = splitCreatedRangeInTwo(item.rangeFrom, item.rangeTo);

      const olderQ = joinQueryCoreWithCreated(core, olderFrom, olderTo);
      const newerQ = joinQueryCoreWithCreated(core, newerFrom, newerTo);

      queue.push(
        { q: olderQ, rangeFrom: olderFrom, rangeTo: olderTo },
        { q: newerQ, rangeFrom: newerFrom, rangeTo: newerTo },
      );
      queue.sort((a, b) => a.rangeFrom.localeCompare(b.rangeFrom));
      saveAutoSearchQueue(queue);

      state = {
        ok: true,
        query: item.q,
        totalCount,
        incompleteResults: probe.incomplete_results,
        ranAt: new Date().toISOString(),
        error: null,
        perPage,
        savedToDbCount: 0,
        searchPage: 1,
      };

      console.log(
        `[auto-search] ok probe split total_count=${totalCount} split=(${item.rangeFrom}..${item.rangeTo}) queue=${queue.length} q=${item.q.slice(0, 80)}…`,
      );
      return;
    }

    // total_count <= 1000 (or cannot split): start paging this popped item now.
    const maxPage = maxAccessibleSearchPage(totalCount, perPage);
    const pageToRun = 1;
    const q = item.q;

    let search = await client.searchUsers(q, pageToRun, perPage);
    const logins = search.items.map((i) => i.login);

    let savedToDbCount = 0;
    if (logins.length > 0) {
      const concurrency = Math.min(10, Math.max(3, getAllTokens().length));
      const details = await enrichLogins(client, logins, concurrency);
      const people = details.map(userToContact);
      for (const person of people) {
        upsertPersonSnapshot(person);
        savedToDbCount++;
      }
      appendSearchResults(q, people);
    }

    if (pageToRun >= maxPage) {
      // Commit queue removal + mark as finished (no active paging).
      saveAutoSearchQueue(queue);
      saveAutoSearchActive(null);
    } else {
      // Commit queue removal + mark as active paging.
      saveAutoSearchQueue(queue);
      saveAutoSearchActive({
        q,
        rangeFrom: item.rangeFrom,
        rangeTo: item.rangeTo,
        totalCount,
        page: pageToRun + 1,
      });
    }

    state = {
      ok: true,
      query: q,
      totalCount,
      incompleteResults: search.incomplete_results,
      ranAt: new Date().toISOString(),
      error: null,
      perPage,
      savedToDbCount,
      searchPage: pageToRun,
    };

    console.log(
      `[auto-search] ok page1 total_count=${totalCount} saved_to_db=${savedToDbCount} page=${pageToRun}/${maxPage} per_page=${perPage} q=${q.slice(0, 80)}…`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state = {
      ok: false,
      query: baseQuery,
      totalCount: null,
      incompleteResults: null,
      ranAt: new Date().toISOString(),
      error: msg,
      perPage,
      savedToDbCount: null,
      searchPage: null,
    };
    console.warn(`[auto-search] failed: ${msg}`);
  } finally {
    if (attemptedSearch && !automaticSearchPaused) {
      scheduleFollowingAutomatedSearch();
    }
  }
}
