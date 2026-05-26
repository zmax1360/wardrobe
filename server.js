/**
 * Wardrobe item schema (client canonical): purchasePrice, timesWorn, category, etc.
 * Ingest API may return legacy-shaped price fields; client maps to purchasePrice.
 */
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cheerio = require("cheerio");

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (!key || process.env[key] != null) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadLocalEnv();

const searchCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

const app = express();
const PORT = process.env.PORT || 3001;

const uploadDir = path.join(__dirname, "public", "wardrobe-images");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.set("trust proxy", 1);
app.use(cors());
// Closet vision + other chat payloads send large JSON (base64 images).
app.use(express.json({ limit: "20mb" }));
app.use("/wardrobe-images", express.static(uploadDir));

/** Anthropic proxy — matches `api/chat.js` (used by ClosetScanner via `/api/chat` in dev behind CRA proxy). */
app.post("/api/chat", async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({
      type: "error",
      error: {
        message:
          "Anthropic API key missing. Set ANTHROPIC_API_KEY (or REACT_APP_ANTHROPIC_API_KEY) in .env for local dev.",
      },
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return res.status(502).json({
        type: "error",
        error: { message: text || `Anthropic returned non-JSON (${response.status})` },
      });
    }
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({
      type: "error",
      error: { message: e.message || "Anthropic proxy error" },
    });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({ storage });

function publicBase(req) {
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("x-forwarded-host") || req.get("host") || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 FashionOS-LinkImport/1.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const BRAND_RULES = [
  {
    id: "ralph-lauren",
    test: (host, title) =>
      /(^|\.)ralphlauren\.com$/i.test(host) ||
      /ralph\s*lauren/i.test(title || ""),
    name: "Ralph Lauren",
    accent: "#002B5C",
  },
  {
    id: "zara",
    test: (host) => /(^|\.)zara\.com$/i.test(host),
    name: "Zara",
    accent: "#000000",
  },
  {
    id: "uniqlo",
    test: (host) => /(^|\.)uniqlo\.com$/i.test(host),
    name: "Uniqlo",
    accent: "#E60012",
  },
  {
    id: "nordstrom",
    test: (host) => /(^|\.)nordstrom\.com$/i.test(host),
    name: "Nordstrom",
    accent: "#000000",
  },
  {
    id: "jcrew",
    test: (host) => /(^|\.)jcrew\.com$/i.test(host),
    name: "J.Crew",
    accent: "#1E3A5F",
  },
];

function resolveBrand(hostname, pageTitle) {
  const host = String(hostname || "").toLowerCase();
  const title = String(pageTitle || "");
  for (const rule of BRAND_RULES) {
    if (rule.test(host, title)) {
      return { brand: rule.name, brandAccent: rule.accent, brandId: rule.id };
    }
  }
  return { brand: null, brandAccent: null, brandId: null };
}

function guessCategory(title) {
  const t = String(title || "").toLowerCase();
  if (/(dress|gown|skirt)/i.test(t)) return "Dresses";
  if (/(jean|denim|pant|trouser|short)/i.test(t)) return "Bottoms";
  if (/(shoe|sneaker|boot|heel|sandal|loafer|oxford)/i.test(t)) return "Shoes";
  if (/(coat|jacket|blazer|outerwear)/i.test(t)) return "Outerwear";
  if (/(bag|tote|wallet|belt)/i.test(t)) return "Accessories";
  return "Tops";
}

function hashPriceFallback(url) {
  const hash = Math.abs(url.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  return 49 + (hash % 200);
}

function parseJsonLdBlocks($) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const j = JSON.parse(raw);
      out.push(j);
    } catch {
      /* skip */
    }
  });
  return out;
}

function flattenLdNodes(node, acc = []) {
  if (node == null) return acc;
  if (Array.isArray(node)) {
    node.forEach((n) => flattenLdNodes(n, acc));
    return acc;
  }
  if (typeof node === "object") {
    acc.push(node);
    if (node["@graph"]) flattenLdNodes(node["@graph"], acc);
  }
  return acc;
}

