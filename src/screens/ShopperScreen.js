import React, { useCallback, useEffect, useMemo, useState } from "react";

import { COLORS } from "../constants/colors";
import { ui } from "../styles/ui";
import { mergeStyles } from "../utils/styleUtils";

const SERVER_URL = process.env.NODE_ENV === "production"
  ? ""
  : (process.env.REACT_APP_SERVER_URL || "http://localhost:3001");

async function searchShopifyCatalog(query, filters = {}) {
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
    `${SERVER_URL}/api/shopify/search?${params}`
  );
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

async function getShopifyProductDetails(upid) {
  const res = await fetch(`${SERVER_URL}/api/shopify/product/${upid}`);
  if (!res.ok) throw new Error(`Product lookup failed: ${res.status}`);
  return res.json();
}

export function ShopperScreen({
  profile,
  wardrobe,
  baseTransition,
  STORAGE_WISHLIST,
  buildProfileSummary,
  callShoppingAssistant,
}) {
  const [view, setView] = useState("chat"); // "chat" | "wishlist"
  const [messages, setMessages] = useState([]); // { id, role, content, products }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [wishlist, setWishlist] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [error, setError] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [addedId, setAddedId] = useState(null);
  const [showShopLookModal, setShowShopLookModal] = useState(false);
  const [shopLookItems, setShopLookItems] = useState([]);
  const [allowSecondhand, setAllowSecondhand] = useState(false);
  const [shoppingMode, setShoppingMode] = useState(() => {
    try {
      return localStorage.getItem("fos_shopping_mode") || "both";
    } catch {
      return "both";
    }
  });
  const [buyerLocation, setBuyerLocation] = useState({
    country_code: "US",
    currency: "USD",
    country: "United States",
    detected: false,
  });

  const COUNTRY_CURRENCY_MAP = {
    CA: "CAD", US: "USD", GB: "GBP",
    AU: "AUD", NZ: "NZD", JP: "JPY",
    DE: "EUR", FR: "EUR", ES: "EUR",
    IT: "EUR", NL: "EUR", BE: "EUR",
    PT: "EUR", AT: "EUR", IE: "EUR",
    CH: "CHF", SE: "SEK", NO: "NOK",
    DK: "DKK", SG: "SGD", HK: "HKD",
    AE: "AED", SA: "SAR", IN: "INR",
    BR: "BRL", MX: "MXN", ZA: "ZAR",
  };

  const detectBuyerLocation = useCallback(async () => {
    try {
      if (!navigator.geolocation) return;

      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          timeout: 8000,
          maximumAge: 600000,
          enableHighAccuracy: false,
        })
      );

      const { latitude, longitude } = pos.coords;

      // Reverse geocode to get country
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        { headers: { Accept: "application/json" } }
      );

      if (!geoRes.ok) return;
      const geoData = await geoRes.json();

      const countryCode = geoData.address?.country_code?.toUpperCase() || "US";
      const currency = COUNTRY_CURRENCY_MAP[countryCode] || "USD";
      const country = geoData.address?.country || "Unknown";

      setBuyerLocation({
        country_code: countryCode,
        currency,
        country,
        detected: true,
      });
    } catch {
      // Keep defaults (US/USD) if detection fails
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_WISHLIST);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setWishlist(parsed);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_WISHLIST, JSON.stringify(wishlist));
    } catch {
      // ignore
    }
  }, [wishlist]);

  useEffect(() => {
    try {
      localStorage.setItem("fos_shopping_mode", shoppingMode);
    } catch {
      // ignore
    }
  }, [shoppingMode]);

  useEffect(() => {
    void detectBuyerLocation();
  }, [detectBuyerLocation]);

  const quickPrompts = [
    "White sneakers under $100",
    "Casual summer shirt",
    "Black cargo pants",
    "Minimalist blazer",
    "Running shoes",
  ];

  const normalizeProducts = (json) => {
    const root = json && typeof json === "object" ? json : {};
    const list = Array.isArray(json)
      ? json
      : Array.isArray(root.products)
        ? root.products
        : Array.isArray(root.results)
          ? root.results
          : Array.isArray(root.items)
            ? root.items
            : Array.isArray(root.hits)
              ? root.hits
              : [];
    return filterQualityProducts(list)
      .map((p) => {
        const obj = p && typeof p === "object" ? p : {};
        const product = obj.product && typeof obj.product === "object" ? obj.product : obj;
        const variant = product.variants?.[0];
        const upid = product.upid || product.id || obj.upid || obj.id || "";
        const title = product.title || product.name || obj.title || "";
        const productUrl =
          variant?.variantUrl ||
          variant?.checkoutUrl ||
          product.url ||
          null;
        const storeName =
          variant?.shop?.name ||
          product.vendor ||
          "Shopify Store";
        const storeUrl = variant?.shop?.onlineStoreUrl || null;
        const imageUrl =
          variant?.media?.[0]?.url ||
          product.media?.[0]?.url ||
          null;
        const minPrice =
          variant?.price ??
          product.price_min ??
          product.min_price ??
          product.priceMin ??
          product.priceRange?.min ??
          null;
        const maxPrice =
          minPrice;
        const options = Array.isArray(product.options)
          ? product.options
          : Array.isArray(product.attributes)
            ? product.attributes
            : [];
        return { upid, title, productUrl, storeName, storeUrl, imageUrl, minPrice, maxPrice, options, raw: product };
      })
      .filter((p) => p.upid || p.title);
  };

  function filterQualityProducts(products) {
    return products.filter((product) => {
      if (!product.title || product.title.length < 5) return false;

      const variant = product.variants?.[0];
      const hasImage =
        variant?.media?.[0]?.url ||
        product.media?.[0]?.url;
      if (!hasImage) return false;

      // Min price $5 (500 cents)
      const amount = parseFloat(
        variant?.price?.amount ||
        product.priceRange?.min?.amount ||
        0
      );
      if (amount < 500) return false;

      return true;
    });
  }

  function rankProductsForUser(products, userQuery, profile, category) {
    const query = (userQuery || "").toLowerCase();

    // Extract color intent from query
    const colorKeywords = ["white", "black", "blue", "red", "grey",
      "gray", "green", "brown", "navy", "beige", "cream"];
    const wantedColor = colorKeywords.find(c => query.includes(c));

    return products
      .map(product => {
        let score = 0;
        const title = (product.title || "").toLowerCase();
        const variant = product.variants?.[0] || product.raw?.variants?.[0];
        const allOptions = (product.options || [])
          .flatMap(o => (o.values || []).map(v =>
            String(v.value || v).toLowerCase()
          ));
        const allText = title + " " + allOptions.join(" ");

        // +5 if color matches query
        if (wantedColor && allText.includes(wantedColor)) score += 5;

        // +4 if user's size found
        if (category === "Shoes" && profile?.shoeSize) {
          const size = String(profile.shoeSize);
          if (allOptions.some(o => o === size || o.includes(size))) {
            score += 4;
          }
        }
        if (category === "Tops" && profile?.topSize) {
          const size = profile.topSize.toLowerCase();
          if (allOptions.some(o => o === size)) score += 4;
        }
        if (category === "Bottoms" && profile?.bottomSize) {
          const size = String(profile.bottomSize);
          if (allOptions.some(o => o.includes(size))) score += 4;
        }

        // +3 if gender matches
        const gender = profile?.gender === "female" ? "women" : "men";
        if (title.includes(gender) || title.includes("mens") ||
            title.includes("womens")) score += 3;

        // +2 if preferred brand
        const brands = (profile?.brands || []).map(b => b.toLowerCase());
        if (brands.some(b => title.includes(b))) score += 2;

        // +1 if highly rated
        const rating = variant?.rating?.rating || product.rating?.rating || 0;
        if (rating >= 4.5) score += 1;

        // -3 if wrong color explicitly
        if (wantedColor) {
          const wrongColors = colorKeywords.filter(c => c !== wantedColor);
          const titleWords = title.split(/\s+/);
          if (wrongColors.some(c => titleWords.includes(c) &&
              !title.includes(wantedColor))) score -= 3;
        }

        return { ...product, _score: score };
      })
      .sort((a, b) => b._score - a._score);
  }

  function formatShopifyPrice(priceObj) {
    if (!priceObj) return "";

    let amount = 0;
    let currency = "USD";

    if (typeof priceObj === "number") {
      amount = priceObj;
    } else if (typeof priceObj === "string") {
      amount = parseFloat(priceObj) || 0;
    } else if (typeof priceObj === "object") {
      amount = parseFloat(priceObj.amount || 0);
      currency = (priceObj.currency || "USD").toUpperCase();
    }

    // USD and CAD use cents (divide by 100)
    // Only handle USD/CAD since server filters everything else
    const dollars = amount / 100;
    const symbol = currency === "CAD" ? "CAD " : "$";
    return `${symbol}${dollars.toFixed(2)}`;
  }

  const formatPriceRange = (p) => {
    if (!p) return "—";
    const min = formatShopifyPrice(p.minPrice);
    const max = formatShopifyPrice(p.maxPrice);
    if (min && max && min === max) return min;
    if (min && max) return `${min}–${max}`;
    if (min) return min;
    if (max) return max;
    return "—";
  };

  const productUrlFromShopify = (product) =>
    product?.variants?.[0]?.variantUrl ||
    product?.variants?.[0]?.checkoutUrl ||
    product?.url ||
    null;

  const shoppingModeKeywords = () => {
    if (shoppingMode === "secondhand") return "secondhand used resale";
    return "";
  };

  const isSecondhandProduct = (p) => {
    const product = p?.raw || p;
    return product?.variants?.[0]?.secondhand === true;
  };

  const shoppingBadgeText = (p) => {
    if (allowSecondhand && isSecondhandProduct(p)) return "♻️ Secondhand";
    return "";
  };

  const optionSummary = (p) => {
    const opts = Array.isArray(p?.options) ? p.options : [];
    if (!opts.length) return "";
    const pick = (needle) => opts.find((o) => String(o?.name || "").toLowerCase().includes(needle)) || null;
    const sizeOpt = pick("size");
    const colorOpt = pick("color");
    const parts = [];
    const fmt = (o) => {
      const name = String(o?.name || "").trim();
      const vals = Array.isArray(o?.values) ? o.values : Array.isArray(o?.options) ? o.options : [];
      const preview = vals
        .slice(0, 3)
        .map((v) => (typeof v === "string" ? v : v?.value || v?.name || ""))
        .filter(Boolean)
        .join(", ");
      if (!preview) return "";
      return name ? `${name}: ${preview}` : preview;
    };
    if (sizeOpt) parts.push(fmt(sizeOpt));
    if (colorOpt) parts.push(fmt(colorOpt));
    if (!parts.filter(Boolean).length) {
      parts.push(fmt(opts[0]));
      if (opts[1]) parts.push(fmt(opts[1]));
    }
    return parts.filter(Boolean).slice(0, 2).join(" • ");
  };

  const addToWishlist = (p) => {
    if (!p) return;
    const item = {
      id: p.upid || Date.now(),
      title: String(p.title || "").trim(),
      price: formatPriceRange(p),
      store: p.storeName || "—",
      imageUrl: p.imageUrl || "",
      productUrl: p.productUrl || "",
      addedAt: new Date().toISOString(),
    };
    setWishlist((w) => {
      const exists = w.some((x) => x.productUrl && item.productUrl && x.productUrl === item.productUrl);
      if (exists) return w;
      return [item, ...w];
    });
  };

  const removeFromWishlist = (id) => {
    setWishlist((w) => w.filter((x) => x.id !== id));
  };

  const top3Line = (products) =>
    (Array.isArray(products) ? products.slice(0, 3) : [])
      .map((p) => `${p.title}${formatPriceRange(p) !== "—" ? ` (${formatPriceRange(p)})` : ""}`)
      .filter(Boolean)
      .join("; ");

  function detectOutfitIntent(query) {
    const outfitKeywords = [
      "outfit", "set", "look", "combination", "complete",
      "full", "head to toe", "head-to-toe", "put together",
    ];
    const multiItemPatterns = [
      /pants?.+shirt/i, /shirt.+pants/i,
      /shoes?.+shirt/i, /shirt.+shoes/i,
      /pants?.+shoes/i, /shoes?.+pants/i,
      /top.+bottom/i, /jacket.+shirt/i,
      /outfit/i, /set of cloth/i, /set of clothes/i,
    ];
    const lowerQuery = query.toLowerCase();
    return (
      outfitKeywords.some((k) => lowerQuery.includes(k)) ||
      multiItemPatterns.some((p) => p.test(query))
    );
  }

  function getStyleKeywords(profileForSearch) {
    const styleMap = {
      Minimalist: ["minimalist", "clean", "simple", "slim fit"],
      "Casual chic": ["casual", "smart casual", "everyday", "relaxed"],
      Streetwear: ["streetwear", "urban", "graphic", "oversized"],
      "Business formal": ["formal", "business", "dress", "tailored", "slim fit"],
      Bohemian: ["boho", "bohemian", "flowy", "relaxed"],
      Sporty: ["athletic", "sport", "activewear", "performance"],
      Romantic: ["soft", "floral", "feminine", "elegant"],
      Edgy: ["edgy", "bold", "moto", "leather", "dark"],
      Classic: ["classic", "timeless", "traditional", "polo"],
      Eclectic: ["unique", "colorful", "pattern", "mixed"],
    };

    const keywords = [];
    (profileForSearch?.styles || []).forEach((style) => {
      const mapped = styleMap[style];
      if (mapped) keywords.push(mapped[0]); // take primary keyword
    });
    return keywords.slice(0, 2).join(" "); // max 2 style keywords
  }

  function getAntiKeywords(profileForSearch) {
    const antiMap = {
      Minimalist: ["maximalist", "loud", "neon", "busy print"],
      "Casual chic": ["gown", "black tie", "costume"],
      Streetwear: ["formal suit", "tuxedo", "ball gown"],
      "Business formal": ["ripped", "distressed", "graphic tee", "hoodie"],
      Bohemian: ["corporate", "business suit"],
      Sporty: ["stiletto", "evening gown"],
      Romantic: ["moto", "combat", "industrial"],
      Edgy: ["floral", "ruffle", "pastel"],
      Classic: ["novelty", "costume", "avant garde"],
      Eclectic: ["uniform", "plain basic"],
    };

    const out = [];
    (profileForSearch?.styles || []).forEach((style) => {
      if (antiMap[style]) out.push(...antiMap[style]);
    });
    return [...new Set(out)];
  }

  function filterResultsForProfile(products, profileForSearch, category) {
    if (!products || !products.length) return products;

    return products.filter(product => {
      const variant = product.variants?.[0] || product.raw?.variants?.[0];
      const title = (product.title || "").toLowerCase();
      const storeName = (variant?.shop?.name || "").toLowerCase();
      const allOptions = (variant?.options || product.options || [])
        .map(o => String(o).toLowerCase());

      // --- Size filter ---
      // Only apply size filter if we have a size for this category
      if (category === "Shoes" && profileForSearch?.shoeSize) {
        const size = String(profileForSearch.shoeSize);
        const hasSize =
          allOptions.some(o => o.includes(size)) ||
          title.includes(`size ${size}`) ||
          title.includes(`us ${size}`);
        // Don't hard reject — Shopify variant data is inconsistent
        // Just deprioritize — we'll sort later
        void hasSize;
      }

      if ((category === "Tops") && profileForSearch?.topSize) {
        const size = profileForSearch.topSize.toLowerCase();
        const hasSize =
          allOptions.some(o => o === size || o.includes(size)) ||
          title.includes(` ${size} `) ||
          title.includes(`size ${size}`);
        // Same — don't hard reject
        void hasSize;
      }

      // --- Style keyword filter ---
      // If product title contains completely opposite style words, exclude
      const styleKw = getStyleKeywords(profileForSearch).toLowerCase();
      const antiKeywords = getAntiKeywords(profileForSearch);
      if (antiKeywords.some(kw => title.includes(kw))) return false;

      void storeName;
      void styleKw;
      return true;
    });
  }

  function getBrandKeywords(profileForSearch) {
    const preferred = profileForSearch?.brands || [];

    // Return first preferred brand if set
    if (preferred.length > 0) return preferred[0];

    // Otherwise infer from style
    const styles = profileForSearch?.styles || [];
    if (styles.includes("Sporty")) return "Nike OR Adidas OR Uniqlo";
    if (styles.includes("Minimalist")) return "Uniqlo OR COS OR Zara";
    if (styles.includes("Streetwear")) return "Nike OR ASOS";
    if (styles.includes("Business formal")) return "Zara OR Mango OR COS";
    return "";
  }

  function extractOutfitItems(query, profileForSearch) {
    const gender = profileForSearch?.gender === "female" ? "womens" : "mens";
    const q = query.toLowerCase();
    const items = [];

    if (q.includes("shirt") || q.includes("top") ||
        q.includes("blouse") || q.includes("tee")) {
      items.push({
        category: "Tops", label: "👕 Shirt / Top",
        query: `${gender} shirt`,
      });
    }
    if (q.includes("pant") || q.includes("trouser") ||
        q.includes("jean") || q.includes("bottom")) {
      items.push({
        category: "Bottoms", label: "👖 Pants / Bottoms",
        query: `${gender} pants`,
      });
    }
    if (q.includes("shoe") || q.includes("sneaker") ||
        q.includes("boot") || q.includes("footwear")) {
      items.push({
        category: "Shoes", label: "👟 Shoes",
        query: `${gender} shoes`,
      });
    }
    if (q.includes("jacket") || q.includes("coat") ||
        q.includes("outerwear") || q.includes("blazer")) {
      items.push({
        category: "Outerwear", label: "🧥 Jacket",
        query: `${gender} jacket`,
      });
    }

    // Default: shirt + pants + shoes if no specific items detected
    if (items.length === 0) {
      items.push(
        {
          category: "Tops", label: "👕 Shirt / Top",
          query: `${gender} shirt`,
        },
        {
          category: "Bottoms", label: "👖 Pants / Bottoms",
          query: `${gender} pants`,
        },
        {
          category: "Shoes", label: "👟 Shoes",
          query: `${gender} shoes`,
        }
      );
    }
    return items;
  }

  function findWardrobeMatches(category, query, wardrobeItems) {
    if (!category || !wardrobeItems || wardrobeItems.length === 0) return [];
    void query;
    const categoryLower = category.toLowerCase();

    return wardrobeItems.filter((item) => {
      const itemCategory = item.category?.toLowerCase();
      // Match by category first
      const categoryMatch =
        itemCategory === categoryLower ||
        (category === "Tops" &&
          ["tops", "shirt", "tshirt", "blouse", "sweater"]
            .includes(itemCategory)) ||
        (category === "Bottoms" &&
          ["bottoms", "pants", "jeans", "shorts", "trousers"]
            .includes(itemCategory)) ||
        (category === "Shoes" &&
          ["shoe", "shoes", "sneakers", "boots"].includes(itemCategory)) ||
        (category === "Outerwear" &&
          ["outerwear", "jacket", "coat", "blazer"].includes(itemCategory)) ||
        (category === "Dresses" &&
          ["dress", "dresses"].includes(itemCategory)) ||
        (category === "Bags" &&
          ["bag", "bags", "purse", "backpack"].includes(itemCategory));

      if (!categoryMatch) return false;

      // Also check laundry status — skip dirty items
      if (item.laundryStatus === "dirty" ||
          item.laundryStatus === "wash") return false;

      return true;
    });
  }

  async function evaluateWardrobeForOutfit(
    wardrobeMatches,
    outfitGroups,
    profileForEval
  ) {
    if (!wardrobeMatches || wardrobeMatches.length === 0) return null;

    const profileSummary = buildProfileSummary(profileForEval);

    // Describe owned items per category
    const ownedDesc = wardrobeMatches.map((match) =>
      `Category: ${match.forCategory || match.category}
     Name: ${match.name}
     Color: ${match.color}
     Style: ${match.style}
     Season: ${match.season}
     Description: ${match.description || "N/A"}`
    ).join("\n\n");

    // Describe what Shopify found
    const newDesc = outfitGroups.map((group) => {
      const top3 = group.products.slice(0, 3).map((p) =>
        `${p.title} - ${formatShopifyPrice(p.raw?.variants?.[0]?.price || p.minPrice || p.raw?.priceRange?.min)}`
      ).join(", ");
      return `${group.label}: ${top3}`;
    }).join("\n");

    const system = `You are a personal fashion stylist AI.
The user already owns these clothing items:
${ownedDesc}

These new items are available to purchase:
${newDesc}

User profile: ${profileSummary}

Your job:
1. Decide which owned items can be used in the outfit
2. Identify which categories still need a new purchase
3. Pick the best new item for missing categories
4. Create a cohesive outfit mixing owned + new items

Return ONLY valid JSON (no markdown):
{
  "usedOwned": [
    {
      "category": "Tops",
      "wardrobeItemName": "exact name from wardrobe",
      "reason": "why this works"
    }
  ],
  "stillNeed": [
    {
      "category": "Shoes",
      "pickedIndex": 0,
      "reason": "why this new item works with owned pieces"
    }
  ],
  "outfitName": "Creative outfit name",
  "styleNote": "One sentence on the complete look",
  "savingsNote": "e.g. You already own 2 of 3 pieces!"
}`;

    const user = "Build the best outfit mixing owned and new items.";

    try {
      const response = await callShoppingAssistant(system, user);
      const clean = response.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    } catch {
      return null;
    }
  }

  function detectCategory(query) {
    const q = query.toLowerCase();
    if (q.match(/shirt|top|tee|blouse|sweater|hoodie/)) return "Tops";
    if (q.match(/pant|jean|trouser|short|bottom/)) return "Bottoms";
    if (q.match(/shoe|sneaker|boot|loafer/)) return "Shoes";
    if (q.match(/jacket|coat|blazer|outerwear/)) return "Outerwear";
    if (q.match(/dress/)) return "Dresses";
    if (q.match(/bag|purse|backpack/)) return "Bags";
    return null;
  }

  async function pickBestOutfit(outfitGroups, profileForPick) {
    // Build a description of available items per category
    const itemDescriptions = outfitGroups.map((group) => {
      const items = group.products.slice(0, 4).map((p, i) =>
        `${i + 1}. ${p.title} - ${formatShopifyPrice(p.raw?.variants?.[0]?.price || p.minPrice || p.raw?.priceRange?.min)}`
      ).join("\n");
      return `${group.label}:\n${items}`;
    }).join("\n\n");

    const profileSummary = buildProfileSummary(profileForPick);

    const system = `You are a fashion stylist AI. 
Given a list of clothing items per category, 
pick ONE item from each category that best 
matches together as a cohesive outfit.
Prioritize items that match the color requested in the user's query. If user asked for white sneakers, only pick white shoes from the results.
Consider color harmony, style consistency, 
and occasion appropriateness.
User profile: ${profileSummary}

Return ONLY valid JSON (no markdown):
{
  "picks": [
    { "category": "Tops", "index": 0, "reason": "why this works" },
    { "category": "Bottoms", "index": 1, "reason": "why this works" },
    { "category": "Shoes", "index": 0, "reason": "why this works" }
  ],
  "outfitName": "Creative outfit name",
  "styleNote": "One sentence on why these work together"
}
index is 0-based position in the category list.`;

    const user = `Pick the best matching outfit from these options:\n\n${itemDescriptions}`;

    try {
      const response = await callShoppingAssistant(system, user);
      const clean = response.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    } catch {
      return null;
    }
  }

  const sendMessage = async (text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed || loading) return;

    setError("");
    setSelectedProduct(null);
    setLastQuery(trimmed);

    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    setMessages((m) => [...m, { id, role: "user", content: trimmed, products: [] }]);
    setInput("");
    setLoading(true);

    const userInput = trimmed;
    const userQuery = userInput;
    // Extract core item only — strip price text,
    // adjectives, brand names, sizes
    function buildCleanQuery(userInput, profile) {
      const gender = profile?.gender === "female"
        ? "womens" : "mens";

      // Extract just the item type from user input
      // Remove price mentions, size mentions, brand names
      const cleaned = userInput
        .replace(/under\s*\$?\d+/gi, "")
        .replace(/\$\d+/g, "")
        .replace(/size\s*[\d.]+/gi, "")
        .replace(/\b(athletic|classic|casual|formal|sporty|minimal)\b/gi, "")
        .trim();

      // Keep it short — just gender + item
      return `${gender} ${cleaned}`.trim();
    }

    const cleanQuery = buildCleanQuery(userInput, profile);

    const budgetMaxPrice = {
      "budget":    50,
      "mid-range": 150,
      "premium":   400,
      "luxury":    null,
      "mixed":     null,
    };

    const maxPrice = budgetMaxPrice[profile?.budget] ?? null;

    // Also check if user typed a price in their message
    const priceMatch = userInput?.match(/under\s*\$?(\d+)/i);
    const userMaxPrice = priceMatch ? parseInt(priceMatch[1]) : null;

    // Use the lower of the two if both exist
    const finalMaxPrice = userMaxPrice && maxPrice
      ? Math.min(userMaxPrice, maxPrice)
      : userMaxPrice || maxPrice || null;

    try {
      const isOutfit = detectOutfitIntent(userQuery);

      if (isOutfit) {
        const outfitItems = extractOutfitItems(userQuery, profile);

        const results = await Promise.all(
          outfitItems.map((item) =>
            searchShopifyCatalog(item.query, {
              max_price: finalMaxPrice,
              country_code: buyerLocation.country_code,
              currency: buyerLocation.currency,
              allow_secondhand: allowSecondhand,
              limit: 4,
            })
              .then((data) => ({
                ...item,
                products: rankProductsForUser(
                  filterResultsForProfile(normalizeProducts(data), profile, item.category),
                  item.query,
                  profile,
                  item.category
                ).slice(0, 6),
              }))
              .catch(() => ({ ...item, products: [] }))
          )
        );

        // Step 1: Find matching wardrobe items per category
        const allWardrobeMatches = [];
        results.forEach((group) => {
          const matches = findWardrobeMatches(
            group.category,
            group.query || "",
            wardrobe
          );
          matches.forEach((m) => allWardrobeMatches.push({
            ...m,
            forCategory: group.category,
          }));
        });

        // Step 2: Ask Claude to mix owned + new
        const aiMix = await evaluateWardrobeForOutfit(
          allWardrobeMatches,
          results,
          profile
        );

        // Step 3: Build enriched results with owned items flagged
        const resultsWithOwned = results.map((group) => {
          // Check if Claude said to use an owned item for this category
          const usedOwned = aiMix?.usedOwned?.find(
            (u) => u.category === group.category
          );
          const stillNeed = aiMix?.stillNeed?.find(
            (s) => s.category === group.category
          );

          // Find the actual wardrobe item
          const ownedItem = usedOwned
            ? allWardrobeMatches.find(
                (m) => m.forCategory === group.category &&
                     m.name === usedOwned.wardrobeItemName
              ) || allWardrobeMatches.find(
                (m) => m.forCategory === group.category
              )
            : null;

          return {
            ...group,
            ownedItem,          // wardrobe item if Claude chose to use it
            ownedReason: usedOwned?.reason || "",
            pickedIndex: stillNeed?.pickedIndex ?? 0,
            pickReason: stillNeed?.reason ?? "",
            useOwned: !!usedOwned && !!ownedItem,
          };
        });

        const outfitMessage = {
          id: Date.now(),
          role: "assistant",
          content: aiMix?.styleNote ||
            "Here's your outfit mixing what you own with new picks!",
          outfitGroups: resultsWithOwned,
          outfitName: aiMix?.outfitName || "Your Complete Look",
          savingsNote: aiMix?.savingsNote || "",
          products: [],
        };

        setMessages((prev) => [...prev, outfitMessage]);
        setLoading(false);
        return;
      }

      // Check if user already owns something similar
      const category = detectCategory(userQuery);
      const existingItems = category
        ? findWardrobeMatches(category, userQuery, wardrobe)
        : [];

      if (existingItems.length > 0) {
        setMessages((m) => [
          ...m,
          {
            id: Date.now() - 1,
            role: "assistant",
            content: `By the way, you already own ${existingItems.length} ${category?.toLowerCase() || "item"}(s) that might work:
${existingItems.map((i) => `• ${i.name} (${i.color || "color not set"})`).join("\n")}

Here's what else is available if you want something new:`,
            products: [],
          },
        ]);
      }

      const json = await searchShopifyCatalog(cleanQuery, {
        max_price: finalMaxPrice,
        country_code: buyerLocation.country_code,
        currency: buyerLocation.currency,
        limit: 10,
        allow_secondhand: allowSecondhand,
      });
      const products = rankProductsForUser(
        filterResultsForProfile(normalizeProducts(json), profile, category),
        userInput,
        profile,
        category
      );

      if (!products.length) {
        const aid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "a";
        setMessages((m) => [
          ...m,
          { id: aid, role: "assistant", content: "No products found. Try a different search term.", products: [] },
        ]);
        return;
      }

      const profileSummary = buildProfileSummary(profile);
      const system = `You are ARLO, a personal fashion shopping assistant.
User profile: ${profileSummary}.
Shoe size: ${profile?.shoeSize || "not set"}, 
Gender: ${profile?.gender || "not set"},
Style: ${Array.isArray(profile?.styles) ? profile.styles.join(", ") : "not set"},
Budget: ${profile?.budget || "not set"}.
Budget price filters use Shopify Catalog dollar-based price filters.
The user searched for: ${userQuery}
Shopify Catalog returned ${products.length} products matching their
profile (size, gender, style already filtered).
Top results: ${top3Line(products)}.
Write a helpful 2-3 sentence response. 
Mention the size and style match. Be concise.`;

      let assistantText = "";
      try {
        assistantText = await callShoppingAssistant(system, userQuery);
      } catch {
        assistantText = "Here are a few great matches from the Shopify Catalog.";
      }

      const aid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "a";
      setMessages((m) => [...m, { id: aid, role: "assistant", content: assistantText, products }]);
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (msg.includes("credentials missing")) {
        setError(
          "Shopify Catalog not configured. Add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET to your server .env file."
        );
      } else {
        setError(msg || "Something went wrong.");
      }
      const eid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "e";
      setMessages((m) => [...m, { id: eid, role: "assistant", content: "I hit an error fetching products.", products: [] }]);
    } finally {
      setLoading(false);
    }
  };

  const openDetails = async (p) => {
    if (!p?.upid) return;
    setSelectedProduct({ ...p, loading: true });
    try {
      const details = await getShopifyProductDetails(p.upid);
      setSelectedProduct({ ...p, details, loading: false });
    } catch (e) {
      setSelectedProduct({ ...p, loading: false, error: e?.message || "Product lookup failed." });
    }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.75rem", fontWeight: 600, margin: "0 0 6px" }}>
          Shopping Agent
        </div>
        <div style={{ color: COLORS.textMuted, fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif" }}>
          Real products from millions of Shopify stores
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setView("chat")}
          style={{
            padding: "8px 16px",
            borderRadius: 999,
            border: `1px solid ${view === "chat" ? COLORS.primary : COLORS.border}`,
            background: view === "chat" ? COLORS.primarySoft : COLORS.surface2,
            color: view === "chat" ? COLORS.text : COLORS.textMuted,
            cursor: "pointer",
            fontSize: "0.85rem",
            transition: baseTransition,
          }}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => setView("wishlist")}
          style={{
            padding: "8px 16px",
            borderRadius: 999,
            border: `1px solid ${view === "wishlist" ? COLORS.primary : COLORS.border}`,
            background: view === "wishlist" ? COLORS.primarySoft : COLORS.surface2,
            color: view === "wishlist" ? COLORS.text : COLORS.textMuted,
            cursor: "pointer",
            fontSize: "0.85rem",
            transition: baseTransition,
          }}
        >
          Wishlist
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
        {[
          { id: "new", label: "New only" },
          { id: "secondhand", label: "Secondhand / Resale" },
          { id: "both", label: "Both" },
        ].map((mode) => {
          const active = shoppingMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setShoppingMode(mode.id)}
              style={{
                padding: "7px 12px",
                borderRadius: 999,
                border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
                background: active ? COLORS.primarySoft : COLORS.surface2,
                color: active ? COLORS.text : COLORS.textMuted,
                cursor: "pointer",
                fontSize: "0.78rem",
                transition: baseTransition,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 12,
        fontSize: "0.75rem",
        color: COLORS.muted || COLORS.textMuted,
      }}>
        <span>📍</span>
        <span>
          {buyerLocation.detected
            ? `Showing prices in ${buyerLocation.currency} · ${buyerLocation.country}`
            : "Detecting your location…"}
        </span>
        <button
          type="button"
          onClick={() => void detectBuyerLocation()}
          style={{
            background: "transparent",
            border: "none",
            color: COLORS.accent || COLORS.primary,
            cursor: "pointer",
            fontSize: "0.72rem",
            padding: 0,
            fontFamily: "'DM Sans', sans-serif",
            textDecoration: "underline",
          }}
        >
          refresh
        </button>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
      }}>
        <button
          type="button"
          onClick={() => setAllowSecondhand((v) => !v)}
          style={{
            padding: "5px 14px",
            borderRadius: 20,
            border: `1px solid ${allowSecondhand ? (COLORS.accent || COLORS.primary) : COLORS.border}`,
            background: allowSecondhand ? (COLORS.accentLight || COLORS.primarySoft) : "transparent",
            color: allowSecondhand ? (COLORS.accent || COLORS.primary) : (COLORS.muted || COLORS.textMuted),
            cursor: "pointer",
            fontSize: "0.75rem",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          ♻️ {allowSecondhand ? "Secondhand ON" : "New items only"}
        </button>
      </div>

      {error ? (
        <div style={mergeStyles(ui.softPanel, { padding: "14px 16px", marginBottom: 14, border: `1px solid ${COLORS.border}` })}>
          <div style={{ fontWeight: 800, marginBottom: 6, color: COLORS.text }}>Error</div>
          <div style={{ color: COLORS.textMuted, fontSize: "0.9rem", lineHeight: 1.5, marginBottom: 12 }}>{error}</div>
          <button
            type="button"
            disabled={!lastQuery || loading}
            onClick={() => {
              if (lastQuery) void sendMessage(lastQuery);
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surface2,
              color: COLORS.text,
              cursor: !lastQuery || loading ? "default" : "pointer",
              transition: baseTransition,
              fontWeight: 800,
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {view === "chat" ? (
        <>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 14 }}>
            {quickPrompts.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void sendMessage(q)}
                disabled={loading}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface2,
                  color: COLORS.textMuted,
                  cursor: loading ? "default" : "pointer",
                  fontSize: "0.78rem",
                  transition: baseTransition,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {q}
              </button>
            ))}
          </div>

          <div
            style={{
              background: COLORS.surface,
              borderRadius: 12,
              border: `1px solid ${COLORS.border}`,
              padding: 16,
              minHeight: 320,
              maxHeight: 520,
              overflowY: "auto",
              marginBottom: 12,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages.length === 0 ? (
              <p style={{ color: COLORS.textMuted, margin: 0, fontSize: "0.9rem" }}>
                Ask for an item and I’ll fetch real products from the Shopify Catalog.
              </p>
            ) : null}

            {messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 10 }}>
                  <div
                    style={{
                      maxWidth: "92%",
                      padding: "10px 14px",
                      borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                      background: isUser ? COLORS.primary : COLORS.surface2,
                      color: isUser ? "#FFFFFF" : COLORS.text,
                      fontSize: "0.9rem",
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {msg.content}
                  </div>

                  {!isUser && Array.isArray(msg.outfitGroups) && msg.outfitGroups.length ? (
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
                      {(() => {
                        // Get the AI-picked item from each group
                        const pickedItems = msg.outfitGroups.map((group) => ({
                          ...group,
                          picked: group.useOwned ? group.ownedItem : group.products[group.pickedIndex ?? 0],
                        })).filter((g) => g.useOwned ? g.ownedItem : g.picked);
                        const accent = COLORS.accent || COLORS.primary;
                        const muted = COLORS.muted || COLORS.textMuted;

                        return (
                          <div style={{
                            background: COLORS.surface,
                            border: `2px solid ${accent}`,
                            borderRadius: 16,
                            padding: 20,
                            marginBottom: 24,
                          }}>
                            {/* Header */}
                            <div style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 16,
                            }}>
                              <div>
                                <div style={{
                                  fontSize: "0.7rem",
                                  letterSpacing: "0.15em",
                                  color: accent,
                                  textTransform: "uppercase",
                                  fontFamily: "'DM Sans', sans-serif",
                                  marginBottom: 4,
                                }}>✦ Complete This Look</div>
                                <div style={{
                                  fontFamily: "'Cormorant Garamond', serif",
                                  fontSize: "1.2rem",
                                  fontWeight: 600,
                                  color: COLORS.text,
                                }}>{msg.outfitName}</div>
                                {msg.savingsNote && (
                                  <div style={{
                                    display: "inline-block",
                                    background: `${COLORS.green || "#27ae60"}22`,
                                    border: `1px solid ${COLORS.green || "#27ae60"}`,
                                    borderRadius: 20,
                                    padding: "4px 12px",
                                    fontSize: "0.75rem",
                                    color: COLORS.green || "#27ae60",
                                    fontWeight: 600,
                                    marginTop: 6,
                                  }}>
                                    💚 {msg.savingsNote}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Picked items side by side */}
                            <div style={{
                              display: "flex",
                              gap: 12,
                              marginBottom: 16,
                              flexWrap: "wrap",
                            }}>
                              {pickedItems.map((group) => {
                                if (group.useOwned && group.ownedItem) {
                                  const ownedImg = group.ownedItem.imagePreview || group.ownedItem.imageUrl || group.ownedItem.photoUrl;
                                  return (
                                    // OWNED ITEM display
                                    <div key={group.category} style={{
                                      flex: 1,
                                      minWidth: 100,
                                      maxWidth: 140,
                                      position: "relative",
                                    }}>
                                      {/* "OWNED" badge */}
                                      <div style={{
                                        position: "absolute",
                                        top: -8,
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        background: COLORS.green || "#27ae60",
                                        color: "#fff",
                                        fontSize: "0.6rem",
                                        fontWeight: 700,
                                        padding: "2px 8px",
                                        borderRadius: 20,
                                        letterSpacing: "0.1em",
                                        whiteSpace: "nowrap",
                                        zIndex: 1,
                                      }}>✓ YOU OWN THIS</div>

                                      {/* Image from wardrobe */}
                                      <div style={{
                                        width: "100%",
                                        aspectRatio: "3/4",
                                        borderRadius: 10,
                                        overflow: "hidden",
                                        background: COLORS.card,
                                        border: `2px solid ${COLORS.green || "#27ae60"}`,
                                        marginBottom: 8,
                                        marginTop: 8,
                                      }}>
                                        {ownedImg ? (
                                          <img
                                            src={ownedImg}
                                            alt={group.ownedItem.name}
                                            style={{
                                              width: "100%",
                                              height: "100%",
                                              objectFit: "cover",
                                            }}
                                          />
                                        ) : (
                                          <div style={{
                                            width: "100%",
                                            height: "100%",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: "2rem",
                                          }}>👗</div>
                                        )}
                                      </div>

                                      <div style={{
                                        fontSize: "0.7rem",
                                        color: COLORS.green || "#27ae60",
                                        letterSpacing: "0.1em",
                                        textTransform: "uppercase",
                                        marginBottom: 2,
                                        fontFamily: "'DM Sans', sans-serif",
                                      }}>{group.label}</div>
                                      <div style={{
                                        fontSize: "0.78rem",
                                        color: COLORS.text,
                                        lineHeight: 1.3,
                                        marginBottom: 4,
                                      }}>{group.ownedItem.name}</div>
                                      <div style={{
                                        fontSize: "0.72rem",
                                        color: COLORS.green || "#27ae60",
                                        fontWeight: 600,
                                      }}>Already owned ✓</div>
                                      {group.ownedReason && (
                                        <div style={{
                                          fontSize: "0.68rem",
                                          color: muted,
                                          fontStyle: "italic",
                                          marginTop: 4,
                                          lineHeight: 1.4,
                                        }}>{group.ownedReason}</div>
                                      )}
                                    </div>
                                  );
                                }

                                const product = group.picked.raw || group.picked;
                                const variant = product.variants?.[0];
                                const imgUrl =
                                  variant?.media?.[0]?.url ||
                                  product.media?.[0]?.url ||
                                  group.picked.imageUrl ||
                                  null;
                                return (
                                  <div key={group.category} style={{
                                    flex: 1,
                                    minWidth: 100,
                                    maxWidth: 140,
                                  }}>
                                    {/* Image */}
                                    <div style={{
                                      width: "100%",
                                      aspectRatio: "3/4",
                                      borderRadius: 10,
                                      overflow: "hidden",
                                      background: COLORS.card,
                                      border: `1px solid ${COLORS.border}`,
                                      marginBottom: 8,
                                      position: "relative",
                                    }}>
                                      {imgUrl ? (
                                        <img
                                          src={imgUrl}
                                          alt={group.picked.title}
                                          style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover",
                                          }}
                                        />
                                      ) : (
                                        <div style={{
                                          width: "100%",
                                          height: "100%",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontSize: "1.5rem",
                                        }}>
                                          {group.label.split(" ")[0]}
                                        </div>
                                      )}
                                      {allowSecondhand && variant?.secondhand && (
                                        <div style={{
                                          position: "absolute",
                                          bottom: 6,
                                          left: 6,
                                          background: "rgba(39,174,96,0.9)",
                                          color: "#fff",
                                          fontSize: "0.6rem",
                                          fontWeight: 700,
                                          padding: "2px 6px",
                                          borderRadius: 4,
                                        }}>♻️ Secondhand</div>
                                      )}
                                    </div>
                                    {/* Label */}
                                    <div style={{
                                      fontSize: "0.7rem",
                                      color: accent,
                                      letterSpacing: "0.1em",
                                      textTransform: "uppercase",
                                      marginBottom: 2,
                                      fontFamily: "'DM Sans', sans-serif",
                                    }}>{group.label}</div>
                                    {/* Name */}
                                    <div style={{
                                      fontSize: "0.78rem",
                                      color: COLORS.text,
                                      lineHeight: 1.3,
                                      marginBottom: 4,
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical",
                                      overflow: "hidden",
                                    }}>{group.picked.title}</div>
                                    {/* Price */}
                                    <div style={{
                                      fontSize: "0.78rem",
                                      color: accent,
                                      fontWeight: 600,
                                    }}>
                                      {formatShopifyPrice(variant?.price || group.picked.minPrice || product.priceRange?.min)}
                                    </div>
                                    {/* Pick reason */}
                                    {group.pickReason && (
                                      <div style={{
                                        fontSize: "0.68rem",
                                        color: muted,
                                        fontStyle: "italic",
                                        marginTop: 4,
                                        lineHeight: 1.4,
                                      }}>{group.pickReason}</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Total estimate */}
                            {(() => {
                              const total = pickedItems.reduce((sum, group) => {
                                if (group.useOwned) return sum; // skip owned items
                                const product = group.picked.raw || group.picked;
                                const variant = product.variants?.[0];
                                const priceObj =
                                  variant?.price ||
                                  group.picked?.minPrice ||
                                  product.priceRange?.min;
                                if (!priceObj) return sum;

                                const currency = priceObj.currency || "";
                                if (currency && !["USD", "CAD", "usd", "cad"]
                                  .includes(currency)) return sum;

                                // Divide by 100 — Shopify prices are in cents
                                const amount = parseFloat(priceObj.amount || 0) / 100;
                                return sum + amount;
                              }, 0);
                              return total > 0 ? (
                                <div style={{
                                  fontSize: "0.82rem",
                                  color: muted,
                                  marginBottom: 16,
                                }}>
                                  Estimated total:
                                  <strong style={{ color: COLORS.text, marginLeft: 6 }}>
                                    ~${total.toFixed(2)}
                                  </strong>
                                  <span style={{
                                    color: muted,
                                    fontSize: "0.72rem",
                                    marginLeft: 4,
                                  }}>
                                    {buyerLocation.currency}/USD
                                  </span>
                                </div>
                              ) : null;
                            })()}

                            {/* Action buttons */}
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {/* Add full outfit to wishlist */}
                              <button
                                onClick={() => {
                                  pickedItems.forEach((group) => {
                                    // Skip owned items — already in wardrobe
                                    if (group.useOwned) return;

                                    const product = group.picked.raw || group.picked;
                                    const variant = product.variants?.[0];
                                    const url = productUrlFromShopify(product);
                                    const imageUrl =
                                      variant?.media?.[0]?.url ||
                                      product.media?.[0]?.url ||
                                      group.picked.imageUrl ||
                                      null;
                                    const price = formatShopifyPrice(variant?.price || group.picked.minPrice || product.priceRange?.min);
                                    const store =
                                      variant?.shop?.name ||
                                      product.vendor ||
                                      "Shopify Store";
                                    const newItem = {
                                      id: product.id || product.upid || String(Date.now() + Math.random()),
                                      title: product.title || "Unknown product",
                                      price,
                                      store,
                                      imageUrl,
                                      productUrl: url,
                                      addedAt: new Date().toISOString(),
                                      outfitName: msg.outfitName,
                                    };
                                    setWishlist((prev) => {
                                      const exists = prev.some((i) => i.id === newItem.id);
                                      if (exists) return prev;
                                      const updated = [...prev, newItem];
                                      localStorage.setItem(
                                        STORAGE_WISHLIST,
                                        JSON.stringify(updated)
                                      );
                                      return updated;
                                    });
                                  });
                                }}
                                style={{
                                  flex: 1,
                                  padding: "11px 16px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: accent,
                                  color: "#FAF7F4",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  fontSize: "0.85rem",
                                  fontFamily: "'DM Sans', sans-serif",
                                }}
                              >
                                + Add Full Outfit to Wishlist
                              </button>

                              {/* Shop this look — opens modal */}
                              <button
                                onClick={() => {
                                  // Build a simple modal with all product links
                                  const links = pickedItems.filter((group) => !group.useOwned).map((group) => {
                                    const product = group.picked.raw || group.picked;
                                    const variant = product.variants?.[0];
                                    return {
                                      label: group.label,
                                      title: group.picked.title,
                                      price: formatShopifyPrice(variant?.price || group.picked.minPrice || product.priceRange?.min),
                                      url: productUrlFromShopify(product),
                                    };
                                  });
                                  setShopLookItems(links);
                                  setShowShopLookModal(true);
                                }}
                                style={{
                                  flex: 1,
                                  padding: "11px 16px",
                                  borderRadius: 8,
                                  border: `1px solid ${accent}`,
                                  background: "transparent",
                                  color: accent,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  fontSize: "0.85rem",
                                  fontFamily: "'DM Sans', sans-serif",
                                }}
                              >
                                Shop This Look →
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      {msg.outfitGroups.map((group) => (
                        <div key={`${msg.id}-${group.category}`} style={{ width: "100%" }}>
                          <div
                            style={{
                              fontFamily: "'Cormorant Garamond', serif",
                              fontSize: "1.1rem",
                              fontWeight: 700,
                              color: COLORS.text,
                              marginBottom: 8,
                            }}
                          >
                            {group.label}
                          </div>
                          {group.products.length ? (
                            <div style={{ width: "100%", overflowX: "auto", paddingBottom: 4 }}>
                              <div style={{ display: "flex", gap: 10, width: "max-content" }}>
                                {group.products.map((p, productIndex) => (
                                  <div
                                    key={p.upid || `${group.category}-${p.title}`}
                                    style={{
                                      position: "relative",
                                      width: 140,
                                      background: COLORS.card,
                                      border: `1px solid ${COLORS.border}`,
                                      borderRadius: 12,
                                      padding: 10,
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 8,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {group.pickedIndex === productIndex && (
                                      <div style={{
                                        position: "absolute",
                                        top: 6,
                                        left: 6,
                                        background: COLORS.accent || COLORS.primary,
                                        color: "#FAF7F4",
                                        fontSize: "0.65rem",
                                        fontWeight: 700,
                                        padding: "3px 7px",
                                        borderRadius: 6,
                                        letterSpacing: "0.05em",
                                        zIndex: 1,
                                      }}>✓ PICK</div>
                                    )}
                                    <div
                                      style={{
                                        width: 140,
                                        height: 160,
                                        borderRadius: 8,
                                        overflow: "hidden",
                                        background: COLORS.surface2,
                                        border: `1px solid ${COLORS.border}`,
                                        alignSelf: "center",
                                        position: "relative",
                                      }}
                                    >
                                      {p.imageUrl ? (
                                        <img
                                          src={p.imageUrl}
                                          alt={p.title || "Product image"}
                                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                        />
                                      ) : null}
                                      {allowSecondhand && (p.raw || p)?.variants?.[0]?.secondhand && (
                                        <div style={{
                                          position: "absolute",
                                          bottom: 6,
                                          left: 6,
                                          background: "rgba(39,174,96,0.9)",
                                          color: "#fff",
                                          fontSize: "0.6rem",
                                          fontWeight: 700,
                                          padding: "2px 6px",
                                          borderRadius: 4,
                                        }}>♻️ Secondhand</div>
                                      )}
                                    </div>
                                    <div
                                      style={{
                                        fontWeight: 700,
                                        fontSize: "0.85rem",
                                        color: COLORS.text,
                                        lineHeight: 1.25,
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                        minHeight: 36,
                                      }}
                                      title={p.title}
                                    >
                                      {p.title || "Untitled"}
                                    </div>
                                    <div style={{ color: COLORS.primary, fontWeight: 800, fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif" }}>
                                      {formatPriceRange(p)}
                                    </div>
                                    {shoppingBadgeText(p) ? (
                                      <div
                                        style={{
                                          alignSelf: "flex-start",
                                          padding: "3px 7px",
                                          borderRadius: 999,
                                          background: COLORS.surface2,
                                          color: COLORS.textMuted,
                                          fontSize: "0.7rem",
                                          fontWeight: 800,
                                        }}
                                      >
                                        {shoppingBadgeText(p)}
                                      </div>
                                    ) : null}
                                    {p.storeName && p.storeName !== "—" && p.storeName !== "" && (
                                      <div style={{ color: COLORS.muted, fontSize: "0.78rem" }}>
                                        {p.storeName}
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const product = p.raw || p;
                                        const url = productUrlFromShopify(product);
                                        if (url) window.open(url, "_blank", "noopener,noreferrer");
                                        else alert("Product URL not available");
                                      }}
                                      style={{
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        border: `1px solid ${COLORS.border}`,
                                        background: COLORS.surface2,
                                        color: COLORS.text,
                                        cursor: "pointer",
                                        transition: baseTransition,
                                        fontWeight: 700,
                                        fontSize: "0.82rem",
                                      }}
                                    >
                                      View product
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => addToWishlist(p)}
                                      style={{
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        border: `1px solid ${COLORS.border}`,
                                        background: COLORS.card,
                                        color: COLORS.text,
                                        cursor: "pointer",
                                        transition: baseTransition,
                                        fontWeight: 800,
                                        fontSize: "0.82rem",
                                      }}
                                    >
                                      Add to wishlist
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div style={mergeStyles(ui.softPanel, { padding: 12, color: COLORS.textMuted, fontSize: "0.85rem" })}>
                              No products found for this category.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {!isUser && Array.isArray(msg.products) && msg.products.length ? (
                    <div style={{ width: "100%", overflowX: "auto", paddingBottom: 4 }}>
                      <div style={{ display: "flex", gap: 10, width: "max-content" }}>
                        {msg.products.map((p) => (
                          <div
                            key={p.upid || `${msg.id}-${p.title}`}
                            style={{
                              width: 140,
                              background: COLORS.card,
                              border: `1px solid ${COLORS.border}`,
                              borderRadius: 12,
                              padding: 10,
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                width: 140,
                                height: 160,
                                borderRadius: 8,
                                overflow: "hidden",
                                background: COLORS.surface2,
                                border: `1px solid ${COLORS.border}`,
                                alignSelf: "center",
                                position: "relative",
                              }}
                            >
                              {p.imageUrl ? (
                                <img
                                  src={p.imageUrl}
                                  alt={p.title || "Product image"}
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />
                              ) : null}
                              {allowSecondhand && (p.raw || p)?.variants?.[0]?.secondhand && (
                                <div style={{
                                  position: "absolute",
                                  bottom: 6,
                                  left: 6,
                                  background: "rgba(39,174,96,0.9)",
                                  color: "#fff",
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                }}>♻️ Secondhand</div>
                              )}
                            </div>

                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                color: COLORS.text,
                                lineHeight: 1.25,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                minHeight: 36,
                              }}
                              title={p.title}
                            >
                              {p.title || "Untitled"}
                            </div>

                            <div style={{ color: COLORS.primary, fontWeight: 800, fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif" }}>
                              {formatPriceRange(p)}
                            </div>

                            {shoppingBadgeText(p) ? (
                              <div
                                style={{
                                  alignSelf: "flex-start",
                                  padding: "3px 7px",
                                  borderRadius: 999,
                                  background: COLORS.surface2,
                                  color: COLORS.textMuted,
                                  fontSize: "0.7rem",
                                  fontWeight: 800,
                                }}
                              >
                                {shoppingBadgeText(p)}
                              </div>
                            ) : null}

                            {p.storeName && p.storeName !== "—" && p.storeName !== "" && (
                              <div style={{ color: COLORS.muted, fontSize: "0.78rem" }}>
                                {p.storeName}
                              </div>
                            )}

                            {optionSummary(p) ? (
                              <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, lineHeight: 1.35 }}>
                                {optionSummary(p)}
                              </div>
                            ) : null}

                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  const product = p.raw || p;
                                  const url = productUrlFromShopify(product);
                                  if (url) {
                                    window.open(url, "_blank", "noopener,noreferrer");
                                  } else {
                                    alert("Product URL not available");
                                  }
                                }}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: `1px solid ${COLORS.border}`,
                                  background: COLORS.surface2,
                                  color: COLORS.text,
                                  cursor: "pointer",
                                  transition: baseTransition,
                                  fontWeight: 700,
                                  fontSize: "0.82rem",
                                }}
                              >
                                View product
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const product = p.raw || p;
                                  const variant = product.variants?.[0];
                                  const url = productUrlFromShopify(product);

                                  const imageUrl =
                                    variant?.media?.[0]?.url ||
                                    product.media?.[0]?.url ||
                                    null;

                                  const priceDisplay = formatShopifyPrice(
                                    variant?.price ||
                                    product.priceRange?.min
                                  );

                                  const store =
                                    variant?.shop?.name ||
                                    product.vendor ||
                                    "Shopify Store";

                                  const newItem = {
                                    id: product.id || product.upid || String(Date.now()),
                                    title: product.title || "Unknown product",
                                    price: priceDisplay,
                                    store,
                                    imageUrl,
                                    productUrl: url,
                                    addedAt: new Date().toISOString(),
                                  };

                                  setWishlist((prev) => {
                                    // Avoid duplicates
                                    const exists = prev.some((i) => i.id === newItem.id);
                                    if (exists) return prev;
                                    const updated = [...prev, newItem];
                                    localStorage.setItem(STORAGE_WISHLIST, JSON.stringify(updated));
                                    return updated;
                                  });
                                  setAddedId(newItem.id);
                                  setTimeout(() => setAddedId(null), 2000);
                                }}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: `1px solid ${COLORS.border}`,
                                  background:
                                    addedId === ((p.raw || p).id || (p.raw || p).upid || p.upid)
                                      ? COLORS.green || "#27ae60"
                                      : COLORS.card,
                                  color: COLORS.text,
                                  cursor: "pointer",
                                  transition: baseTransition,
                                  fontWeight: 800,
                                  fontSize: "0.82rem",
                                }}
                              >
                                {addedId === ((p.raw || p).id || (p.raw || p).upid || p.upid) ? "✓ Added!" : "Add to wishlist"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {loading ? <span style={{ color: COLORS.textMuted, fontSize: "0.85rem" }}>Searching…</span> : null}
          </div>

          {selectedProduct ? (
            <div style={mergeStyles(ui.panel, { padding: 16, marginBottom: 12 })}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 600 }}>
                  {selectedProduct.title || "Product details"}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.surface2,
                    color: COLORS.text,
                    cursor: "pointer",
                    transition: baseTransition,
                    fontWeight: 700,
                  }}
                >
                  Close
                </button>
              </div>
              <div style={{ marginTop: 10, color: COLORS.textMuted, fontSize: "0.9rem", lineHeight: 1.5 }}>
                {selectedProduct.loading
                  ? "Loading…"
                  : selectedProduct.error
                    ? selectedProduct.error
                    : selectedProduct.details
                      ? "Loaded."
                      : "—"}
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              placeholder="Search for an item…"
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface,
                color: COLORS.text,
                outline: "none",
                fontFamily: "'DM Sans', sans-serif",
                transition: baseTransition,
              }}
            />
            <button
              type="button"
              onClick={() => void sendMessage(input)}
              disabled={loading || !input.trim()}
              style={mergeStyles(ui.primaryButton, { padding: "12px 16px", minWidth: 110 })}
            >
              Send
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
              My Wishlist
            </div>
            <div style={{ color: COLORS.textMuted, fontSize: "0.85rem" }}>{wishlist.length} item(s)</div>
          </div>

          {wishlist.length === 0 ? (
            <div style={mergeStyles(ui.softPanel, { padding: 16, color: COLORS.textMuted })}>
              Your wishlist is empty. Start chatting to discover products.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {wishlist.map((it) => (
                <div
                  key={it.id}
                  style={mergeStyles(ui.panel, {
                    padding: "12px 12px",
                    display: "grid",
                    gridTemplateColumns: "56px 1fr auto",
                    gap: 12,
                    alignItems: "center",
                  })}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      overflow: "hidden",
                      background: COLORS.surface2,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    {it.imageUrl ? (
                      <img
                        src={it.imageUrl}
                        alt={it.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <div style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.5rem",
                      }}>
                        👟
                      </div>
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, marginBottom: 4, color: COLORS.text }}>{it.title || "Untitled"}</div>
                    <div style={{ fontSize: "0.85rem", color: COLORS.textMuted }}>
                      {it.price || "—"} {it.store ? ` • ${it.store}` : ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (it.productUrl) window.open(it.productUrl, "_blank", "noopener,noreferrer");
                      }}
                      disabled={!it.productUrl}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.surface2,
                        color: COLORS.text,
                        cursor: it.productUrl ? "pointer" : "default",
                        transition: baseTransition,
                        whiteSpace: "nowrap",
                        fontWeight: 700,
                      }}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromWishlist(it.id)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: `1px solid ${COLORS.border}`,
                        background: "transparent",
                        color: COLORS.textMuted,
                        cursor: "pointer",
                        transition: baseTransition,
                        whiteSpace: "nowrap",
                        fontWeight: 700,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showShopLookModal && (
        <div
          onClick={() => setShowShopLookModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 400,
            }}
          >
            <div style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "1.4rem",
              fontWeight: 600,
              marginBottom: 6,
              color: COLORS.text,
            }}>Shop This Look</div>
            <div style={{
              color: COLORS.muted || COLORS.textMuted,
              fontSize: "0.85rem",
              marginBottom: 20,
            }}>
              Click each item to open in the store
            </div>

            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 24,
            }}>
              {shopLookItems.map((item, i) => (
                <div key={i} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: COLORS.card,
                  borderRadius: 10,
                  padding: "12px 14px",
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div>
                    <div style={{
                      fontSize: "0.7rem",
                      color: COLORS.accent || COLORS.primary,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 2,
                    }}>{item.label}</div>
                    <div style={{
                      fontSize: "0.82rem",
                      color: COLORS.text,
                      marginBottom: 2,
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>{item.title}</div>
                    <div style={{
                      fontSize: "0.78rem",
                      color: COLORS.accent || COLORS.primary,
                      fontWeight: 600,
                    }}>{item.price}</div>
                  </div>
                  <button
                    onClick={() => item.url &&
                      window.open(item.url, "_blank", "noopener,noreferrer")}
                    disabled={!item.url}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: `1px solid ${COLORS.accent || COLORS.primary}`,
                      background: "transparent",
                      color: COLORS.accent || COLORS.primary,
                      cursor: item.url ? "pointer" : "not-allowed",
                      fontSize: "0.78rem",
                      fontFamily: "'DM Sans', sans-serif",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Open →
                  </button>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "12px 0",
              borderTop: `1px solid ${COLORS.border}`,
              marginBottom: 16,
            }}>
              <span style={{ color: COLORS.muted || COLORS.textMuted, fontSize: "0.85rem" }}>
                Estimated total
              </span>
              <strong style={{ color: COLORS.text, fontSize: "0.85rem" }}>
                {shopLookItems.reduce((sum, item) => {
                  const n = parseFloat(
                    String(item.price).replace(/[^0-9.]/g, "")
                  );
                  return sum + (isNaN(n) ? 0 : n);
                }, 0).toFixed(2)} {shopLookItems[0]?.price?.match(/[A-Z]{3}/)?.[0] || ""}
              </strong>
            </div>

            <button
              onClick={() => setShowShopLookModal(false)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: "transparent",
                color: COLORS.muted || COLORS.textMuted,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
