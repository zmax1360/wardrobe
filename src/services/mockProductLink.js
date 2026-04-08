import { API_BASE_URL } from "../apiBase";

/**
 * POST /api/ingest-link — Cheerio scrape (og:image, twitter:image, og:title, price meta)
 * and a locally persisted copy under /wardrobe-images/.
 */
export async function fetchProductPreviewFromUrl(url) {
  if (!url || typeof url !== "string" || !url.trim()) {
    throw new Error("Paste a product URL");
  }
  const res = await fetch(`${API_BASE_URL}/api/ingest-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Could not load product preview");
  }
  return data;
}
