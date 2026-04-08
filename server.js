/**
 * Wardrobe item schema — Financial Asset Gallery:
 * purchasePrice (number, default 0), wearCount (int, default 0), category (string),
 * mockPrice (optional, from link-import). Derived CPW: calculateCPW(price, wears) = price / max(wears, 1).
 * Legacy: cost (string), timesWorn (int).
 */
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3001;

const uploadDir = path.join(__dirname, "public", "wardrobe-images");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/wardrobe-images", express.static(uploadDir));

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
    signal: AbortSignal.timeout(25000),
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

  const htmlRes = await fetch(urlString, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(20000),
  });

  if (!htmlRes.ok) throw new Error(`Page HTTP ${htmlRes.status}`);

  const html = await htmlRes.text();
  const $ = cheerio.load(html);

  const title = extractTitle($);
  let price = extractPrice($);

  let imageRemote = pickPrimaryImage($, urlString);

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

/**
 * Product link ingest: fetch HTML with `fetch`, parse with Cheerio.
 * Primary image: meta[property="og:image"] or meta[name="twitter:image"], then fallbacks.
 * Title: og:title; price: product/og meta + JSON-LD when present.
 * Persists the resolved image to public/wardrobe-images/.
 */
app.post("/api/ingest-link", async (req, res) => {
  const url = req.body && typeof req.body.url === "string" ? req.body.url.trim() : "";
  if (!url) return res.status(400).json({ error: "url required" });

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

    const { filename, imageUrl } = await downloadImageToWardrobe(
      scraped.imageRemote,
      url,
      () => base
    );

    const tags = ["link-import"];
    if (scraped.brandInfo.brand) tags.unshift(scraped.brandInfo.brand);

    const description = scraped.brandInfo.brand
      ? `Imported from ${scraped.brandInfo.brand}. View product: ${url}`
      : `Imported from link. View product: ${url}`;

    res.json({
      title: scraped.title,
      price: mockPrice,
      mockPrice,
      imageUrl,
      localFilename: filename,
      sourceUrl: url,
      category: scraped.category,
      brand: scraped.brandInfo.brand,
      brandAccent: scraped.brandInfo.brandAccent,
      tags,
      description,
    });
  } catch (e) {
    console.error("ingest-link:", e.message);
    res.status(500).json({
      error: e.message || "Failed to import product link",
    });
  }
});

app.listen(PORT, () => console.log(`Image server running on port ${PORT}`));
