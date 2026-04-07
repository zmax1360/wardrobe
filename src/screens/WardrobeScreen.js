import React, { useState } from "react";

import { FINANCE } from "../styles/financeTheme";
import { COLORS, baseTransition } from "../styles/theme";
import { calculateCPW, getPurchasePriceNum, getWearCount } from "../utils/wardrobeFinance";

const GALLERY_BG = "#FFFFFF";
const CARD_BG = "#FFFFFF";

/** Hide noisy raw URLs and long uncleaned blobs on cards. */
const DESCRIPTION_MAX_CHARS = 200;

function firstHttpUrlInString(str) {
  const m = String(str).match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : null;
}

/**
 * @returns {{ kind: "link"; href: string } | { kind: "text"; text: string } | null}
 */
function describeWardrobeCardText(raw) {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;

  if (t.toLowerCase().startsWith("http")) {
    return { kind: "link", href: t };
  }

  if (t.length > DESCRIPTION_MAX_CHARS) {
    const embedded = firstHttpUrlInString(t);
    if (embedded) return { kind: "link", href: embedded };
    return null;
  }

  const embedded = firstHttpUrlInString(t);
  if (embedded && (t.length > 90 || /imported|mock|source:/i.test(t))) {
    return { kind: "link", href: embedded };
  }

  return { kind: "text", text: t };
}

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
  const [pulseWearId, setPulseWearId] = useState(null);
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
        className="wardrobe-page"
        style={{
          background: GALLERY_BG,
          color: FINANCE.text,
          fontFamily: "'Inter', 'DM Sans', sans-serif",
          minHeight: 400,
        }}
      >
        <div
          className="wardrobe-page-header"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <h1 className="wardrobe-page-title" style={{ margin: "0 0 6px" }}>
              Financial Asset Gallery
            </h1>
            <p style={{ margin: 0, fontSize: "0.88rem", color: FINANCE.muted }}>
              Wardrobe as balance sheet · CPW on every piece
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
          <div className="wardrobe-gallery-grid">
            {filteredWardrobe.map((it) => {
              const pp = getPurchasePriceNum(it);
              const wc = getWearCount(it);
              const cpwFormatted = pp > 0 ? calculateCPW(pp, wc).toFixed(2) : null;

              const statusDotColor =
                it.laundryStatus === "clean"
                  ? "#2D6A4F"
                  : it.laundryStatus === "dirty"
                    ? "#D4A017"
                    : "#8B8B8B";

              return (
                <div
                  key={it.id}
                  className="wardrobe-gallery-card"
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div className="wardrobe-card-inner">
                    <div
                      className="wardrobe-card-image-frame"
                      style={{
                        position: "relative",
                        aspectRatio: "3 / 4",
                        width: "100%",
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: CARD_BG,
                        minHeight: 0,
                      }}
                    >
                      {it.imagePreview ? (
                        <img
                          className="wardrobe-card-image"
                          src={it.imagePreview}
                          alt=""
                          style={{ display: "block" }}
                        />
                      ) : (
                        <div style={{ color: FINANCE.muted, fontSize: "0.8rem" }}>No photo</div>
                      )}
                    </div>

                    <div
                      className="wardrobe-card-text-block"
                      style={{
                        paddingTop: 20,
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                        minHeight: 0,
                      }}
                    >
                      <div className="wardrobe-card-category" style={{ marginBottom: 8 }}>
                        {it.category || "Uncategorized"}
                      </div>

                      <div className="wardrobe-card-title-row">
                        <div className="wardrobe-card-name-group">
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: statusDotColor,
                              flexShrink: 0,
                              opacity: 0.85,
                            }}
                            title={
                              it.laundryStatus === "clean"
                                ? "Clean"
                                : it.laundryStatus === "dirty"
                                  ? "Dirty"
                                  : "In wash"
                            }
                            aria-label={
                              it.laundryStatus === "clean"
                                ? "Clean"
                                : it.laundryStatus === "dirty"
                                  ? "Dirty"
                                  : "In wash"
                            }
                          />
                          <div className="wardrobe-card-name">{it.name}</div>
                        </div>
                        <div className="wardrobe-card-cpw">
                          {cpwFormatted != null ? (
                            <>${cpwFormatted}</>
                          ) : (
                            <span className="wardrobe-card-cpw-empty">—</span>
                          )}
                        </div>
                      </div>

                      {(it.color || it.season) && (
                        <div style={{ fontSize: "0.75rem", color: FINANCE.muted, marginTop: 0 }}>
                          {it.color}
                          {it.season ? ` · ${it.season}` : ""}
                        </div>
                      )}
                      {(() => {
                        const desc = describeWardrobeCardText(it.description);
                        if (!desc) return null;
                        if (desc.kind === "link") {
                          return (
                            <div className="wardrobe-card-desc">
                              <a
                                href={desc.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: "10px", color: "#999", textDecoration: "underline" }}
                              >
                                View Product Page
                              </a>
                            </div>
                          );
                        }
                        return (
                          <div className="wardrobe-card-desc">
                            <span className="wardrobe-card-desc-text">{desc.text}</span>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="wardrobe-card-footer">
                      <div className="wardrobe-card-wear-label" aria-label={`${wc} wears`}>
                        {wc} wears
                      </div>
                      <div className="wardrobe-card-options">
                        {[
                          { key: "clean", label: "Clean", dot: "#2D6A4F" },
                          { key: "dirty", label: "Dirty", dot: "#D4A017" },
                          { key: "wash", label: "In wash", dot: "#8B8B8B" },
                        ].map((b) => {
                          const sel = it.laundryStatus === b.key;
                          return (
                            <button
                              key={b.key}
                              type="button"
                              aria-label={`Set laundry: ${b.label}`}
                              onClick={() => updateItem(it.id, { laundryStatus: b.key })}
                              style={{
                                width: 28,
                                height: 28,
                                padding: 0,
                                borderRadius: "50%",
                                border: `1px solid ${sel ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.08)"}`,
                                background: "transparent",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: b.dot,
                                  opacity: sel ? 1 : 0.45,
                                }}
                                aria-hidden
                              />
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => openEdit(it)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "1px solid rgba(0,0,0,0.12)",
                            background: "transparent",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                            color: FINANCE.text,
                            fontFamily: "'Inter', sans-serif",
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(it.id)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "1px solid rgba(200,100,90,0.35)",
                            background: "transparent",
                            color: COLORS.danger,
                            fontSize: "0.72rem",
                            cursor: "pointer",
                            fontFamily: "'Inter', sans-serif",
                          }}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className={pulseWearId === it.id ? "fos-wear-count--pulse" : undefined}
                          onClick={() => {
                            setPulseWearId(it.id);
                            updateItem(it.id, {
                              wearCount: wc + 1,
                              timesWorn: wc + 1,
                            });
                          }}
                          onAnimationEnd={(e) => {
                            e.stopPropagation();
                            setPulseWearId((p) => (p === it.id ? null : p));
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "1px solid rgba(0,0,0,0.12)",
                            background: "transparent",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                            color: FINANCE.text,
                            fontFamily: "'Inter', sans-serif",
                          }}
                        >
                          + Log wear
                        </button>
                      </div>
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
