import React, { useState } from "react";

import { COLORS, baseTransition } from "../styles/theme";
import { type } from "../styles/typography";
import { ui } from "../styles/ui";
import { mergeStyles } from "../utils/styleUtils";

export function WardrobeScreen({
  profile: _profile,
  wardrobe: _wardrobe,
  agentActivity: _agentActivity,
  agentInsights: _agentInsights,
  handlers,
}) {
  const [showEquity, setShowEquity] = useState(false);
  const {
    fileRef,
    onFileChange,
    onDrop,
    analyzing,
    uploadError,
    stats,
    catFilter,
    setCatFilter,
    laundryFilter,
    setLaundryFilter,
    filteredWardrobe,
    updateItem,
    openEdit,
    removeItem,
    categories,
  } = handlers;

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => !analyzing && fileRef.current?.click()}
        style={mergeStyles(ui.softPanel, {
          border: `1px dashed ${analyzing ? COLORS.textMuted : COLORS.primary}`,
          padding: "36px 28px",
          textAlign: "center",
          marginBottom: 32,
          cursor: analyzing ? "wait" : "pointer",
          opacity: analyzing ? 0.85 : 1,
          transition: baseTransition,
        })}
      >
        {analyzing ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                border: `3px solid ${COLORS.border}`,
                borderTopColor: COLORS.primary,
                borderRadius: "50%",
                animation: "fosSpin 0.8s linear infinite",
              }}
            />
            <style>{`@keyframes fosSpin { to { transform: rotate(360deg); } }`}</style>
            <span style={{ color: COLORS.textMuted }}>Analyzing image…</span>
          </div>
        ) : (
          <>
            <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>＋</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop a photo or click to upload</div>
            <div style={{ color: COLORS.textMuted, fontSize: "0.88rem" }}>
              JPEG, PNG, WebP — AI vision cataloging
            </div>
          </>
        )}
      </div>
      {uploadError && (
        <div
          style={{
            color: "#e8a0a0",
            fontSize: "0.88rem",
            marginTop: -16,
            marginBottom: 20,
          }}
        >
          {uploadError}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 20,
          fontSize: "0.88rem",
          color: COLORS.textMuted,
        }}
      >
        <span>
          <strong style={{ color: COLORS.text }}>{stats.total}</strong> items
        </span>
        <span>·</span>
        <span>
          Clean <strong style={{ color: COLORS.text }}>{stats.clean}</strong>
        </span>
        <span>·</span>
        <span>
          Dirty <strong style={{ color: COLORS.text }}>{stats.dirty}</strong>
        </span>
        <span>·</span>
        <span>
          In wash <strong style={{ color: COLORS.text }}>{stats.wash}</strong>
        </span>
        <button
          type="button"
          onClick={() => setShowEquity((v) => !v)}
          style={{
            marginLeft: "auto",
            padding: "7px 16px",
            borderRadius: 999,
            border: `1px solid ${showEquity ? COLORS.accent : COLORS.border}`,
            background: showEquity ? COLORS.accent : "transparent",
            color: showEquity ? "#fff" : COLORS.textMuted,
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
            letterSpacing: "0.02em",
          }}
        >
          {showEquity ? "◀ Wardrobe" : "Equity Report ▶"}
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {["All", ...categories].map((c) => {
          const on = catFilter === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCatFilter(c)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                background: on ? COLORS.primarySoft : COLORS.surface2,
                color: on ? COLORS.text : COLORS.textMuted,
                cursor: "pointer",
                fontSize: "0.8rem",
                transition: baseTransition,
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
        {["All", "Clean", "Dirty", "In wash"].map((l) => {
          const on = laundryFilter === l;
          return (
            <button
              key={l}
              type="button"
              onClick={() => setLaundryFilter(l)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                background: on ? COLORS.primarySoft : COLORS.surface2,
                color: on ? COLORS.text : COLORS.textMuted,
                cursor: "pointer",
                fontSize: "0.8rem",
                transition: baseTransition,
              }}
            >
              {l}
            </button>
          );
        })}
      </div>

      {filteredWardrobe.length === 0 ? (
        <p style={{ color: COLORS.textMuted }}>No pieces match these filters.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {filteredWardrobe.map((it) => {
            const tags = (it.tags || []).slice(0, 3);
            const costNum = parseFloat(String(it.cost).replace(/[^0-9.]/g, ""));
            const cpw =
              it.timesWorn > 0 && !Number.isNaN(costNum) && costNum > 0
                ? (costNum / it.timesWorn).toFixed(2)
                : null;

            const laundryLabel =
              it.laundryStatus === "clean"
                ? "Clean ✓"
                : it.laundryStatus === "dirty"
                  ? "Dirty ✗"
                  : "In Wash ↻";

            return (
              <div
                key={it.id}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, ui.panelHover)}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = `${COLORS.shadow}, ${COLORS.cardGlow}`;
                }}
                style={mergeStyles(ui.panel, {
                  borderRadius: 28,
                  padding: 20,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                  transition: baseTransition,
                })}
              >
                <div
                  style={{
                    background: COLORS.surface2,
                    borderRadius: 24,
                    padding: 10,
                    marginBottom: 18,
                    position: "relative",
                  }}
                >
                  <div style={{ position: "relative", borderRadius: 20, overflow: "hidden" }}>
                    {it.imagePreview ? (
                      <img
                        src={it.imagePreview}
                        alt=""
                        style={mergeStyles(ui.imageCard, { aspectRatio: "4 / 5", width: "100%", height: "100%", objectFit: "cover" })}
                      />
                    ) : (
                      <div
                        style={{
                          aspectRatio: "4 / 5",
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: COLORS.textMuted,
                          fontSize: "0.85rem",
                          background: COLORS.surface,
                        }}
                      >
                        No photo
                      </div>
                    )}
                    <span
                      style={{
                        position: "absolute",
                        top: 10,
                        left: 10,
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: "rgba(28,25,23,0.7)",
                        fontSize: "0.7rem",
                        color: COLORS.text,
                      }}
                    >
                      {laundryLabel}
                    </span>
                    <span
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: COLORS.primary,
                        color: "#FFFFFF",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                      }}
                    >
                      {it.category}
                    </span>
                  </div>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ ...type.cardTitle, fontSize: 24 }}>{it.name}</div>
                  <div style={type.meta}>
                    {it.color}
                    {it.season ? ` · ${it.season}` : ""}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: COLORS.surface2,
                          fontSize: "0.72rem",
                          color: COLORS.textMuted,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  {it.description && (
                    <div style={{ ...type.body, fontStyle: "italic" }}>{it.description}</div>
                  )}
                  <div style={type.meta}>
                    Worn <strong style={{ color: COLORS.text }}>{it.timesWorn}</strong> times
                    {cpw != null && (
                      <>
                        {" "}
                        · CPW <strong style={{ color: COLORS.text }}>${cpw}</strong>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {[
                      { key: "clean", label: "Clean" },
                      { key: "dirty", label: "Dirty" },
                      { key: "wash", label: "In wash" },
                    ].map((b) => {
                      const sel = it.laundryStatus === b.key;
                      const selStyle =
                        sel && b.key === "clean"
                          ? {
                              background: COLORS.successSoft,
                              color: COLORS.success,
                              border: `1px solid rgba(111, 157, 122, 0.28)`,
                            }
                          : sel && b.key === "dirty"
                            ? {
                                background: COLORS.dangerSoft,
                                color: COLORS.danger,
                                border: `1px solid rgba(217, 124, 108, 0.24)`,
                              }
                            : sel && b.key === "wash"
                              ? {
                                  background: COLORS.primarySoft,
                                  color: COLORS.primary,
                                  border: `1px solid rgba(184, 92, 56, 0.24)`,
                                }
                              : {};
                      return (
                        <button
                          key={b.key}
                          type="button"
                          onClick={() => updateItem(it.id, { laundryStatus: b.key })}
                          style={mergeStyles(ui.chip, {
                            padding: "10px 14px",
                            cursor: "pointer",
                            transition: baseTransition,
                            ...selStyle,
                          })}
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "auto" }}>
                    <button
                      type="button"
                      onClick={() =>
                        updateItem(it.id, {
                          timesWorn: (it.timesWorn || 0) + 1,
                          laundryStatus: "dirty",
                        })
                      }
                      style={mergeStyles(ui.primaryButton, {
                        flex: 1,
                        minWidth: 100,
                        minHeight: 54,
                        padding: "15px 24px",
                      })}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = COLORS.primaryHover;
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = COLORS.primary;
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      Wore it
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(it)}
                      style={mergeStyles(ui.secondaryButton, {
                        minHeight: 54,
                      })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      style={mergeStyles(ui.secondaryButton, {
                        minHeight: 54,
                        color: COLORS.danger,
                        border: `1px solid ${COLORS.dangerSoft}`,
                        background: "#FFF7F5",
                      })}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showEquity && (() => {
        const valued = _wardrobe.filter((it) => parseFloat(String(it.cost).replace(/[^0-9.]/g, "")) > 0);
        const withCPW = valued.map((it) => {
          const cost = parseFloat(String(it.cost).replace(/[^0-9.]/g, ""));
          const worn = Number(it.timesWorn) || 1;
          return { ...it, _cost: cost, _cpw: +(cost / worn).toFixed(2) };
        });
        const totalValue = valued.reduce((s, it) => s + parseFloat(String(it.cost).replace(/[^0-9.]/g, "")), 0);
        const avgCPW = withCPW.length ? +(withCPW.reduce((s, i) => s + i._cpw, 0) / withCPW.length).toFixed(2) : 0;
        const bestValue = [...withCPW].sort((a, b) => a._cpw - b._cpw).slice(0, 5);
        const worstValue = [...withCPW].sort((a, b) => b._cpw - a._cpw).slice(0, 5);

        const byCategory = {};
        withCPW.forEach((it) => {
          const cat = it.category || "Other";
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(it._cpw);
        });
        const catAvgs = Object.entries(byCategory)
          .map(([cat, cpws]) => ({
            cat,
            avg: +(cpws.reduce((a, b) => a + b, 0) / cpws.length).toFixed(2),
            count: cpws.length,
          }))
          .sort((a, b) => a.avg - b.avg);

        return (
          <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Summary Stats */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { label: "Total Wardrobe Value", value: `$${totalValue.toFixed(0)}`, sub: `${valued.length} priced items` },
                { label: "Average Cost Per Wear", value: `$${avgCPW}`, sub: "across all items" },
                { label: "Best Item", value: bestValue[0] ? `$${bestValue[0]._cpw}/wear` : "—", sub: bestValue[0]?.name ?? "" },
                { label: "Most Expensive Habit", value: worstValue[0] ? `$${worstValue[0]._cpw}/wear` : "—", sub: worstValue[0]?.name ?? "" },
              ].map((card) => (
                <div key={card.label} style={{ flex: "1 1 180px", background: COLORS.surface, borderRadius: 14, padding: "18px 20px", border: `1px solid ${COLORS.border}` }}>
                  <p style={{ margin: "0 0 4px", fontSize: "0.75rem", color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</p>
                  <p style={{ margin: "0 0 2px", fontSize: "1.6rem", fontWeight: 700, color: COLORS.accent, fontFamily: "'Cormorant Garamond', serif" }}>{card.value}</p>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: COLORS.textMuted }}>{card.sub}</p>
                </div>
              ))}
            </div>

            {/* Best & Worst Value */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { title: "🏆 Best Value (Lowest CPW)", items: bestValue, color: "#4A7C59" },
                { title: "⚠️ Review These (Highest CPW)", items: worstValue, color: COLORS.danger ?? "#C0392B" },
              ].map((section) => (
                <div key={section.title} style={{ background: COLORS.surface, borderRadius: 14, padding: 20, border: `1px solid ${COLORS.border}` }}>
                  <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: "0.88rem", color: COLORS.text }}>{section.title}</p>
                  {section.items.map((it, idx) => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: section.color, width: 18 }}>#{idx + 1}</span>
                      {it.imagePreview && <img src={it.imagePreview} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />}
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>{it.name}</p>
                        <p style={{ margin: 0, fontSize: "0.78rem", color: COLORS.textMuted }}>${it._cost} · worn {it.timesWorn}× · <b style={{ color: section.color }}>${it._cpw}/wear</b></p>
                      </div>
                    </div>
                  ))}
                  {!section.items.length && <p style={{ fontSize: "0.85rem", color: COLORS.textMuted }}>Add prices to your items to see rankings.</p>}
                </div>
              ))}
            </div>

            {/* CPW by Category */}
            {catAvgs.length > 0 && (
              <div style={{ background: COLORS.surface, borderRadius: 14, padding: 20, border: `1px solid ${COLORS.border}` }}>
                <p style={{ margin: "0 0 16px", fontWeight: 700, fontSize: "0.88rem" }}>Avg Cost Per Wear by Category</p>
                {catAvgs.map(({ cat, avg, count }) => (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <span style={{ width: 110, fontSize: "0.82rem", color: COLORS.textMuted }}>{cat} ({count})</span>
                    <div style={{ flex: 1, background: COLORS.border, borderRadius: 999, height: 8, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, (avg / (worstValue[0]?._cpw || 1)) * 100)}%`, height: "100%", background: COLORS.accent, borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: COLORS.accent, width: 60, textAlign: "right" }}>${avg}/wear</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}
