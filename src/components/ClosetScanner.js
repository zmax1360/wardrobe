import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callClosetPhotoVision } from "../services/aiService";
import { blobToBase64, compressImage } from "../utils/compressImage";

const BRAND_BG = "#1a1208";
const BRAND_AMBER = "#c4813a";
const TEXT_WARM = "#faf7f2";
const BORDER_SOFT = "rgba(196,129,58,0.3)";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ACCEPT_ATTR = "image/jpeg,image/png,image/webp";

const ANALYSIS_MESSAGES = [
  "Scanning your closet…",
  "Counting items…",
  "Identifying colours…",
  "Categorising styles…",
];

const CLOSET_SCAN_PROMPT = `Analyze this closet photo carefully. Count and categorize every visible clothing item you can see. Be specific about counts — look carefully at each hanger or folded item. Return ONLY a valid JSON array with no explanation, no markdown, no backticks. Format: [{"category": string, "count": number, "colors": string[], "style": string}]`;

const COLOR_LOOKUP = [
  [["white"], "#f5f5f5"],
  [["black"], "#1a1a1a"],
  [["gray", "grey"], "#9e9e9e"],
  [["beige"], "#d4b896"],
  [["navy"], "#1a237e"],
  [["blue"], "#1565c0"],
  [["light blue", "light-blue", "sky blue"], "#90caf9"],
  [["pink"], "#f48fb1"],
  [["red"], "#c62828"],
  [["green"], "#2e7d32"],
  [["brown"], "#4e342e"],
  [["cream"], "#fff8e1"],
  [["striped", "stripe", "stripes"], "linear-gradient(90deg, #f5f5f5 0%, #f5f5f5 40%, #1565c0 40%, #1565c0 60%, #f5f5f5 60%, #f5f5f5 100%)"],
  [["patterned", "pattern", "print"], BRAND_AMBER],
];

