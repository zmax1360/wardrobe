import React, { useMemo, useState } from "react";

import { FINANCE } from "../styles/financeTheme";
import { calculateCPW, getCostPerWear, getPurchasePriceNum, getTimesWorn } from "../utils/wardrobeFinance";

const CATEGORIES = [
  "Tops",
  "Bottoms",
  "Dresses",
  "Outerwear",
  "Shoes",
  "Accessories",
  "Bags",
];

const INSIGHT_LIMIT = 6;

/**
 * Synced with Asset Gallery / `WardrobeScreen` financials:
 * - Total value: sum of `getPurchasePriceNum` per item (`purchasePrice`).
 * - Average CPW: mean of `calculateCPW(price, wears)` only where `getPurchasePriceNum(it) > 0`.
 */
function useEquityMetrics(wardrobe) {
  return useMemo(() => {
    const totalWardrobeValue = wardrobe.reduce((sum, it) => sum + getPurchasePriceNum(it), 0);

    const priced = wardrobe.filter((it) => getPurchasePriceNum(it) > 0);
    const avgCPW =
      priced.length > 0
        ? priced.reduce((sum, it) => sum + calculateCPW(getPurchasePriceNum(it), getTimesWorn(it)), 0) /
          priced.length
        : 0;

    const byCpwAsc = [...priced].sort((a, b) => getCostPerWear(a) - getCostPerWear(b));
    const topValueAssets = byCpwAsc.slice(0, INSIGHT_LIMIT);

    const byCpwDesc = [...priced].sort((a, b) => getCostPerWear(b) - getCostPerWear(a));
    const underutilizedAssets = byCpwDesc.slice(0, INSIGHT_LIMIT);

    const highWaste = [...priced]
      .sort((a, b) => getPurchasePriceNum(b) * getCostPerWear(b) - getPurchasePriceNum(a) * getCostPerWear(a))
      .filter((it) => getPurchasePriceNum(it) >= 50 && getTimesWorn(it) <= 3)
      .slice(0, 8);

    return {
      totalWardrobeValue,
      avgCPW,
      pricedCount: priced.length,
      topValueAssets,
      underutilizedAssets,
      highWaste,
    };
  }, [wardrobe]);
}

function AssetInsightRow({ it }) {
  const price = getPurchasePriceNum(it);
  const wears = getTimesWorn(it);
  const cpw = calculateCPW(price, wears);

  return (
    <div className="equity-asset-row">
      {it.imagePreview ? (
        <img src={it.imagePreview} alt="" className="equity-asset-thumb" />
      ) : (
        <div className="equity-asset-thumb equity-asset-thumb--empty" />
      )}
      <div className="equity-asset-body">
        <div className="equity-asset-name">{it.name || "Untitled"}</div>
        <div className="equity-asset-meta">
          ${price.toFixed(0)} · {wears} wears · CPW ${cpw.toFixed(2)}
        </div>
      </div>
    </div>
  );
}

export function WardrobeEquityScreen({ wardrobe }) {
  const [simCategory, setSimCategory] = useState("Tops");
  const [simPrice, setSimPrice] = useState("");

  const metrics = useEquityMetrics(wardrobe);

  const categoryAvgWears = useMemo(() => {
    const items = wardrobe.filter((it) => (it.category || "") === simCategory);
    if (!items.length) return 1;
    const sum = items.reduce((s, it) => s + getTimesWorn(it), 0);
    return Math.max(1, sum / items.length);
  }, [wardrobe, simCategory]);

  const predictedCPW = (() => {
    const p = parseFloat(String(simPrice).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(p) || p <= 0) return null;
    return p / categoryAvgWears;
  })();

  return (
    <div className="equity-page">
      <h1 className="equity-page-title">Wardrobe Equity</h1>
      <p className="equity-page-lede">
        Financial intelligence for your closet — total value, average cost-per-wear, and where capital is idle.
      </p>

      <div className="equity-stat-grid">
        <div className="equity-stat-card">
          <div className="equity-stat-label">Total wardrobe value</div>
          <div className="equity-stat-value">${metrics.totalWardrobeValue.toFixed(0)}</div>
          <div className="equity-stat-sub">
            Same basis as Asset Gallery — sum of purchase prices
          </div>
        </div>
        <div className="equity-stat-card">
          <div className="equity-stat-label">Average CPW</div>
          <div className="equity-stat-value">{metrics.pricedCount ? `$${metrics.avgCPW.toFixed(2)}` : "—"}</div>
          <div className="equity-stat-sub">Mean CPW for items with purchase-side price greater than zero only</div>
        </div>
      </div>

      <div className="equity-panel">
        <h2 className="equity-section-title">Buy Better Simulator</h2>
        <p className="equity-section-lede">
          Enter a potential purchase price; predicted CPW uses your average wears in that category.
        </p>
        <div className="equity-sim-row">
          <div className="equity-sim-field">
            <label className="equity-field-label">Category</label>
            <select
              value={simCategory}
              onChange={(e) => setSimCategory(e.target.value)}
              className="equity-select"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="equity-sim-field">
            <label className="equity-field-label">Purchase price ($)</label>
            <input
              value={simPrice}
              onChange={(e) => setSimPrice(e.target.value)}
              placeholder="e.g. 180"
              className="equity-input"
            />
          </div>
          <div className="equity-sim-outcome">
            {predictedCPW != null ? (
              <>
                Predicted CPW:{" "}
                <strong className="equity-sim-cpw">${predictedCPW.toFixed(2)}</strong>
                <span className="equity-sim-hint">
                  (avg {categoryAvgWears.toFixed(1)} wears in {simCategory})
                </span>
              </>
            ) : (
              <span style={{ color: FINANCE.muted }}>Enter a price</span>
            )}
          </div>
        </div>
      </div>

      <section className="equity-insight-block">
        <h2 className="equity-section-title">Top Value Assets</h2>
        <p className="equity-section-lede">Lowest CPW among priced pieces — best value per wear.</p>
        <div className="equity-asset-list">
          {metrics.topValueAssets.length === 0 ? (
            <p className="equity-empty">Add purchase prices and wears to rank CPW.</p>
          ) : (
            metrics.topValueAssets.map((it) => <AssetInsightRow key={it.id} it={it} />)
          )}
        </div>
      </section>

      <section className="equity-insight-block">
        <h2 className="equity-section-title">Underutilized Assets</h2>
        <p className="equity-section-lede">Highest CPW among priced pieces — wear more or reconsider holding cost.</p>
        <div className="equity-asset-list">
          {metrics.underutilizedAssets.length === 0 ? (
            <p className="equity-empty">Add purchase prices and wears to rank CPW.</p>
          ) : (
            metrics.underutilizedAssets.map((it) => <AssetInsightRow key={it.id} it={it} />)
          )}
        </div>
      </section>

      <section className="equity-insight-block">
        <h2 className="equity-section-title">High-waste items</h2>
        <p className="equity-section-lede">High purchase price with low wear — candidates to style more often or resell.</p>
        <div className="equity-asset-list">
          {metrics.highWaste.length === 0 ? (
            <p className="equity-empty">Add purchase prices and wear counts to surface insights.</p>
          ) : (
            metrics.highWaste.map((it) => <AssetInsightRow key={it.id} it={it} />)
          )}
        </div>
      </section>
    </div>
  );
}
