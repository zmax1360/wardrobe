/**
 * Financial fields for wardrobe items.
 * Canonical: purchasePrice, timesWorn, purchaseDate, expectedLifespan (days).
 */

import { calculateCPW } from "./calculateCPW";

export { calculateCPW } from "./calculateCPW";

/** Allowed `occasion` tag values (wardrobe item). */
export const WARDROBE_OCCASION_VALUES = ["casual", "work", "formal", "sport", "evening"];

/**
 * Migrate legacy persisted items (wearCount, cost, mockPrice) into canonical fields.
 * Omits legacy keys from the returned object.
 */
export function normalizeWardrobeItem(raw) {
  if (raw == null || typeof raw !== "object") return raw;
  const { wearCount, cost, mockPrice, ...rest } = raw;

  let purchasePrice = rest.purchasePrice;
  if (purchasePrice == null || purchasePrice === "") {
    if (mockPrice != null && mockPrice !== "") purchasePrice = mockPrice;
    else if (cost != null && cost !== "") purchasePrice = cost;
  }

  let timesWorn = rest.timesWorn;
  if (timesWorn == null || timesWorn === "") {
    timesWorn = wearCount != null ? Number(wearCount) : 0;
  }
  const tn =
    typeof timesWorn === "number" && Number.isFinite(timesWorn)
      ? Math.max(0, Math.floor(timesWorn))
      : Math.max(0, parseInt(String(timesWorn).replace(/\D/g, ""), 10) || 0);

  const occasion = Array.isArray(rest.occasion)
    ? rest.occasion.filter((o) => WARDROBE_OCCASION_VALUES.includes(o))
    : [];

  const lastWorn = rest.lastWorn != null && rest.lastWorn !== "" ? rest.lastWorn : null;

  return {
    ...rest,
    purchasePrice: purchasePrice ?? "",
    timesWorn: tn,
    occasion,
    lastWorn,
  };
}

export function normalizeWardrobeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeWardrobeItem);
}

export function getPurchasePriceNum(it) {
  if (it == null) return 0;
  if (it.purchasePrice != null && it.purchasePrice !== "") {
    const n =
      typeof it.purchasePrice === "number"
        ? it.purchasePrice
        : parseFloat(String(it.purchasePrice).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function getTimesWorn(it) {
  if (it == null) return 0;
  const w = it.timesWorn;
  if (w == null) return 0;
  const n = Number(w);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Cost per wear: purchasePrice / max(timesWorn, 1) */
export function getCostPerWear(it) {
  return calculateCPW(getPurchasePriceNum(it), getTimesWorn(it));
}

/** Sort clean items: highest CPW first (under-worn expensive pieces). */
export function compareCleanItemsByPriorityCPW(a, b) {
  const d = getCostPerWear(b) - getCostPerWear(a);
  if (d !== 0) return d;
  return getPurchasePriceNum(b) - getPurchasePriceNum(a);
}

/** Waste score: high price × high CPW — prioritize intervention */
export function getWasteScore(it) {
  const p = getPurchasePriceNum(it);
  const w = getTimesWorn(it);
  return (p * getCostPerWear(it)) / (w + 1);
}
