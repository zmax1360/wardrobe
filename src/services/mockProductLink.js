import { API_BASE_URL } from "../apiBase";

/**
 * Fetches Open Graph / JSON-LD product data and a locally persisted image from the backend.
 */
export async function fetchProductPreviewFromUrl(url) {
  if (!url || typeof url !== "string" || !url.trim()) {
    throw new Error("Paste a product URL");
  }
  const res = await fetch(`${API_BASE_URL}/api/mock-product-link`, {
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
