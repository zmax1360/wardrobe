import * as cheerio from "cheerio";

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 FashionOS-LinkImport/1.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const BRAND_RULES = [
  { id: "ralph-lauren", test: (h, t) => /(^|\.)ralphlauren\.com$/i.test(h) || /ralph\s*lauren/i.test(t || ""), name: "Ralph Lauren", accent: "#002B5C" },
  { id: "zara", test: (h) => /(^|\.)zara\.com$/i.test(h), name: "Zara", accent: "#000000" },
  { id: "uniqlo", test: (h) => /(^|\.)uniqlo\.com$/i.test(h), name: "Uniqlo", accent: "#E60012" },
  { id: "nordstrom", test: (h) => /(^|\.)nordstrom\.com$/i.test(h), name: "Nordstrom", accent: "#000000" },
  { id: "jcrew", test: (h) => /(^|\.)jcrew\.com$/i.test(h), name: "J.Crew", accent: "#1E3A5F" },
];

function resolveBrand(hostname, pageTitle) {
  const host = String(hostname || "").toLowerCase();
  const title = String(pageTitle || "");
  for (const rule of BRAND_RULES) {
    if (rule.test(host, title)) {
      return { brand: rule.name, brandAccent: rule.accent };
    }
  }
  return { brand: null, brandAccent: null };
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
    try { out.push(JSON.parse($(el).html())); } catch { }
  });
  return out;
}

function flattenLdNodes(node, acc = []) {
  if (node == null) return acc;
  if (Array.isArray(node)) { node.forEach((n) => flattenLdNodes(n, acc)); return acc; }
  if (typeof node === "object") {
    acc.push(node);
    if (node["@graph"]) flattenLdNodes(node["@graph"], acc);
  }
  return acc;
}

function extractProductFromLd(roots) {
  let image = null, price = null;
  for (const root of roots) {
    for (const n of flattenLdNodes(root)) {
      const types = (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).filter(Boolean).map(String);
      if (!types.some((t) => /product/i.test(t))) continue;
      if (n.image && !image) {
        const im = n.image;
        if (typeof im === "string") image = im;
        else if (Array.isArray(im) && im.length) image = typeof im[0] === "string" ? im[0] : im[0]?.url;
        else if (typeof im === "object") image = im.url || im.contentUrl;
      }
      if (price == null) {
        const o = Array.isArray(n.offers) ? n.offers[0] : n.offers;
        const p = o?.price ?? o?.lowPrice;
        if (p != null) { const num = parseFloat(String(p).replace(/[^0-9.]/g, "")); if (Number.isFinite(num)) price = num; }
      }
    }
  }
  return { image, price };
}

function normalizeImageUrl(raw, baseUrl) {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  try { return new URL(t, baseUrl).href; } catch { return null; }
}

function extractTitle($) {
  const og = $('meta[property="og:title"]').attr("content");
  if (og?.trim()) return og.trim().slice(0, 200);
  const t = $("title").first().text();
  return t?.trim().slice(0, 200) || "Imported piece";
}

function extractPrice($) {
  const meta = $('meta[property="product:price:amount"]').attr("content") ||
    $('meta[property="og:price:amount"]').attr("content") ||
    $('meta[itemprop="price"]').attr("content");
  if (meta) { const n = parseFloat(String(meta).replace(/[^0-9.]/g, "")); if (Number.isFinite(n)) return n; }
  const ld = extractProductFromLd(parseJsonLdBlocks($));
  return ld.price ?? null;
}

function pickPrimaryImage($, pageUrl) {
  const candidates = [
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[property="og:image"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
  ];
  const ld = extractProductFromLd(parseJsonLdBlocks($));
  if (ld.image) candidates.push(ld.image);
  for (const c of candidates) {
    const u = normalizeImageUrl(c, pageUrl);
    if (u && !/\.svg(\?|$)/i.test(u)) return u;
  }
  return null;
}

async function scrapeProductPage(urlString) {
  const pageUrl = new URL(urlString);
  const cleanUrl = (() => {
    try {
      const u = new URL(urlString);
      ["utm_source","utm_medium","utm_campaign","gclid","gbraid"].forEach(p => u.searchParams.delete(p));
      return u.toString();
    } catch { return urlString; }
  })();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let html;
  try {
    const response = await fetch(cleanUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Cache-Control": "no-cache",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    html = await response.text();
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("Page fetch timed out");
    throw e;
  } finally { clearTimeout(timeout); }

  const $ = cheerio.load(html);
  return {
    title: extractTitle($),
    price: extractPrice($),
    imageRemote: pickPrimaryImage($, cleanUrl),
    sourceUrl: urlString,
    brandInfo: resolveBrand(pageUrl.hostname, extractTitle($)),
    category: guessCategory(extractTitle($)),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = req.body?.url?.trim();
  if (!url) return res.status(400).json({ error: "url required" });

  let parsed;
  try { parsed = new URL(url); } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return res.status(400).json({ error: "Only http(s) URLs supported" });
  }

  try {
    const scraped = await scrapeProductPage(url);
    const price = scraped.price ?? hashPriceFallback(url);

    if (!scraped.imageRemote) {
      return res.status(422).json({
        error: "Could not find product image on this page",
        title: scraped.title,
        price,
        sourceUrl: url,
      });
    }

    // Return imageRemote directly — client handles Firebase Storage upload
    return res.json({
      title: scraped.title,
      price,
      imageUrl: scraped.imageRemote,
      imageRemote: scraped.imageRemote,
      localFilename: null,
      preview: true,
      sourceUrl: url,
      category: scraped.category,
      brand: scraped.brandInfo.brand,
      brandAccent: scraped.brandInfo.brandAccent,
      tags: scraped.brandInfo.brand
        ? [scraped.brandInfo.brand, "link-import"]
        : ["link-import"],
      description: scraped.brandInfo.brand
        ? `Imported from ${scraped.brandInfo.brand}. View: ${url}`
        : `Imported from link. View: ${url}`,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to import link" });
  }
}
