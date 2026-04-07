import React, { useState } from "react";

import { FINANCE } from "../styles/financeTheme";
import { COLORS, baseTransition } from "../styles/theme";
import { type } from "../styles/typography";
import { ui } from "../styles/ui";
import { mergeStyles } from "../utils/styleUtils";
import { getCostPerWear, getPurchasePriceNum, getWearCount } from "../utils/wardrobeFinance";

/** Mood board cell span pattern (repeat) */
const MOOD_SPANS = [
  { c: 2, r: 2 },
  { c: 1, r: 1 },
  { c: 1, r: 1 },
  { c: 1, r: 2 },
  { c: 2, r: 1 },
  { c: 1, r: 1 },
];

export function WardrobeScreen({
  profile: _profile,
  wardrobe: _wardrobe,
  agentActivity: _agentActivity,
  agentInsights: _agentInsights,
  handlers,
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState("photo");
  const [storeLink, setStoreLink] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [removeBgNext, setRemoveBgNext] = useState(false);
  const modalFileRef = React.useRef(null);

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
    ingestFromMockLink,
    addWardrobeFromFile,
  } = handlers;

  const handleModalFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) addWardrobeFromFile(f, { removeBg: removeBgNext });
    setShowAddModal(false);
    setRemoveBgNext(false);
  };

  const submitLink = async () => {
    setLinkLoading(true);
    try {
      await ingestFromMockLink(storeLink);
      setStoreLink("");
      setShowAddModal(false);
    } catch (err) {
      alert(err?.message || "Could not import link");
    } finally {
      setLinkLoading(false);
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onFileChange(e)} />

      <div
        style={{
          background: FINANCE.bg,
          color: FINANCE.text,
          fontFamily: "'Inter', 'DM Sans', sans-serif",
          minHeight: 400,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.85rem",
                fontWeight: 600,
                margin: "0 0 6px",
                letterSpacing: "-0.02em",
              }}
            >
              Closet mood board
            </h1>
            <p style={{ margin: 0, fontSize: "0.88rem", color: FINANCE.muted }}>
              Financially aware wardrobe · CPW at a glance
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            style={{
              padding: "12px 22px",
              borderRadius: 999,
              border: `1px solid ${FINANCE.slate}`,
              background: FINANCE.text,
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            + Add piece
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 20,
            fontSize: "0.85rem",
            color: FINANCE.muted,
          }}
        >
          <span>
            <strong style={{ color: FINANCE.text }}>{stats.total}</strong> items
          </span>
          <span>·</span>
          <span>
            Clean <strong style={{ color: FINANCE.text }}>{stats.clean}</strong>
          </span>
          <span>·</span>
          <span>
            Dirty <strong style={{ color: FINANCE.text }}>{stats.dirty}</strong>
          </span>
          <span>·</span>
          <span>
            In wash <strong style={{ color: FINANCE.text }}>{stats.wash}</strong>
          </span>
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
                  border: `1px solid ${on ? FINANCE.slate : FINANCE.border}`,
                  background: on ? FINANCE.slateSoft : "transparent",
                  color: on ? FINANCE.slate : FINANCE.muted,
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
                  border: `1px solid ${on ? FINANCE.slate : FINANCE.border}`,
                  background: on ? FINANCE.slateSoft : "transparent",
                  color: on ? FINANCE.slate : FINANCE.muted,
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

        {uploadError && (
          <div style={{ color: "#c45c5c", fontSize: "0.88rem", marginBottom: 16 }}>{uploadError}</div>
        )}

        {filteredWardrobe.length === 0 ? (
          <p style={{ color: FINANCE.muted }}>No pieces match these filters.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gridAutoRows: "minmax(120px, auto)",
              gap: 14,
            }}
          >
            {filteredWardrobe.map((it, idx) => {
              const span = MOOD_SPANS[idx % MOOD_SPANS.length];
              const tags = (it.tags || []).slice(0, 3);
              const pp = getPurchasePriceNum(it);
              const wc = getWearCount(it);
              const cpw = pp > 0 ? getCostPerWear(it).toFixed(2) : null;

              const laundryLabel =
                it.laundryStatus === "clean"
                  ? "Clean"
                  : it.laundryStatus === "dirty"
                    ? "Dirty"
                    : "Wash";

              return (
                <div
                  key={it.id}
                  style={{
                    gridColumn: `span ${span.c}`,
                    gridRow: `span ${span.r}`,
                    borderRadius: 18,
                    border: `1px solid ${FINANCE.border}`,
                    background: "#fff",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: baseTransition,
                    boxShadow: "0 8px 32px rgba(26,26,26,0.06)",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      flex: 1,
                      minHeight: span.r > 1 ? 200 : 140,
                      background: FINANCE.slateSoft,
                    }}
                  >
                    {it.imagePreview ? (
                      <img
                        src={it.imagePreview}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                          transform: `rotate(${((idx * 7) % 5) - 2}deg) scale(1.02)`,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: FINANCE.muted,
                          fontSize: "0.8rem",
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
                        background: "rgba(255,255,255,0.92)",
                        fontSize: "0.65rem",
                        color: FINANCE.text,
                        border: `1px solid ${FINANCE.border}`,
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
                        background: FINANCE.text,
                        color: "#fff",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                      }}
                    >
                      {it.category}
                    </span>
                  </div>
                  <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.05rem", fontWeight: 600 }}>{it.name}</div>
                    <div style={{ fontSize: "0.78rem", color: FINANCE.muted }}>
                      {it.color}
                      {it.season ? ` · ${it.season}` : ""}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {tags.map((t) => (
                        <span
                          key={t}
                          style={{
                            padding: "3px 7px",
                            borderRadius: 4,
                            background: FINANCE.accentSoft,
                            fontSize: "0.68rem",
                            color: FINANCE.muted,
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    {it.description && (
                      <div style={{ ...type.body, fontSize: "0.8rem", fontStyle: "italic", color: FINANCE.muted }}>{it.description}</div>
                    )}
                    <div style={{ fontSize: "0.78rem", color: FINANCE.muted }}>
                      Worn <strong style={{ color: FINANCE.text }}>{wc}</strong> ·
                      {cpw != null ? (
                        <>
                          {" "}
                          CPW <strong style={{ color: FINANCE.text }}>${cpw}</strong>
                        </>
                      ) : (
                        " add price for CPW"
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {[
                        { key: "clean", label: "Clean" },
                        { key: "dirty", label: "Dirty" },
                        { key: "wash", label: "In wash" },
                      ].map((b) => {
                        const sel = it.laundryStatus === b.key;
                        return (
                          <button
                            key={b.key}
                            type="button"
                            onClick={() => updateItem(it.id, { laundryStatus: b.key })}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: `1px solid ${sel ? FINANCE.slate : FINANCE.border}`,
                              background: sel ? FINANCE.slateSoft : "transparent",
                              fontSize: "0.72rem",
                              cursor: "pointer",
                              color: FINANCE.text,
                            }}
                          >
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() =>
                          updateItem(it.id, {
                            wearCount: wc + 1,
                            timesWorn: wc + 1,
                            laundryStatus: "dirty",
                          })
                        }
                        style={{
                          flex: 1,
                          minWidth: 88,
                          padding: "12px 14px",
                          borderRadius: 10,
                          border: "none",
                          background: FINANCE.text,
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: "0.82rem",
                          cursor: "pointer",
                        }}
                      >
                        Wore it
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(it)}
                        style={mergeStyles(ui.secondaryButton, { padding: "12px 14px", fontSize: "0.82rem" })}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 10,
                          border: `1px solid ${COLORS.dangerSoft}`,
                          background: "#fff",
                          color: COLORS.danger,
                          fontSize: "0.82rem",
                          cursor: "pointer",
                        }}
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
      </div>

      {showAddModal && (
        <div
          role="presentation"
          onClick={() => setShowAddModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,26,26,0.45)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              borderRadius: 20,
              padding: 28,
              background: "#fff",
              border: `1px solid ${FINANCE.border}`,
              boxShadow: "0 24px 80px rgba(0,0,0,0.12)",
            }}
          >
            <h2 style={{ fontFamily: "'Playfair Display', serif", margin: "0 0 8px", fontSize: "1.45rem" }}>Add to closet</h2>
            <p style={{ margin: "0 0 20px", fontSize: "0.86rem", color: FINANCE.muted }}>
              Photo (AI catalog) or paste a store link (mock ingest).
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {["photo", "link"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAddTab(t)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: `1px solid ${addTab === t ? FINANCE.text : FINANCE.border}`,
                    background: addTab === t ? FINANCE.text : "transparent",
                    color: addTab === t ? "#fff" : FINANCE.muted,
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    textTransform: "capitalize",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {addTab === "photo" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem", color: FINANCE.text }}>
                  <input
                    type="checkbox"
                    checked={removeBgNext}
                    onChange={(e) => setRemoveBgNext(e.target.checked)}
                  />
                  Remove background (placeholder — wire clipping API here)
                </label>
                <input ref={modalFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleModalFile} />
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => modalFileRef.current?.click()}
                  style={{
                    padding: "14px 18px",
                    borderRadius: 12,
                    border: `1px dashed ${FINANCE.border}`,
                    background: FINANCE.accentSoft,
                    cursor: analyzing ? "wait" : "pointer",
                    fontSize: "0.9rem",
                  }}
                >
                  {analyzing ? "Analyzing…" : "Choose image"}
                </button>
                <p style={{ margin: 0, fontSize: "0.78rem", color: FINANCE.muted }}>
                  Or drop a file on the wardrobe page background (legacy).
                </p>
              </div>
            )}

            {addTab === "link" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: FINANCE.muted }}>Paste store link</label>
                <input
                  value={storeLink}
                  onChange={(e) => setStoreLink(e.target.value)}
                  placeholder="https://…"
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: `1px solid ${FINANCE.border}`,
                    fontSize: "0.9rem",
                  }}
                />
                <button
                  type="button"
                  disabled={linkLoading}
                  onClick={submitLink}
                  style={{
                    padding: "12px 18px",
                    borderRadius: 10,
                    border: "none",
                    background: FINANCE.text,
                    color: "#fff",
                    fontWeight: 600,
                    cursor: linkLoading ? "wait" : "pointer",
                  }}
                >
                  {linkLoading ? "Simulating…" : "Simulate import"}
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: `1px solid ${FINANCE.border}`,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onDrop(e, {})}
        style={{
          marginTop: 32,
          padding: "20px 24px",
          borderRadius: 14,
          border: `1px dashed ${FINANCE.border}`,
          textAlign: "center",
          fontSize: "0.82rem",
          color: FINANCE.muted,
          background: FINANCE.accentSoft,
        }}
      >
        Drop an image here for quick add (same AI catalog flow)
      </div>
    </>
  );
}
