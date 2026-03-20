/**
 * Same-origin `/api` when unset (Vite dev server proxies to the backend).
 * Set `VITE_API_BASE_URL=http://localhost:3001` if the UI is served without a proxy.
 */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
