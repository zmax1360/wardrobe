import React, { useState, useRef } from "react";

import { FINANCE } from "../styles/financeTheme";
import { COLORS, baseTransition } from "../styles/theme";
import { calculateCPW, getPurchasePriceNum, getTimesWorn, WARDROBE_OCCASION_VALUES } from "../utils/wardrobeFinance";
import { CHIC_WARDROBE_MOODS } from "../constants/chicMoods";
import { useWardrobeAgent } from "../hooks/useWardrobeAgent";

const GALLERY_BG = "#FFFFFF";
const CARD_BG = "#FFFFFF";

const MANUAL_CATEGORIES = [
  "Tops",
  "Bottoms",
  "Outerwear",
  "Shoes",
  "Accessories",
  "Dresses",
  "Activewear",
  "Formal",
];
const SEASON_OPTIONS = ["Spring", "Summer", "Fall", "Winter", "All"];

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
  const [removeBgNext, setRemoveBgNext] = useState(false);
  const [pulseWearId, setPulseWearId] = useState(null);
  const [agentQuery, setAgentQuery] = useState("");

  const [manualName, setManualName] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualPurchasePrice, setManualPurchasePrice] = useState("");
  const [manualColor, setManualColor] = useState("");
  const [manualBrand, setManualBrand] = useState("");
  const [manualSeason, setManualSeason] = useState([]);
  const [manualOccasion, setManualOccasion] = useState([]);
  const [manualMaterial, setManualMaterial] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualMood, setManualMood] = useState("");
  const [manualSourceUrl, setManualSourceUrl] = useState("");
  const [manualImageFile, setManualImageFile] = useState(null);
  const [manualImagePreviewUrl, setManualImagePreviewUrl] = useState(null);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);

  const modalFileRef = useRef(null);
  const manualImageInputRef = useRef(null);

  const { ask: askWardrobeAgent, response: agentResponse, loading: agentLoading, error: agentError } =
    useWardrobeAgent();

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
    addManualWardrobeItem,
    addWardrobeFromFile,
  } = handlers;

  const resetManualForm = () => {
    setManualName("");
    setManualCategory("");
    setManualPurchasePrice("");
    setManualColor("");
    setManualBrand("");
    setManualSeason([]);
    setManualOccasion([]);
    setManualMaterial("");
    setManualNotes("");
    setManualMood("");
    setManualSourceUrl("");
    setManualImageFile(null);
    if (manualImagePreviewUrl) URL.revokeObjectURL(manualImagePreviewUrl);
    setManualImagePreviewUrl(null);
    setMoreDetailsOpen(false);
    setManualSaving(false);
  };

  const toggleSeason = (s) => {
    if (s === "All") {
      setManualSeason((prev) => (prev.includes("All") ? [] : ["All"]));
      return;
    }
    setManualSeason((prev) => {
      const base = prev.filter((x) => x !== "All");
      if (base.includes(s)) return base.filter((x) => x !== s);
      return [...base, s];
    });
  };

  const toggleOccasion = (o) => {
    setManualOccasion((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));
  };

  const onManualImagePick = (fileList) => {
    const f = fileList?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    if (manualImagePreviewUrl) URL.revokeObjectURL(manualImagePreviewUrl);
    setManualImageFile(f);
    setManualImagePreviewUrl(URL.createObjectURL(f));
  };

  const canSubmitManual =
    manualName.trim().length > 0 &&
    manualCategory !== "" &&
    manualPurchasePrice.trim() !== "" &&
    Number.isFinite(parseFloat(manualPurchasePrice.replace(/[^0-9.-]/g, "")));

  const submitManualWardrobe = async () => {
    if (!canSubmitManual || manualSaving) return;
    setManualSaving(true);
    try {
      await addManualWardrobeItem({
        name: manualName,
        category: manualCategory,
        purchasePrice: manualPurchasePrice,
        color: manualColor,
        brand: manualBrand,
        season: manualSeason,
        occasion: manualOccasion,
        material: manualMaterial,
        notes: manualNotes,
        mood: manualMood,
        sourceUrl: manualSourceUrl,
        imageFile: manualImageFile,
      });
      resetManualForm();
      setShowAddModal(false);
    } catch (err) {
      alert(err?.message || "Could not add item");
    } finally {
      setManualSaving(false);
    }
  };

  const handleModalFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) addWardrobeFromFile(f, { removeBg: removeBgNext });
    setShowAddModal(false);
    setRemoveBgNext(false);
  };

  const onWardrobeAgentSubmit = (e) => {
    e.preventDefault();
    askWardrobeAgent(agentQuery);
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
            onClick={() => {
              resetManualForm();
              setShowAddModal(true);
            }}
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
              const wc = getTimesWorn(it);
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
                        <div className="wardrobe-card-placeholder" aria-hidden>
                          {(it.name || "?").trim().charAt(0).toUpperCase()}
                        </div>
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
                      <div
                        className="wardrobe-card-category-row"
                        style={{
                          marginBottom: 8,
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "baseline",
                          gap: "4px 10px",
                        }}
                      >
                        <span className="wardrobe-card-category">{it.category || "Uncategorized"}</span>
                        {it.mood ? (
                          <span className="wardrobe-card-mood" aria-label={`Mood: ${it.mood}`}>
                            {it.mood}
                          </span>
                        ) : null}
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
          className="wardrobe-add-modal-backdrop"
          onClick={() => {
            resetManualForm();
            setShowAddModal(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,26,26,0.45)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="wardrobe-add-modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: addTab === "manual" ? 480 : 440,
              background: "#fff",
              border: `1px solid ${FINANCE.border}`,
              boxShadow: "0 24px 80px rgba(0,0,0,0.12)",
            }}
          >
            <h2 className="wardrobe-add-modal-title" style={{ fontFamily: "'Playfair Display', serif", margin: "0 0 8px", fontSize: "1.45rem" }}>Add to closet</h2>
            <p className="wardrobe-add-modal-lede" style={{ margin: "0 0 20px", fontSize: "0.86rem", color: FINANCE.muted }}>
              Photo (AI catalog) or add details manually — no store login required.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {[
                { id: "photo", label: "Photo" },
                { id: "manual", label: "Manual" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAddTab(id)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: `1px solid ${addTab === id ? FINANCE.text : FINANCE.border}`,
                    background: addTab === id ? FINANCE.text : "transparent",
                    color: addTab === id ? "#fff" : FINANCE.muted,
                    cursor: "pointer",
                    fontSize: "0.82rem",
                  }}
                >
                  {label}
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

            {addTab === "manual" && (
              <div className="wardrobe-manual-form">
                <label className="wardrobe-manual-label">Item name *</label>
                <input
                  className="wardrobe-manual-input"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Navy Blazer"
                  autoComplete="off"
                />

                <label className="wardrobe-manual-label">Category *</label>
                <select
                  className="wardrobe-manual-input wardrobe-manual-select"
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                >
                  <option value="">Select…</option>
                  {MANUAL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <label className="wardrobe-manual-label">Purchase price *</label>
                <div className="wardrobe-manual-price-wrap">
                  <span className="wardrobe-manual-price-prefix" aria-hidden>
                    $
                  </span>
                  <input
                    className="wardrobe-manual-input wardrobe-manual-input--price"
                    type="text"
                    inputMode="decimal"
                    value={manualPurchasePrice}
                    onChange={(e) => setManualPurchasePrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <label className="wardrobe-manual-label">Image (optional)</label>
                <input
                  ref={manualImageInputRef}
                  type="file"
                  accept="image/*"
                  className="wardrobe-manual-file-input"
                  onChange={(e) => {
                    onManualImagePick(e.target.files);
                    e.target.value = "";
                  }}
                />
                <div
                  role="button"
                  tabIndex={0}
                  className="wardrobe-manual-dropzone"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") manualImageInputRef.current?.click();
                  }}
                  onClick={() => manualImageInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    onManualImagePick(e.dataTransfer.files);
                  }}
                >
                  {manualImagePreviewUrl ? (
                    <img src={manualImagePreviewUrl} alt="" className="wardrobe-manual-dropzone-img" />
                  ) : (
                    <div className="wardrobe-manual-placeholder-tile">
                      <span className="wardrobe-manual-placeholder-letter">
                        {(manualName.trim().charAt(0) || "?").toUpperCase()}
                      </span>
                      <span className="wardrobe-manual-dropzone-hint">Click or drop an image</span>
                    </div>
                  )}
                </div>

                <label className="wardrobe-manual-label">Product URL (optional)</label>
                <input
                  className="wardrobe-manual-input"
                  type="url"
                  value={manualSourceUrl}
                  onChange={(e) => setManualSourceUrl(e.target.value)}
                  placeholder="https://… paste link for reference"
                  autoComplete="off"
                />

                <button
                  type="button"
                  className="wardrobe-manual-details-toggle"
                  onClick={() => setMoreDetailsOpen((o) => !o)}
                  aria-expanded={moreDetailsOpen}
                >
                  More details {moreDetailsOpen ? "▴" : "▾"}
                </button>
                <div className={`wardrobe-manual-details-panel ${moreDetailsOpen ? "wardrobe-manual-details-panel--open" : ""}`}>
                  <div className="wardrobe-manual-details-inner">
                    <label className="wardrobe-manual-label">Color</label>
                    <input
                      className="wardrobe-manual-input"
                      value={manualColor}
                      onChange={(e) => setManualColor(e.target.value)}
                      placeholder="e.g. Navy Blue"
                    />
                    <label className="wardrobe-manual-label">Brand</label>
                    <input
                      className="wardrobe-manual-input"
                      value={manualBrand}
                      onChange={(e) => setManualBrand(e.target.value)}
                      placeholder="e.g. Ralph Lauren"
                    />
                    <span className="wardrobe-manual-label">Season</span>
                    <div className="wardrobe-manual-pill-row">
                      {SEASON_OPTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`wardrobe-manual-pill ${manualSeason.includes(s) ? "wardrobe-manual-pill--on" : ""}`}
                          onClick={() => toggleSeason(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <span className="wardrobe-manual-label">Occasion</span>
                    <div className="wardrobe-manual-pill-row">
                      {WARDROBE_OCCASION_VALUES.map((o) => (
                        <button
                          key={o}
                          type="button"
                          className={`wardrobe-manual-pill ${manualOccasion.includes(o) ? "wardrobe-manual-pill--on" : ""}`}
                          onClick={() => toggleOccasion(o)}
                        >
                          {o.charAt(0).toUpperCase() + o.slice(1)}
                        </button>
                      ))}
                    </div>
                    <label className="wardrobe-manual-label">Material</label>
                    <input
                      className="wardrobe-manual-input"
                      value={manualMaterial}
                      onChange={(e) => setManualMaterial(e.target.value)}
                      placeholder="e.g. Cotton"
                    />
                    <label className="wardrobe-manual-label">Notes</label>
                    <textarea
                      className="wardrobe-manual-input wardrobe-manual-textarea"
                      value={manualNotes}
                      onChange={(e) => setManualNotes(e.target.value)}
                      placeholder="Any details about this item..."
                      rows={3}
                    />
                    <span className="wardrobe-manual-label">Mood</span>
                    <div className="wardrobe-manual-pill-row">
                      {CHIC_WARDROBE_MOODS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`wardrobe-manual-pill ${manualMood === m ? "wardrobe-manual-pill--on" : ""}`}
                          onClick={() => setManualMood((cur) => (cur === m ? "" : m))}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="wardrobe-manual-submit"
                  disabled={!canSubmitManual || manualSaving}
                  onClick={submitManualWardrobe}
                >
                  {manualSaving ? "Adding…" : "Add to Wardrobe"}
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
              <button
                type="button"
                onClick={() => {
                  resetManualForm();
                  setShowAddModal(false);
                }}
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

      <div className="wardrobe-agent-wrap">
        <form className="wardrobe-agent-form" onSubmit={onWardrobeAgentSubmit}>
          <div className="wardrobe-agent-bar">
            <input
              className="wardrobe-agent-input"
              type="search"
              enterKeyHint="send"
              placeholder="Ask your wardrobe agent..."
              value={agentQuery}
              onChange={(e) => setAgentQuery(e.target.value)}
              disabled={agentLoading}
              aria-label="Ask your wardrobe agent"
            />
            <button
              type="submit"
              className="wardrobe-agent-send"
              disabled={agentLoading}
              aria-label="Send question"
            >
              →
            </button>
          </div>
        </form>
        {agentLoading ? (
          <p className="wardrobe-agent-reply wardrobe-agent-reply--loading">Thinking...</p>
        ) : agentError ? (
          <p className="wardrobe-agent-reply wardrobe-agent-reply--error">{agentError}</p>
        ) : agentResponse ? (
          <p className="wardrobe-agent-reply">{agentResponse}</p>
        ) : null}
      </div>
    </>
  );
}
