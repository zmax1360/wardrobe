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

  const res = await fetch(
    `http://localhost:3001/api/shopify/search?${params}`
  );
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function getShopifyProductDetails(upid) {
  const res = await fetch(`http://localhost:3001/api/shopify/product/${upid}`);
  if (!res.ok) throw new Error(`Product lookup failed: ${res.status}`);
  return res.json();
}