function resolveColorVisual(name) {
  const raw = String(name || "").trim().toLowerCase();
  if (!raw) return TEXT_WARM;
  for (const [keys, val] of COLOR_LOOKUP) {
    if (keys.some((k) => raw.includes(k))) return val;
  }
  return "#8d7a68";
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseResultsArray(rawText) {
  let s = String(rawText || "")
    .replace(/```json|```/gi, "")
    .trim();

  const tryParse = (x) => {
    try {
      return JSON.parse(x);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(s);
  if (Array.isArray(parsed)) return parsed;

  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end > start) {
    parsed = tryParse(s.slice(start, end + 1));
    if (Array.isArray(parsed)) return parsed;
  }
  throw new Error("parse");
}

function normalizeRows(arr) {
  return arr.map((item) => {
    const category = String(item?.category ?? "").trim() || "Other";
    const count = Math.max(0, Math.min(99, Math.floor(Number(item?.count)) || 0));
    const colors = Array.isArray(item?.colors) ? item.colors.map(String).slice(0, 8) : [];
    const style = String(item?.style ?? "").trim() || "—";
    return { id: uid(), category, count, colors, style, included: true };
  });
}

/**
 * Closet bulk photo analysis — optional persist via `onSaveItems`; onboarding uses `onScanComplete` only.
 * @typedef {{ id: string, category: string, count: number, colors: string[], style: string, included: boolean }} ClosetScanRow
 */
export function ClosetScanner({
  isOpen,
  onClose,
  onScanComplete,
  onSaveItems,
  isSaving = false,
}) {
  const [phase, setPhase] = useState("upload");
  const [toast, setToast] = useState(null);
  const [banner, setBanner] = useState(null);
  const [compressedBlob, setCompressedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [oversized, setOversized] = useState(false);
  const [rows, setRows] = useState([]);
  const [msgIndex, setMsgIndex] = useState(0);
  const fileRef = useRef(null);

  const revokeSafe = useCallback((u) => {
    if (u && String(u).startsWith("blob:")) URL.revokeObjectURL(u);
  }, []);

  const resetFlow = useCallback(() => {
    setPhase("upload");
    setCompressedBlob(null);
    setPreviewUrl((prev) => {
      revokeSafe(prev);
      return null;
    });
    setOversized(false);
    setRows([]);
    setMsgIndex(0);
    setBanner(null);
  }, [revokeSafe]);

  useEffect(() => {
    if (!isOpen) {
      resetFlow();
      return undefined;
    }
    return undefined;
  }, [isOpen, resetFlow]);

  useEffect(() => () => revokeSafe(previewUrl), [previewUrl, revokeSafe]);

  const showToast = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const onPickFiles = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;

    const type = String(file.type || "").toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
      setBanner("Please use a JPEG, PNG, or WebP image.");
      return;
    }

    setBanner(null);
    revokeSafe(previewUrl);

    try {
      const blob = await compressImage(file, 1200, 0.75);
      setCompressedBlob(blob);
      setOversized(blob.size > MAX_UPLOAD_BYTES);

      const nextUrl = URL.createObjectURL(blob);
      setPreviewUrl(nextUrl);
    } catch {
      setBanner("Could not process that image. Try another file.");
    }
  };

  useEffect(() => {
    if (phase !== "analyzing") return undefined;
    const id = window.setInterval(() => {
      setMsgIndex((i) => (i + 1) % ANALYSIS_MESSAGES.length);
    }, 2000);
    return () => clearInterval(id);
  }, [phase]);

  const runAnalysis = async () => {
    if (!compressedBlob) return;

    setPhase("analyzing");
    setMsgIndex(0);

    try {
      const b64 = await blobToBase64(compressedBlob);
      const text = await callClosetPhotoVision(b64, CLOSET_SCAN_PROMPT);
      try {
        const arr = parseResultsArray(text);
        if (!arr.length) {
          setPhase("upload");
          setBanner(
            "No clothing items detected. Try a photo with better lighting and make sure clothes are clearly visible."
          );
          return;
        }
        setRows(normalizeRows(arr));
        setPhase("results");
      } catch {
        setPhase("upload");
        setBanner("Couldn't read the photo clearly. Try a clearer image with better lighting.");
      }
    } catch {
      setPhase("upload");
      setBanner("Something went wrong. Try again.");
    }
  };

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.included);
    const cats = active.length;
    const total = active.reduce((n, r) => n + r.count, 0);
    return { total, categories: cats };
  }, [rows]);

  const bumpCount = (id, delta) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = Math.max(0, Math.min(99, r.count + delta));
        return { ...r, count: next };
      })
    );
  };

  const toggleIncluded = (id) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, included: !r.included } : r))
    );
  };

  const handleAddToWardrobe = async () => {
    const rowPayload = rows.map((r) => ({ ...r }));
    const toSave = rowPayload.filter((r) => r.included && r.count > 0);
    if (toSave.length === 0) {
      showToast("Include at least one category with items to save.");
      return;
    }

    if (onSaveItems) {
      try {
        await onSaveItems({ rows: toSave, photoBlob: compressedBlob ?? null });
        showToast("Added to your wardrobe!");
        const done = (thumbnail) => {
          onScanComplete?.({ rows: rowPayload, thumbnail });
          window.setTimeout(() => onClose(), 380);
        };
        if (onScanComplete) {
          if (compressedBlob instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => done(reader.result);
            reader.readAsDataURL(compressedBlob);
          } else {
            done(previewUrl || "");
          }
        } else {
          window.setTimeout(() => onClose(), 380);
        }
      } catch (e) {
        console.error(e);
        showToast(typeof e?.message === "string" ? e.message : "Could not save.");
      }
      return;
    }

    if (onScanComplete) {
      const deliver = (thumbnail) => {
        onScanComplete({ rows: rowPayload, thumbnail });
        showToast("Coming soon");
        window.setTimeout(() => onClose(), 260);
      };
      if (compressedBlob instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => deliver(reader.result);
        reader.readAsDataURL(compressedBlob);
      } else {
        deliver(previewUrl || "");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="closet-scanner-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 2000,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
        overflowY: "auto",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={
          phase === "results" ? "closet-scanner-results-title" : "closet-scanner-headline"
        }
        className="closet-scanner-card"
        style={{
          alignSelf: "center",
          width: "min(560px, 100%)",
          minHeight: 0,
          maxHeight: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: BRAND_BG,
          borderRadius: "clamp(0px, 2vw, 16px)",
          border: `1px solid ${BORDER_SOFT}`,
          color: TEXT_WARM,
          fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif",
          margin: "auto",
          boxSizing: "border-box",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
        }}
      >
        <style>{`
          @media (max-width: 600px) {
            .closet-scanner-card {
              width: 100% !important;
              max-width: 100% !important;
              border-radius: 0 !important;
              min-height: 100vh;
              margin: 0 !important;
            }
            .closet-scanner-scroll {
              flex: 1 !important;
            }
          }
          @keyframes closetScannerSpin {
            to { transform: rotate(360deg); }
          }
        `}</style>

        {toast ? (
          <div
            role="status"
            style={{
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 3000,
              background: BRAND_AMBER,
              color: BRAND_BG,
              padding: "12px 20px",
              borderRadius: 999,
              fontWeight: 600,
              fontSize: "0.9rem",
              boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
              maxWidth: "min(420px, 92vw)",
              textAlign: "center",
            }}
          >
            {toast}
          </div>
        ) : null}

        <div
          className="closet-scanner-scroll"
          style={{
            overflowY: "auto",
            padding: "clamp(18px, 4vw, 26px)",
            flex: "0 1 auto",
            maxHeight: "min(90vh, 900px)",
          }}
        >
          {banner ? (
            <div
              role="alert"
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(198,92,92,0.15)",
                border: "1px solid rgba(198,92,92,0.45)",
                color: "#ffb3a8",
                fontSize: "0.88rem",
                lineHeight: 1.45,
              }}
            >
              {banner}
            </div>
          ) : null}

          {phase === "upload" && (
            <>
              <h2 id="closet-scanner-headline" style={{ margin: "0 0 8px", fontSize: "1.45rem", fontWeight: 600 }}>
                Scan your closet
              </h2>
              <p style={{ margin: "0 0 18px", color: "rgba(250,247,242,0.72)", lineHeight: 1.55, fontSize: "0.95rem" }}>
                Take a photo of your hanging clothes, shelves, or drawer. We&apos;ll identify everything.
              </p>
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: "0.82rem",
                  color: "rgba(196,129,58,0.85)",
                  lineHeight: 1.5,
                  fontStyle: "italic",
                }}
              >
                💡 Tip: scan one section at a time — hanging clothes, then shelves, then drawers. You can add multiple photos.
              </p>

              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT_ATTR}
                style={{ display: "none" }}
                onChange={(e) => {
                  onPickFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPickFiles(e.dataTransfer.files);
                }}
                style={{
                  width: "100%",
                  minHeight: 160,
                  borderRadius: 12,
                  border: `2px dashed ${BRAND_AMBER}`,
                  background: "rgba(196,129,58,0.06)",
                  color: TEXT_WARM,
                  fontSize: "1rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "20px 16px",
                  marginBottom: 16,
                  boxSizing: "border-box",
                }}
              >
                Drop a photo here or tap to upload
              </button>

              {oversized ? (
                <p style={{ margin: "0 0 12px", color: "#ffb3a8", fontSize: "0.88rem" }}>
                  Compressed file is over 5MB — the scan may fail or cost more. Consider a tighter crop or simpler
                  lighting.
                </p>
              ) : null}

              {previewUrl ? (
                <div style={{ marginBottom: 16 }}>
                  <img src={previewUrl} alt="" style={{ width: "100%", borderRadius: 12, display: "block" }} />
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  disabled={!compressedBlob}
                  onClick={() => runAnalysis()}
                  style={{
                    padding: "14px 22px",
                    borderRadius: 999,
                    border: "none",
                    background: BRAND_AMBER,
                    color: BRAND_BG,
                    fontWeight: 700,
                    fontSize: "0.92rem",
                    cursor: compressedBlob ? "pointer" : "not-allowed",
                    opacity: compressedBlob ? 1 : 0.45,
                  }}
                >
                  Analyse Photo
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 999,
                    border: `1px solid ${BORDER_SOFT}`,
                    background: "transparent",
                    color: TEXT_WARM,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {phase === "analyzing" && (
            <div style={{ textAlign: "center", padding: "28px 0 12px" }}>
              <div style={{ position: "relative", maxWidth: 320, margin: "0 auto 24px", borderRadius: 12, overflow: "hidden" }}>
                {previewUrl ? (
                  <img src={previewUrl} alt="" style={{ width: "100%", display: "block", opacity: 0.35 }} />
                ) : null}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(26,18,8,0.55)",
                  }}
                >
                  <div
                    aria-hidden
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      border: "3px solid rgba(196,129,58,0.25)",
                      borderTopColor: BRAND_AMBER,
                      animation: "closetScannerSpin 0.88s linear infinite",
                    }}
                  />
                </div>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: "1.1rem", fontWeight: 600 }}>{ANALYSIS_MESSAGES[msgIndex]}</p>
              <p style={{ margin: 0, color: "rgba(250,247,242,0.55)", fontSize: "0.88rem" }}>Hang tight.</p>
            </div>
          )}

          {phase === "results" && (
            <>
              <h2 id="closet-scanner-results-title" style={{ margin: "0 0 8px", fontSize: "1.45rem", fontWeight: 600 }}>
                Here&apos;s what we found
              </h2>
              <p style={{ margin: "0 0 16px", color: "rgba(250,247,242,0.72)", lineHeight: 1.55 }}>
                Does this look right? You can edit before saving.
              </p>

              <p style={{ margin: "0 0 20px", color: BRAND_AMBER, fontWeight: 700, fontSize: "1.1rem" }}>
                {summary.total} items across {summary.categories} categor{summary.categories === 1 ? "y" : "ies"}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
                {rows.map((row) => (
                  <article
                    key={row.id}
                    style={{
                      border: `1px solid ${BORDER_SOFT}`,
                      borderRadius: 12,
                      padding: "14px 14px",
                      background: "rgba(12,8,4,0.45)",
                      opacity: row.included ? 1 : 0.5,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", flex: "1 1 160px" }}>
                        <input
                          type="checkbox"
                          checked={row.included}
                          onChange={() => toggleIncluded(row.id)}
                          style={{ marginTop: 6 }}
                          aria-label={`Include ${row.category}`}
                        />
                        <span>
                          <h3 style={{ margin: "0 0 10px", fontSize: "1.05rem", fontWeight: 600 }}>{row.category}</h3>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              aria-label={`Decrease ${row.category} count`}
                              onClick={() => bumpCount(row.id, -1)}
                              style={countBtnStyle}
                            >
                              −
                            </button>
                            <span style={{ fontWeight: 700, minWidth: 28, textAlign: "center" }}>{row.count}</span>
                            <button
                              type="button"
                              aria-label={`Increase ${row.category} count`}
                              onClick={() => bumpCount(row.id, 1)}
                              style={countBtnStyle}
                            >
                              +
                            </button>
                          </div>
                        </span>
                      </label>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                        {(row.colors.length ? row.colors : ["neutral"]).slice(0, 6).map((c, i) => {
                          const viz = resolveColorVisual(c);
                          const isStripe = viz.startsWith("linear-gradient");
                          return (
                            <span key={i} title={String(c)}>
                              <span
                                style={{
                                  display: "block",
                                  width: 26,
                                  height: 26,
                                  borderRadius: "50%",
                                  border: `1px solid ${BORDER_SOFT}`,
                                  boxSizing: "border-box",
                                  background: isStripe ? viz : viz,
                                  backgroundSize: "cover",
                                }}
                              />
                            </span>
                          );
                        })}
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 12px",
                            borderRadius: 999,
                            background: `${BRAND_AMBER}22`,
                            color: BRAND_AMBER,
                            fontSize: "0.8rem",
                            fontWeight: 600,
                          }}
                        >
                          {row.style}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <p
                style={{
                  fontSize: "0.82rem",
                  color: "rgba(250,247,242,0.55)",
                  textAlign: "center",
                  margin: "0 0 14px",
                }}
              >
                {"\"Add to My Wardrobe\" saves this scan. To scan another section, save first then scan again."}
              </p>

              <button
                type="button"
                onClick={() => void handleAddToWardrobe()}
                disabled={isSaving || summary.total === 0}
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  marginBottom: 10,
                  borderRadius: 999,
                  border: "none",
                  background:
                    isSaving || summary.total === 0 ? `${BRAND_AMBER}66` : BRAND_AMBER,
                  color: BRAND_BG,
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  cursor: isSaving || summary.total === 0 ? "default" : "pointer",
                  opacity: isSaving || summary.total === 0 ? 0.75 : 1,
                }}
              >
                {isSaving ? "Saving…" : "Add to My Wardrobe ✓"}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  resetFlow();
                  setBanner(null);
                }}
                style={{
                  width: "100%",
                  padding: "12px 18px",
                  marginBottom: 8,
                  borderRadius: 999,
                  border: `1px solid ${BORDER_SOFT}`,
                  background: "transparent",
                  color: TEXT_WARM,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Discard & Scan Again
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={onClose}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "none",
                  background: "none",
                  color: "rgba(250,247,242,0.55)",
                  textDecoration: "underline",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const countBtnStyle = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: `1px solid rgba(196,129,58,0.35)`,
  background: "#2a2318",
  color: TEXT_WARM,
  fontWeight: 700,
  fontSize: "1rem",
  cursor: "pointer",
  lineHeight: 1,
};
