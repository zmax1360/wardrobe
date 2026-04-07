/**
 * Cost per wear: price / max(wears, 1)
 * Used by App.js (wardrobe financials) and wardrobe UI.
 */
export function calculateCPW(price, wears) {
  const p = typeof price === "number" && Number.isFinite(price) ? price : parseFloat(String(price ?? 0).replace(/[^0-9.-]/g, "")) || 0;
  const w = typeof wears === "number" && Number.isFinite(wears) ? wears : parseInt(String(wears ?? 0), 10) || 0;
  return p / Math.max(w, 1);
}
