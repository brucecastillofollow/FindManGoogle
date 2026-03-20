import { Router } from "express";
import { z } from "zod";
import type { SearchResponse } from "../types.js";
import { userToContact } from "../github/extractContact.js";
import { GitHubClient, enrichLogins } from "../github/githubClient.js";
import { KeyPool, getAllTokens, setRuntimeTokens } from "../github/keyPool.js";

const pool = new KeyPool(getAllTokens());
const client = new GitHubClient(pool);

const searchQuerySchema = z.object({
  q: z.string().min(1, "Query required"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(30).default(15),
});

const tokensBodySchema = z.object({
  tokens: z.array(z.string()).min(1),
});

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, tokenCount: getAllTokens().length });
});

apiRouter.get("/tokens/status", (_req, res) => {
  const n = getAllTokens().length;
  res.json({ configured: n > 0, count: n });
});

apiRouter.post("/tokens", (req, res) => {
  const parsed = tokensBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  setRuntimeTokens(parsed.data.tokens);
  res.json({ ok: true, count: getAllTokens().length });
});

apiRouter.get("/search", async (req, res) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { q, page, perPage } = parsed.data;

  if (getAllTokens().length === 0) {
    res.status(400).json({
      error: "No tokens. Set GITHUB_TOKENS in .env or POST /api/tokens with { \"tokens\": [\"ghp_...\"] }",
    });
    return;
  }

  try {
    const search = await client.searchUsers(q, page, perPage);
    const logins = search.items.map((i) => i.login);
    const concurrency = Math.min(10, Math.max(3, getAllTokens().length));
    const details = await enrichLogins(client, logins, concurrency);
    const people = details.map(userToContact);

    const body: SearchResponse = {
      totalCount: search.total_count,
      incompleteResults: search.incomplete_results,
      people,
      page,
      perPage,
      usedTokens: getAllTokens().length,
    };
    res.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
});
