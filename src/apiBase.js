/**
 * Express image + link-import server (`server.js`).
 * Set `REACT_APP_API_URL` to the server **origin** (e.g. `http://127.0.0.1:3001`), not a path under the SPA,
 * unless you intend paths to be resolved from that base (see `resolveBackendApiPath`).
 */
export const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

/**
 * Resolves `/api/...` against the configured backend base without duplicating segments.
 * Example: base `https://host/api/audit` + `/api/upload-image` → `https://host/api/upload-image`
 * (not `https://host/api/audit/api/upload-image`).
 */
export function resolveBackendApiPath(absolutePath) {
  const path = String(absolutePath || "").startsWith("/") ? String(absolutePath) : `/${absolutePath}`;
  const base = String(API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) return path;
  try {
    const baseWithSlash = base.endsWith("/") ? base : `${base}/`;
    return new URL(path, baseWithSlash).href;
  } catch {
    return `${base}${path}`;
  }
}
