import type { GitHubUserDetail, GitHubUserSearchItem } from "../types.js";
import { KeyPool } from "./keyPool.js";

const GITHUB_API = "https://api.github.com";
const ACCEPT = "application/vnd.github+json";
const API_VERSION = "2022-11-28";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Last seen GitHub REST rate limit per `X-RateLimit-Resource` (e.g. `core`, `search`). */
export type RateLimitResourceSnapshot = {
  resource: string;
  limit: number | null;
  remaining: number | null;
  used: number | null;
  /** Unix seconds (UTC) when the quota resets */
  reset: number | null;
  updatedAt: string;
};

const rateLimitByResource = new Map<string, RateLimitResourceSnapshot>();

/** Last seen limits per PAT suffix + resource (each token has its own GitHub quota). */
export type PerTokenRateLimitSnapshot = RateLimitResourceSnapshot & {
  /** Last 6 chars of the token used for that request (identify which PAT). */
  tokenSuffix: string;
};

const rateLimitByTokenResource = new Map<string, PerTokenRateLimitSnapshot>();

function parseRateLimitSnapshot(headers: Headers): RateLimitResourceSnapshot {
  const resource = headers.get("x-ratelimit-resource") ?? "unknown";
  const lim = headers.get("x-ratelimit-limit");
  const rem = headers.get("x-ratelimit-remaining");
  const used = headers.get("x-ratelimit-used");
  const reset = headers.get("x-ratelimit-reset");
  return {
    resource,
    limit: lim ? parseInt(lim, 10) : null,
    remaining: rem ? parseInt(rem, 10) : null,
    used: used ? parseInt(used, 10) : null,
    reset: reset ? parseInt(reset, 10) : null,
    updatedAt: new Date().toISOString(),
  };
}

/** Record limits from a response; pass the bearer token so we track quota per PAT. */
function recordRateLimitFromResponse(headers: Headers, token: string) {
  const snap = parseRateLimitSnapshot(headers);
  rateLimitByResource.set(snap.resource, snap);

  const tokenSuffix = token.length >= 6 ? token.slice(-6) : token;
  const key = `${tokenSuffix}|${snap.resource}`;
  rateLimitByTokenResource.set(key, { ...snap, tokenSuffix });
}

export function getRateLimitSnapshots(): RateLimitResourceSnapshot[] {
  return [...rateLimitByResource.values()].sort((a, b) => a.resource.localeCompare(b.resource));
}

export function getPerTokenRateLimitSnapshots(): PerTokenRateLimitSnapshot[] {
  return [...rateLimitByTokenResource.values()].sort((a, b) => {
    const c = a.tokenSuffix.localeCompare(b.tokenSuffix);
    return c !== 0 ? c : a.resource.localeCompare(b.resource);
  });
}

export function withRateLimitTiming(s: RateLimitResourceSnapshot) {
  const nowSec = Math.floor(Date.now() / 1000);
  const reset = s.reset;
  const secondsUntilReset = reset != null ? Math.max(0, reset - nowSec) : null;
  return {
    ...s,
    secondsUntilReset,
    resetAtIso: reset != null ? new Date(reset * 1000).toISOString() : null,
  };
}

export class GitHubClient {
  constructor(private pool: KeyPool) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ data: T; headers: Headers }> {
    const errors: string[] = [];
    const maxAttempts = Math.max(12, this.pool.size * 4);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let token = this.pool.next();
      if (!token) {
        const wait = this.pool.msUntilNextAvailable();
        if (wait > 0 && attempt < maxAttempts - 1) {
          await sleep(Math.min(wait + 300, 120_000));
          token = this.pool.next();
        }
      }
      if (!token) throw new Error("No GitHub tokens configured. Set GITHUB_TOKENS or POST /api/tokens.");

      const res = await fetch(`${GITHUB_API}${path}`, {
        ...init,
        headers: {
          Accept: ACCEPT,
          "X-GitHub-Api-Version": API_VERSION,
          Authorization: `Bearer ${token}`,
          "User-Agent": "github-people-search",
          ...(init.headers as Record<string, string>),
        },
      });

      recordRateLimitFromResponse(res.headers, token);

      const reset = res.headers.get("x-ratelimit-reset");
      const resetSec = reset ? parseInt(reset, 10) : undefined;

      if (res.status === 403 || res.status === 429) {
        this.pool.cooldown(token, resetSec);
        errors.push(`${res.status} ${path} (token …${token.slice(-4)})`);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GitHub API ${res.status}: ${text.slice(0, 500)}`);
      }

      const data = (await res.json()) as T;
      return { data, headers: res.headers };
    }
    throw new Error(`GitHub rate limited on all tokens. Last errors: ${errors.join("; ")}`);
  }

  async searchUsers(
    q: string,
    page: number,
    perPage: number,
  ): Promise<{ items: GitHubUserSearchItem[]; total_count: number; incomplete_results: boolean }> {
    const params = new URLSearchParams({
      q,
      page: String(page),
      per_page: String(Math.min(100, Math.max(1, perPage))),
    });
    const { data } = await this.request<{
      items: GitHubUserSearchItem[];
      total_count: number;
      incomplete_results: boolean;
    }>(`/search/users?${params}`);
    return data;
  }

  async getUser(login: string): Promise<GitHubUserDetail> {
    const { data } = await this.request<GitHubUserDetail>(`/users/${encodeURIComponent(login)}`);
    return data;
  }
}

/** Fetch many users in parallel, distributing tokens via rotating client requests (each call picks next token). */
export async function enrichLogins(
  client: GitHubClient,
  logins: string[],
  concurrency: number,
): Promise<GitHubUserDetail[]> {
  const results: GitHubUserDetail[] = new Array(logins.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= logins.length) return;
      try {
        results[i] = await client.getUser(logins[i]!);
      } catch {
        results[i] = {
          login: logins[i]!,
          id: 0,
          name: null,
          company: null,
          blog: null,
          location: null,
          email: null,
          bio: null,
          twitter_username: null,
          html_url: `https://github.com/${logins[i]}`,
          avatar_url: "",
        };
      }
    }
  }

  const n = Math.max(1, Math.min(concurrency, logins.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
