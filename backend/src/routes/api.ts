import { Router } from "express";
import { z } from "zod";
import type { SearchResponse } from "../types.js";
import { userToContact } from "../github/extractContact.js";
import { GitHubClient, enrichLogins } from "../github/githubClient.js";
import { KeyPool, getAllTokens, setRuntimeTokens } from "../github/keyPool.js";
import { getAutomatedSearchState, runAutomatedSearchOnStartup } from "../automatedSearch.js";
import {
  countContacted,
  countSaved,
  deleteAllSaved,
  deleteSaved,
  listSaved,
  updateNote,
  upsertPersonSnapshot,
} from "../savedRepo.js";

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

const personContactSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  githubUrl: z.string(),
  avatarUrl: z.string(),
  location: z.string().nullable(),
  company: z.string().nullable(),
  email: z.string().nullable(),
  blog: z.string().nullable(),
  twitterUsername: z.string().nullable(),
  twitterUrl: z.string().nullable(),
  linkedInUrls: z.array(z.string()),
  otherSocialUrls: z.array(z.string()),
  phoneNumbers: z.array(z.string()),
  rawBio: z.string().nullable(),
});

const putSavedBodySchema = z.object({
  person: personContactSchema,
});

const patchNoteBodySchema = z.object({
  note: z.string(),
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
  const countBefore = getAllTokens().length;
  setRuntimeTokens(parsed.data.tokens);
  const countAfter = getAllTokens().length;
  res.json({ ok: true, count: countAfter });

  // Startup auto-search runs before tokens exist if you only paste PATs in the UI. Run once when tokens first appear.
  if (countBefore === 0 && countAfter > 0) {
    setTimeout(() => {
      void runAutomatedSearchOnStartup();
    }, 400);
  }
});

apiRouter.get("/stats", (_req, res) => {
  res.json({
    automated: getAutomatedSearchState(),
    contactedCount: countContacted(),
    savedTotal: countSaved(),
  });
});

apiRouter.get("/saved", (_req, res) => {
  res.json({ rows: listSaved() });
});

apiRouter.put("/saved/:login", (req, res) => {
  const loginParam = decodeURIComponent(req.params.login);
  const parsed = putSavedBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (parsed.data.person.login !== loginParam) {
    res.status(400).json({ error: "person.login must match URL login" });
    return;
  }
  const row = upsertPersonSnapshot(parsed.data.person);
  res.json(row);
});

apiRouter.patch("/saved/:login", (req, res) => {
  const loginParam = decodeURIComponent(req.params.login);
  const parsed = patchNoteBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = updateNote(loginParam, parsed.data.note);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

apiRouter.delete("/saved/:login", (req, res) => {
  const loginParam = decodeURIComponent(req.params.login);
  const ok = deleteSaved(loginParam);
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

apiRouter.delete("/saved", (_req, res) => {
  const deleted = deleteAllSaved();
  res.json({ ok: true, deleted });
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
