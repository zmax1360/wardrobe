import { getFirebaseAuthHeader } from "../firebase";

const SERVER_BASE =
  process.env.NODE_ENV === "production" ? "" : process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

export async function searchShopifyCatalog(query, filters = {}) {
  const params = new URLSearchParams({
    q: query,
    limit: String(filters.limit || 10),
  });
  if (filters.max_price) params.append("price_max", filters.max_price);
  if (filters.min_price) params.append("price_min", filters.min_price);
  if (filters.country_code) params.append("country_code", filters.country_code);
  if (filters.currency) params.append("currency", filters.currency);
  if (filters.allow_secondhand !== undefined) {
    params.append("allow_secondhand", String(filters.allow_secondhand));
  }

  const authHeader = await getFirebaseAuthHeader();
  const res = await fetch(`${SERVER_BASE}/api/shopify/search?${params}`, {
    headers: { ...authHeader },
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function getShopifyProductDetails(upid) {
  const authHeader = await getFirebaseAuthHeader();
  const res = await fetch(`${SERVER_BASE}/api/shopify/product/${upid}`, {
    headers: { ...authHeader },
  });
  if (!res.ok) throw new Error(`Product lookup failed: ${res.status}`);
  return res.json();
}
