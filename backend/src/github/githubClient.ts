import type { GitHubUserDetail, GitHubUserSearchItem } from "../types.js";
import { KeyPool } from "./keyPool.js";

const GITHUB_API = "https://api.github.com";
const ACCEPT = "application/vnd.github+json";
const API_VERSION = "2022-11-28";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
