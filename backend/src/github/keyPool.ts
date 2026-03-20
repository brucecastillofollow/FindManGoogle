function parseTokensFromEnv(): string[] {
  const raw = process.env.GITHUB_TOKENS ?? "";
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** In-memory tokens (e.g. set from POST /api/tokens); merged with env on read. */
let extraTokens: string[] = [];

export function setRuntimeTokens(tokens: string[]): void {
  extraTokens = tokens.map((t) => t.trim()).filter(Boolean);
}

export function getAllTokens(): string[] {
  const fromEnv = parseTokensFromEnv();
  const merged = [...fromEnv, ...extraTokens];
  return [...new Set(merged)];
}

export class KeyPool {
  private idx = 0;
  private cooldownUntil = new Map<string, number>();

  constructor(private tokens: string[]) {}

  refreshTokens(): void {
    this.tokens = getAllTokens();
  }

  get size(): number {
    return this.tokens.length;
  }

  /** Milliseconds until some token leaves cooldown (0 if one is ready or pool empty). */
  msUntilNextAvailable(): number {
    this.refreshTokens();
    if (this.tokens.length === 0) return 0;
    const now = Date.now();
    const ready = this.tokens.some((t) => (this.cooldownUntil.get(t) ?? 0) <= now);
    if (ready) return 0;
    const minUntil = Math.min(...this.tokens.map((t) => this.cooldownUntil.get(t) ?? 0));
    return Math.max(0, minUntil - now);
  }

  /** Pick next token not in cooldown; null if all are cooling down. */
  next(): string | null {
    this.refreshTokens();
    if (this.tokens.length === 0) return null;
    const now = Date.now();
    const available = this.tokens.filter((t) => (this.cooldownUntil.get(t) ?? 0) <= now);
    if (available.length === 0) return null;
    const t = available[this.idx % available.length]!;
    this.idx++;
    return t;
  }

  /** GitHub returns reset time in seconds since epoch in headers; use conservative cooldown. */
  cooldown(token: string, resetAtUnixSec?: number): void {
    const now = Date.now();
    const resetMs = resetAtUnixSec ? resetAtUnixSec * 1000 : now + 60_000;
    this.cooldownUntil.set(token, Math.max(resetMs, now + 5_000));
  }
}
