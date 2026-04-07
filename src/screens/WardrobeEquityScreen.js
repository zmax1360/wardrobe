import React, { useMemo, useState } from "react";

import { FINANCE } from "../styles/financeTheme";
import { getCostPerWear, getPurchasePriceNum, getWearCount } from "../utils/wardrobeFinance";

const CATEGORIES = [
  "Tops",
  "Bottoms",
  "Dresses",
  "Outerwear",
  "Shoes",
  "Accessories",
  "Bags",
];

export function WardrobeEquityScreen({ wardrobe }) {
  const [simCategory, setSimCategory] = useState("Tops");
  const [simPrice, setSimPrice] = useState("");

  const metrics = useMemo(() => {
    const priced = wardrobe.filter((it) => getPurchasePriceNum(it) > 0);
    const totalValue = priced.reduce((s, it) => s + getPurchasePriceNum(it), 0);
    const cpws = priced.map((it) => getCostPerWear(it));
    const avgCPW = cpws.length ? cpws.reduce((a, b) => a + b, 0) / cpws.length : 0;
    const highWaste = [...priced]
      .sort((a, b) => getPurchasePriceNum(b) * getCostPerWear(b) - getPurchasePriceNum(a) * getCostPerWear(a))
      .filter((it) => getPurchasePriceNum(it) >= 50 && getWearCount(it) <= 3)
      .slice(0, 8);
    return { totalValue, avgCPW, pricedCount: priced.length, highWaste };
  }, [wardrobe]);

  const categoryAvgWears = useMemo(() => {
    const items = wardrobe.filter((it) => (it.category || "") === simCategory);
    if (!items.length) return 1;
    const sum = items.reduce((s, it) => s + getWearCount(it), 0);
    return Math.max(1, sum / items.length);
  }, [wardrobe, simCategory]);

  const predictedCPW = (() => {
    const p = parseFloat(String(simPrice).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(p) || p <= 0) return null;
    return p / categoryAvgWears;
  })();

  return (
    <div
      style={{
        maxWidth: 960,
        fontFamily: "'Inter', 'DM Sans', sans-serif",
        color: FINANCE.text,
        background: FINANCE.bg,
      }}
    >
      <h1
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "2rem",
          fontWeight: 600,
          margin: "0 0 8px",
          letterSpacing: "-0.02em",
        }}
      >
        Wardrobe Equity
      </h1>
      <p style={{ margin: "0 0 28px", fontSize: "0.92rem", color: FINANCE.muted, maxWidth: 560 }}>
        Financial intelligence for your closet — total value, average cost-per-wear, and where capital is idle.
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
        {[
          { label: "Total closet value", value: `$${metrics.totalValue.toFixed(0)}`, sub: `${metrics.pricedCount} priced items` },
          { label: "Average CPW", value: metrics.pricedCount ? `$${metrics.avgCPW.toFixed(2)}` : "—", sub: "portfolio" },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              flex: "1 1 220px",
              padding: "20px 22px",
              borderRadius: 14,
              border: `1px solid ${FINANCE.border}`,
              background: FINANCE.bg,
            }}
          >
            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: FINANCE.muted }}>{c.label}</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.85rem", fontWeight: 600, marginTop: 8 }}>{c.value}</div>
            <div style={{ fontSize: "0.8rem", color: FINANCE.muted, marginTop: 4 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginBottom: 32,
          padding: 24,
          borderRadius: 16,
          border: `1px solid ${FINANCE.border}`,
          background: FINANCE.accentSoft,
        }}
      >
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.25rem", margin: "0 0 6px" }}>Buy Better Simulator</h2>
        <p style={{ margin: "0 0 16px", fontSize: "0.88rem", color: FINANCE.muted }}>
          Enter a potential purchase price; predicted CPW uses your average wears in that category.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: FINANCE.muted }}>Category</label>
            <select
              value={simCategory}
              onChange={(e) => setSimCategory(e.target.value)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: `1px solid ${FINANCE.border}`,
                background: "#fff",
                color: FINANCE.text,
                fontSize: "0.9rem",
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: FINANCE.muted }}>Purchase price ($)</label>
            <input
              value={simPrice}
              onChange={(e) => setSimPrice(e.target.value)}
              placeholder="e.g. 180"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: `1px solid ${FINANCE.border}`,
                width: 140,
                fontSize: "0.9rem",
              }}
            />
          </div>
          <div style={{ padding: "10px 0", fontSize: "0.95rem" }}>
            {predictedCPW != null ? (
              <>
                Predicted CPW: <strong style={{ color: FINANCE.slate }}>${predictedCPW.toFixed(2)}</strong>
                <span style={{ color: FINANCE.muted, fontSize: "0.82rem", marginLeft: 8 }}>(avg {categoryAvgWears.toFixed(1)} wears in {simCategory})</span>
              </>
            ) : (
              <span style={{ color: FINANCE.muted }}>Enter a price</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12, fontFamily: "'Playfair Display', serif", fontSize: "1.2rem" }}>High-waste items</div>
      <p style={{ margin: "0 0 16px", fontSize: "0.88rem", color: FINANCE.muted }}>
        High purchase price with low wear — candidates to style more often or resell.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {metrics.highWaste.length === 0 ? (
          <p style={{ color: FINANCE.muted, fontSize: "0.9rem" }}>Add purchase prices and wear counts to surface insights.</p>
        ) : (
          metrics.highWaste.map((it) => (
            <div
              key={it.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 16px",
                borderRadius: 12,
                border: `1px solid ${FINANCE.border}`,
                background: "#fff",
              }}
            >
              {it.imagePreview ? (
                <img src={it.imagePreview} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 8, background: FINANCE.slateSoft }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{it.name}</div>
                <div style={{ fontSize: "0.8rem", color: FINANCE.muted }}>
                  ${getPurchasePriceNum(it).toFixed(0)} paid · worn {getWearCount(it)}× · CPW ${getCostPerWear(it).toFixed(2)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
