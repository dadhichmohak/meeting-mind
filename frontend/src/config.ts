/**
 * API base URL — relative in dev (Vite proxy), absolute in production.
 * Set VITE_API_URL env var for production builds.
 */
export const API_BASE: string =
  import.meta.env.VITE_API_URL || "";

/**
 * Full API helper — builds URL from base.
 * In dev: "/meetings/start" → proxied to http://127.0.0.1:8765/meetings/start
 * In prod: "https://myapp.com/meetings/start" (if VITE_API_URL is set)
 */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
