import { CATEGORIES } from "../constants";

/**
 * Maps a vision-provided wardrobe label onto app `CATEGORIES` values.
 */
export function mapToAppCategory(label) {
  const raw = String(label || "").trim();
  if (!raw) return "Accessories";
  const direct = CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (direct) return direct;
  const s = raw.toLowerCase();
  if (/(shirt|tee|top|blouse|sweater|knit|tank|cami|polo|hoodie|cardigan)/.test(s)) return "Tops";
  if (/(pants|jeans|shorts|trouser|skirt|bottom)/.test(s)) return "Bottoms";
  if (/(jacket|coat|blazer|outerwear|parka|bomber|anorak)/.test(s)) return "Outerwear";
  if (/(shoe|boot|sandal|heel|trainer|loafer|sneaker|footwear)/.test(s)) return "Shoes";
  if (/(dress|gown)/.test(s)) return "Dresses";
  if (/(sport|active|gym|legging|runner|athletic)/.test(s)) return "Activewear";
  if (/(suit|formal)/.test(s)) return "Formal";
  if (/(bag|purse|tote|crossbody)/.test(s)) return "Bags";
  return "Accessories";
}

function nextScanRowId() {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildWardrobeItems(rows, imagePreview, imageFilename) {
  return rows
    .filter(
      (r) =>
        r.included &&
        r.count > 0 &&
        !/(partial|visible|edge|corner|background|curtain|wall|floor)/i.test(String(r.category || ""))
    )
    .map((row) => ({
      id: nextScanRowId(),
      name: row.category
        .split(/[/&]/)
        .map((w) => w.trim())
        .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .filter(Boolean)
        .join(" & "),
      category: mapToAppCategory(row.category),
      color: row.colors?.[0] || "",
      colors: row.colors || [],
      style: row.style || "",
      count: row.count,
      imagePreview: imagePreview || "",
      imageFilename: imageFilename || "",
      imageUploading: false,
      source: "closet_scan",
      tags: ["closet-scan"],
      laundryStatus: "clean",
      timesWorn: 0,
      season: "all",
      material: "",
      description: [`${row.count} items`, row.colors?.filter(Boolean).join(", ") || "", String(row.style || "").trim()]
        .filter((p) => p && String(p).trim())
        .join(" · "),
      purchasePrice: "",
      purchaseDate: "",
      expectedLifespan: "",
      mood: "",
      occasion: [],
      lastWorn: null,
      sourceUrl: "",
    }));
}