function extractProductFromLd(roots) {
  let image = null;
  let price = null;
  for (const root of roots) {
    const nodes = flattenLdNodes(root);
    for (const n of nodes) {
      const rawT = n["@type"];
      const types = (Array.isArray(rawT) ? rawT : [rawT])
        .filter(Boolean)
        .map((t) => (typeof t === "string" ? t : String(t)));
      const isProduct = types.some((t) => /product/i.test(t));
      if (!isProduct) continue;

      if (n.image && !image) {
        const im = n.image;
        if (typeof im === "string") image = im;
        else if (Array.isArray(im) && im.length) {
          const first = im[0];
          image = typeof first === "string" ? first : first?.url || first?.contentUrl;
        } else if (im && typeof im === "object") image = im.url || im.contentUrl;
      }

      const offers = n.offers || n.aggregateOffer;
      if (offers && price == null) {
        const o = Array.isArray(offers) ? offers[0] : offers;
        const p = o?.price ?? o?.lowPrice ?? o?.highPrice;
        if (p != null && p !== "") {
          const num = parseFloat(String(p).replace(/[^0-9.]/g, ""));
          if (Number.isFinite(num)) price = num;
        }
      }
    }
  }
  return { image, price };
}

function extractPriceFromMeta($) {
  const meta =
    $('meta[property="product:price:amount"]').attr("content") ||
    $('meta[property="og:price:amount"]').attr("content") ||
    $('meta[itemprop="price"]').attr("content") ||
    $('meta[name="twitter:data1"]').attr("content");
  if (meta) {
    const num = parseFloat(String(meta).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function normalizeImageUrl(raw, baseUrl) {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  try {
    return new URL(t, baseUrl).href;
  } catch {
    return null;
  }
}

function pickPrimaryImage($, pageUrl) {
  const candidates = [
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[property="og:image"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
    $('link[rel="image_src"]').attr("href"),
  ];

  const ldRoots = parseJsonLdBlocks($);
  const fromLd = extractProductFromLd(ldRoots);
  if (fromLd.image) candidates.push(fromLd.image);

  $('meta[itemprop="image"]').each((_, el) => {
    candidates.push($(el).attr("content") || $(el).attr("src"));
  });

  for (const c of candidates) {
    const u = normalizeImageUrl(c, pageUrl);
    if (u && !/\.svg(\?|$)/i.test(u)) return u;
  }

  return null;
}

function extractTitle($) {
  const og = $('meta[property="og:title"]').attr("content");
  if (og && og.trim()) return og.trim().slice(0, 200);
  const tw = $('meta[name="twitter:title"]').attr("content");
  if (tw && tw.trim()) return tw.trim().slice(0, 200);
  const t = $("title").first().text();
  if (t && t.trim()) return t.trim().slice(0, 200);
  return "Imported piece";
}

function extractPrice($) {
  let p = extractPriceFromMeta($);
  if (p != null) return p;

  const ldRoots = parseJsonLdBlocks($);
  const fromLd = extractProductFromLd(ldRoots);
  if (fromLd.price != null) return fromLd.price;

  return null;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function downloadImageToWardrobe(imageUrl, referer, baseReq) {
  const res = await fetch(imageUrl, {
    redirect: "follow",
    headers: {
      ...FETCH_HEADERS,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: referer,
    },
    signal: AbortSignal.timeout(35000),
  });

  if (!res.ok) throw new Error(`Image HTTP ${res.status}`);

  const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ct.startsWith("image/")) {
    throw new Error("URL did not return an image");
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("Image too large");

  let ext = ".jpg";
  if (ct.includes("png")) ext = ".png";
  else if (ct.includes("webp")) ext = ".webp";
  else if (ct.includes("gif")) ext = ".gif";

  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const dest = path.join(uploadDir, filename);
  fs.writeFileSync(dest, buf);

  const base = typeof baseReq === "function" ? baseReq() : baseReq;
  return {
    filename,
    imageUrl: `${base}/wardrobe-images/${filename}`,
  };
}

async function scrapeProductPage(urlString) {
  const pageUrl = new URL(urlString);

  const cleanUrl = (() => {
    try {
      const u = new URL(urlString);
      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "gclid",
        "gbraid",
        "gad_source",
        "gclsrc",
        "gad_campaignid",
      ].forEach((p) => u.searchParams.delete(p));
      return u.toString();
    } catch {
      return urlString;
    }
  })();

  const controller = new AbortController();
  const PAGE_FETCH_MS = 28000;
  const timeout = setTimeout(() => controller.abort(), PAGE_FETCH_MS);

  let html;
  try {
    const response = await fetch(cleanUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        // Omit "br" — some Node fetch stacks stall decoding brotli on large retail HTML.
        "Accept-Encoding": "gzip, deflate",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    html = await response.text();
  } catch (e) {
    if (e?.name === "AbortError" || e?.cause?.name === "AbortError") {
      throw new Error(`Page fetch timed out (${PAGE_FETCH_MS / 1000}s)`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  const $ = cheerio.load(html);

  const title = extractTitle($);
  let price = extractPrice($);

  let imageRemote = pickPrimaryImage($, cleanUrl);

  const brandInfo = resolveBrand(pageUrl.hostname, title);

  return {
    title,
    price,
    imageRemote,
    sourceUrl: urlString,
    brandInfo,
    category: guessCategory(title),
  };
}

app.post("/api/upload-image", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const base = publicBase(req);
  res.json({
    filename: req.file.filename,
    url: `${base}/wardrobe-images/${req.file.filename}`,
  });
});

app.delete("/api/delete-image/:filename", (req, res) => {
  const safe = path.basename(req.params.filename);
  const filePath = path.join(uploadDir, safe);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

const https = require("https");

function getShopifyCredentials(res) {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).json({
      error: "Shopify Catalog not configured. Add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET to .env.",
    });
    return null;
  }
  return { clientId, clientSecret };
}

// Shopify Catalog token endpoint
app.post("/api/shopify/token", async (req, res) => {
  try {
    const creds = getShopifyCredentials(res);
    if (!creds) return;
    const response = await fetch("https://api.shopify.com/auth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "client_credentials",
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    res.json({ access_token: data.access_token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shopify Catalog search proxy
app.get("/api/shopify/search", async (req, res) => {
  try {
    const creds = getShopifyCredentials(res);
    if (!creds) return;
    const searchQuery = req.query.query || req.query.q || "";
    const cacheKey = JSON.stringify({
      q: searchQuery,
      max_price: req.query.max_price || "",
      currency: req.query.currency || "USD",
      secondhand: req.query.allow_secondhand || "0",
    });
    searchCache.clear();

    const cached = getCached(cacheKey);
    if (cached) {
      console.log("[shopify/search] cache hit:", req.query.q);
      return res.json(cached);
    }

    // Get fresh token
    const tokenRes = await fetch("https://api.shopify.com/auth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "client_credentials",
      }),
    });
    if (!tokenRes.ok) throw new Error("Shopify auth failed");
    const { access_token } = await tokenRes.json();

    // Forward search to Shopify Catalog
    const params = new URLSearchParams();
    if (searchQuery) params.append("query", searchQuery);
    if (req.query.limit) params.append("limit", req.query.limit);
    else params.append("limit", "10");
    if (req.query.max_price || req.query.price_max) params.append("max_price", req.query.max_price || req.query.price_max);
    if (req.query.min_price || req.query.price_min) params.append("min_price", req.query.min_price || req.query.price_min);

    // Don't filter by ships_to — returns best global results
    // Currency filtering happens client-side
    const currency = req.query.currency || "USD";
    params.append("currency", currency);
    params.append("available_for_sale", "1");
    const includeSecondhand = req.query.allow_secondhand === "true" ? 1 : 0;
    params.append("include_secondhand", String(includeSecondhand));
    const catalogUrl = `https://discover.shopifyapps.com/global/v2/search/01kq6avdgdpbqkj8tkz48nryrq?${params}`;
    console.log("[shopify/search] incoming:", req.query);
    console.log("[shopify/search] forwarding:", catalogUrl);
    const catalogRes = await fetch(catalogUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const text = await catalogRes.text();
    console.log("[shopify/search] status:", catalogRes.status);
    console.log("[shopify/search] response:", text);
    if (!catalogRes.ok) throw new Error(`Catalog error ${catalogRes.status}: ${text}`);
    const data = text ? JSON.parse(text) : null;

    const preferredCurrency = req.query.currency || "USD";
    const allowSecondhand = req.query.allow_secondhand === "true";
    const allowed = new Set([
      preferredCurrency.toUpperCase(),
      "USD",
    ]);

    const sourceProducts = Array.isArray(data)
      ? data
      : (data?.offers || data?.products || data?.results || []);
    console.log("[shopify/search] offers count:", sourceProducts.length);
    console.log("[shopify/search] first item keys:",
      sourceProducts[0] ? Object.keys(sourceProducts[0]) : "empty");
    const filtered = sourceProducts.filter((product) => {
      const variant = product.variants?.[0] || product;

      // Filter secondhand unless explicitly allowed
      if (!allowSecondhand && variant.secondhand === true) {
        return false;
      }

      // Filter by currency
      const productCurrency = (
        variant.price?.currency ||
        variant.priceRange?.min?.currency ||
        product.priceRange?.min?.currency ||
        ""
      ).toUpperCase();

      if (productCurrency && !allowed.has(productCurrency)) return false;

      // Must have image
      const hasImage =
        variant.media?.[0]?.url ||
        product.media?.[0]?.url ||
        product.images?.[0]?.url;
      if (!hasImage) return false;

      return true;
    });

    const response = {
      ...data,
      products: filtered,
      results: filtered,
    };
    setCache(cacheKey, response);
    res.json(response);
  } catch (e) {
    console.error("[shopify/search] error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Shopify product detail proxy
app.get("/api/shopify/product/:upid", async (req, res) => {
  try {
    const creds = getShopifyCredentials(res);
    if (!creds) return;
    const tokenRes = await fetch("https://api.shopify.com/auth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "client_credentials",
      }),
    });
    if (!tokenRes.ok) throw new Error("Shopify auth failed");
    const { access_token } = await tokenRes.json();

    const productRes = await fetch(`https://discover.shopifyapps.com/global/v2/p/${req.params.upid}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!productRes.ok) throw new Error(`Product error ${productRes.status}`);
    const data = await productRes.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Product link ingest: fetch HTML with `fetch`, parse with Cheerio.
 * Primary image: meta[property="og:image"] or meta[name="twitter:image"], then fallbacks.
 * Title: og:title; price: product/og meta + JSON-LD when present.
 * Persists the resolved image to public/wardrobe-images/.
 */
function buildIngestJsonBody(scraped, url, mockPrice, opts) {
  const { imageUrl, localFilename, preview, imageRemote } = opts;
  const tags = ["link-import"];
  if (scraped.brandInfo.brand) tags.unshift(scraped.brandInfo.brand);

  const description = scraped.brandInfo.brand
    ? `Imported from ${scraped.brandInfo.brand}. View product: ${url}`
    : `Imported from link. View product: ${url}`;

  return {
    title: scraped.title,
    price: mockPrice,
    mockPrice,
    imageUrl,
    localFilename,
    imageRemote: imageRemote ?? null,
    preview: Boolean(preview),
    sourceUrl: url,
    category: scraped.category,
    brand: scraped.brandInfo.brand,
    brandAccent: scraped.brandInfo.brandAccent,
    tags,
    description,
  };
}

/** Download og:image to wardrobe-images/ — used after fast preview or standalone. */
app.post("/api/ingest-finalize", async (req, res) => {
  const sourceUrl =
    req.body && typeof req.body.sourceUrl === "string" ? req.body.sourceUrl.trim() : "";
  const imageRemote =
    req.body && typeof req.body.imageRemote === "string" ? req.body.imageRemote.trim() : "";
  if (!sourceUrl || !imageRemote) {
    return res.status(400).json({ error: "sourceUrl and imageRemote required" });
  }

  const base = publicBase(req);

  try {
    const { filename, imageUrl } = await downloadImageToWardrobe(imageRemote, sourceUrl, () => base);
    res.json({
      imageUrl,
      localFilename: filename,
      sourceUrl,
    });
  } catch (e) {
    console.error("ingest-finalize:", e.message);
    res.status(500).json({
      error: e.message || "Failed to save product image",
    });
  }
});

app.post("/api/ingest-link", async (req, res) => {
  const url = req.body && typeof req.body.url === "string" ? req.body.url.trim() : "";
  if (!url) return res.status(400).json({ error: "url required" });

  const previewOnly = Boolean(req.body && (req.body.preview === true || req.body.previewOnly === true));

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return res.status(400).json({ error: "Only http(s) URLs are supported" });
  }

  const base = publicBase(req);

  try {
    const scraped = await scrapeProductPage(url);
    const mockPrice =
      scraped.price != null && Number.isFinite(scraped.price)
        ? scraped.price
        : hashPriceFallback(url);

    if (!scraped.imageRemote) {
      return res.status(422).json({
        error: "Could not find a product image (og:image / structured data) on this page",
        title: scraped.title,
        price: mockPrice,
        sourceUrl: url,
      });
    }

    if (previewOnly) {
      return res.json(
        buildIngestJsonBody(scraped, url, mockPrice, {
          imageUrl: scraped.imageRemote,
          localFilename: null,
          preview: true,
          imageRemote: scraped.imageRemote,
        })
      );
    }

    const { filename, imageUrl } = await downloadImageToWardrobe(
      scraped.imageRemote,
      url,
      () => base
    );

    res.json(
      buildIngestJsonBody(scraped, url, mockPrice, {
        imageUrl,
        localFilename: filename,
        preview: false,
        imageRemote: scraped.imageRemote,
      })
    );
  } catch (e) {
    console.error("ingest-link:", e.message);
    res.status(500).json({
      error: e.message || "Failed to import product link",
    });
  }
});

app.listen(PORT, () => console.log(`Image server running on port ${PORT}`));
