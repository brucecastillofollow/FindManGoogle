import { userToContact } from "./github/extractContact.js";
import { GitHubClient, enrichLogins } from "./github/githubClient.js";
import { KeyPool, getAllTokens } from "./github/keyPool.js";
import { upsertPersonSnapshot } from "./savedRepo.js";

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
};

export function getAutomatedSearchState(): AutomatedSearchState {
  return { ...state };
}

/** Avoid duplicate full runs when tokens arrive via POST just before the delayed startup job. */
const MIN_MS_BETWEEN_SUCCESSFUL_RUNS = 90_000;

let runQueue: Promise<void> = Promise.resolve();

const DEFAULT_QUERY = 'location:"United States" type:user';

/** Default 15, max 30 to align with interactive search and limit user API calls. */
function getAutoSearchPerPage(): number {
  const raw = process.env.AUTO_SEARCH_PER_PAGE;
  const n = raw ? parseInt(raw, 10) : 15;
  if (Number.isNaN(n)) return 15;
  return Math.min(30, Math.max(1, n));
}

/**
 * Runs after server startup and when tokens first become available via POST /api/tokens.
 * Queued so overlapping triggers do not run two searches in parallel.
 */
export function runAutomatedSearchOnStartup(): Promise<void> {
  const p = runQueue.then(() => runAutomatedSearchOnce());
  runQueue = p.catch(() => {});
  return p;
}

async function runAutomatedSearchOnce(): Promise<void> {
  const enabled = process.env.AUTO_SEARCH_ENABLED !== "false";
  const q = process.env.AUTO_SEARCH_QUERY?.trim() || DEFAULT_QUERY;
  const perPage = getAutoSearchPerPage();

  if (state.ok && state.ranAt) {
    const age = Date.now() - new Date(state.ranAt).getTime();
    if (age >= 0 && age < MIN_MS_BETWEEN_SUCCESSFUL_RUNS && !state.error) {
      console.log(
        `[auto-search] skip — completed successfully ${Math.round(age / 1000)}s ago (cooldown ${MIN_MS_BETWEEN_SUCCESSFUL_RUNS / 1000}s)`,
      );
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
    };
    console.log("[auto-search] skipped (AUTO_SEARCH_ENABLED=false)");
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
    };
    console.warn("[auto-search] skipped: no tokens");
    return;
  }

  const pool = new KeyPool(getAllTokens());
  const client = new GitHubClient(pool);

  try {
    const search = await client.searchUsers(q, 1, perPage);
    const logins = search.items.map((i) => i.login);

    if (logins.length === 0) {
      state = {
        ok: true,
        query: q,
        totalCount: search.total_count,
        incompleteResults: search.incomplete_results,
        ranAt: new Date().toISOString(),
        error: null,
        perPage,
        savedToDbCount: 0,
      };
      console.log(
        `[auto-search] ok total_count=${search.total_count} saved=0 (no items) q=${q.slice(0, 80)}…`,
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

    state = {
      ok: true,
      query: q,
      totalCount: search.total_count,
      incompleteResults: search.incomplete_results,
      ranAt: new Date().toISOString(),
      error: null,
      perPage,
      savedToDbCount,
    };
    console.log(
      `[auto-search] ok total_count=${search.total_count} saved_to_db=${savedToDbCount} per_page=${perPage} q=${q.slice(0, 80)}…`,
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
    };
    console.warn(`[auto-search] failed: ${msg}`);
  }
}
