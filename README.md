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

### Production CORS

Set `CORS_ORIGINS=https://your-frontend.com` in `backend/.env`. If unset, CORS allows any origin (fine for local dev with the Vite proxy).

## Security

- Treat PATs like passwords. Prefer `GITHUB_TOKENS` in `.env` and **never** commit `.env`.
- The optional UI “paste tokens” feature sends keys to your backend; use only on trusted networks or remove that UI for production.
