# GitHub people search (TypeScript)

Monorepo: **Express** backend rotates multiple GitHub Personal Access Tokens (PATs) for [Search users](https://docs.github.com/en/rest/search/search#search-users) + per-user profile fetch; **Vite + React** UI shows enriched contact fields available from the API and from URLs embedded in public `bio` / `blog` text.

## What you can and cannot get

| Field | Source |
|--------|--------|
| GitHub profile URL | API |
| Name, company, location, bio, blog | API |
| Twitter/X | API (`twitter_username`) |
| Email | API only if the user chose a **public** email (often empty) |
| LinkedIn, other sites, phone-like strings | Parsed from **bio** and **blog** text only |

GitHub does not provide phone numbers or LinkedIn as structured fields. Do not scrape HTML to evade that; it breaks ToS and is brittle.

## Setup

```bash
cd FindManGoogle
npm install
cp backend/.env.example backend/.env
# Edit backend/.env: GITHUB_TOKENS=ghp_a,ghp_b,...
```

Tokens need scope to read public user data and use search (classic: no extra scope for public search; fine-grained: include read access appropriate for user/search endpoints per GitHub docs).

## Run

```bash
npm run dev
```

- Frontend: http://localhost:5173 (proxies `/api` → backend). If Vite exits with “port already in use”, stop whatever is bound to **5173** (another Vite app, old terminal) and retry.
- **Saved table** (`/saved`): save search results with a **note** per person; data is stored in **SQLite** on the server (default file `backend/data/findman.sqlite`, override with `SQLITE_PATH` in `backend/.env`).
- **Automated search on startup:** after the API starts, it runs **page 1** of `AUTO_SEARCH_QUERY` with `AUTO_SEARCH_PER_PAGE` (default **15**, max **30**), **enriches** each hit (GitHub Users API, same as manual search), **upserts every profile into SQLite**, and records **GitHub `total_count`** for the Overview. Tune `AUTO_SEARCH_PER_PAGE` to balance how many people are auto-saved vs API usage.
- API: http://localhost:3001

**Preview production build** (still proxies `/api` if the backend is on 3001):

```bash
npm run build
npm run dev -w backend   # terminal 1 — keep running
npm run preview -w frontend   # terminal 2 → http://localhost:4173
```

If you serve the static `frontend/dist` from another host, set `VITE_API_BASE_URL` before build (e.g. `http://localhost:3001`) so the browser calls the API directly; configure backend `CORS_ORIGINS` accordingly.

### API

- `GET /api/search?q=...&page=1&perPage=15` — search + enrich profiles  
- `POST /api/tokens` — body `{ "tokens": ["ghp_..."] }` merges tokens in **server memory** (optional; resets on restart)  
- `GET /api/health` — `{ ok, tokenCount }`  
- `GET /api/stats` — `{ automated, contactedCount, savedTotal }` — last automated search snapshot (from startup) + DB counts (`contactedCount` = saved rows with a non-empty note)  
- **Saved people (SQLite)**  
  - `GET /api/saved` — `{ rows: SavedPersonRow[] }`  
  - `PUT /api/saved/:login` — body `{ "person": PersonContact }` — insert or update profile snapshot; keeps existing **note** on update  
  - `PATCH /api/saved/:login` — body `{ "note": "..." }`  
  - `DELETE /api/saved/:login` — remove one row  
  - `DELETE /api/saved` — clear all saved rows (`{ ok, deleted }`)

### Production CORS

Set `CORS_ORIGINS=https://your-frontend.com` in `backend/.env`. If unset, CORS allows any origin (fine for local dev with the Vite proxy).

### Automated search not saving to SQLite?

The startup job runs ~750ms after the API boots and **needs at least one GitHub token** in `getAllTokens()`. If you **only paste PATs in the UI** (no `GITHUB_TOKENS` in `backend/.env`), the first run often sees **zero tokens** and exits without saving. **Saving tokens once via “Save tokens on server”** now **re-triggers** the automated search when tokens go from 0 → 1+. Prefer setting `GITHUB_TOKENS` in `backend/.env` so the first run can succeed. DB file: default `backend/data/findman.sqlite` (`SQLITE_PATH` to override).

## Security

- Treat PATs like passwords. Prefer `GITHUB_TOKENS` in `.env` and **never** commit `.env`.
- The optional UI “paste tokens” feature sends keys to your backend; use only on trusted networks or remove that UI for production.
