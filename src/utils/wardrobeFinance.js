/**
 * Financial fields for wardrobe items. Legacy: `cost`, `timesWorn`.
 * Canonical: purchasePrice, wearCount, purchaseDate, expectedLifespan (days).
 */

import { calculateCPW } from "./calculateCPW";

export { calculateCPW } from "./calculateCPW";

export function getPurchasePriceNum(it) {
  if (it == null) return 0;
  if (it.purchasePrice != null && it.purchasePrice !== "") {
    const n = typeof it.purchasePrice === "number" ? it.purchasePrice : parseFloat(String(it.purchasePrice).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  if (it.mockPrice != null && it.mockPrice !== "") {
    const n = typeof it.mockPrice === "number" ? it.mockPrice : parseFloat(String(it.mockPrice).replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  if (it.cost == null || it.cost === "") return 0;
  const n = parseFloat(String(it.cost).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function getWearCount(it) {
  if (it == null) return 0;
  const w = it.wearCount ?? it.timesWorn;
  if (w == null) return 0;
  const n = Number(w);
  return Number.isFinite(n) ? n : 0;
}

/** Cost per wear: purchasePrice / max(wearCount, 1) */
export function getCostPerWear(it) {
  return calculateCPW(getPurchasePriceNum(it), getWearCount(it));
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
  const w = getWearCount(it);
  return p * getCostPerWear(it) / (w + 1);
}
