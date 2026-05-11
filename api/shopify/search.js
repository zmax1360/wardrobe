const CATALOG_ID = "01kq6avdgdpbqkj8tkz48nryrq";

const searchCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  searchCache.set(key, { data, timestamp: Date.now() });
  if (searchCache.size > 100) {
    const firstKey = searchCache.keys().next().value;
    searchCache.delete(firstKey);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: "Shopify not configured" });
  }

  const searchQuery = req.query.query || req.query.q || "";
  const cacheKey = JSON.stringify({
    q: searchQuery,
    max_price: req.query.max_price || "",
    currency: req.query.currency || "USD",
    secondhand: req.query.allow_secondhand || "0",
  });

  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const tokenRes = await fetch("https://api.shopify.com/auth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    });
    if (!tokenRes.ok) throw new Error("Shopify auth failed");
    const { access_token } = await tokenRes.json();

    const params = new URLSearchParams();
    if (searchQuery) params.append("query", searchQuery);
    params.append("limit", req.query.limit || "10");
    if (req.query.max_price) params.append("max_price", req.query.max_price);
    params.append("currency", req.query.currency || "USD");
    params.append("available_for_sale", "1");
    params.append(
      "include_secondhand",
      req.query.allow_secondhand === "true" ? "1" : "0"
    );

    const catalogUrl = `https://discover.shopifyapps.com/global/v2/search/${CATALOG_ID}?${params}`;
    const catalogRes = await fetch(catalogUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!catalogRes.ok) {
      const text = await catalogRes.text();
      throw new Error(`Catalog error ${catalogRes.status}: ${text}`);
    }
    const data = await catalogRes.json();

    const preferredCurrency = (req.query.currency || "USD").toUpperCase();
    const allowSecondhand = req.query.allow_secondhand === "true";
    const allowed = new Set([preferredCurrency, "USD"]);

    const sourceProducts = Array.isArray(data)
      ? data
      : data?.offers || data?.products || data?.results || [];

    const filtered = sourceProducts.filter((product) => {
      const variant = product.variants?.[0] || product;
      if (!allowSecondhand && variant.secondhand === true) return false;
      const currency = (
        variant.price?.currency ||
        product.priceRange?.min?.currency || ""
      ).toUpperCase();
      if (currency && !allowed.has(currency)) return false;
      const hasImage = variant.media?.[0]?.url || product.media?.[0]?.url;
      if (!hasImage) return false;
      return true;
    });

    const response = { products: filtered, results: filtered };
    setCache(cacheKey, response);
    return res.json(response);
  } catch (e) {
    console.error("[shopify/search]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
