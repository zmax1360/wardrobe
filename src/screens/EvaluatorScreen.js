import React, { useEffect, useMemo, useRef, useState } from "react";

import { COLORS } from "../constants/colors";
import { ui } from "../styles/ui";
import { mergeStyles, focusInputVisual, blurInputVisual } from "../utils/styleUtils";
import { runAgent } from "../agents/agentOrchestrator";

export function EvaluatorScreen({
  profile,
  wardrobe,
  baseTransition,
  setAgentInsights,
  buildProfileSummary,
  parseEvaluatorJson,
  normalizeEvaluatorResult,
  buildOutfitDescription,
  buildFullWardrobeList,
  buildSelectedWardrobeList,
  mergeFrequentIssuesFromImprovements,
  fileToBase64,
  evaluateOutfitWithVision,
}) {
  const [evaluatorMode, setEvaluatorMode] = useState("describe");
  const [describeText, setDescribeText] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState("");
  const [evaluatorResult, setEvaluatorResult] = useState(null);
  const [evaluatorLoading, setEvaluatorLoading] = useState(false);
  const [evaluatorError, setEvaluatorError] = useState("");
  const [improvedOutfitText, setImprovedOutfitText] = useState(null);
  const [fixOutfitLoading, setFixOutfitLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const fileRef = useRef(null);

  const wardrobeItems = wardrobe;

  const evaluatorSystemPrompt = `You are a strict but constructive fashion evaluator.
User profile: ${buildProfileSummary(profile)}.

Return ONLY valid JSON (no markdown):
{
  "score": {
    "fit": 8,
    "color": 8,
    "style": 7,
    "occasion": 8,
    "overall": 8
  },
  "verdict": "APPROVED",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["suggestion 1", "suggestion 2"],
  "stylist_note": "One sharp memorable insight."
}

verdict must be one of: APPROVED | NEEDS WORK | RECONSIDER
All score values must be numbers from 0 to 10.`;

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) {
      setUploadFile(f);
      setUploadPreview(URL.createObjectURL(f));
    }
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f && f.type.startsWith("image/")) {
      setUploadFile(f);
      setUploadPreview(URL.createObjectURL(f));
    }
  };

  useEffect(() => {
    return () => {
      if (uploadPreview && uploadPreview.startsWith("blob:")) URL.revokeObjectURL(uploadPreview);
    };
  }, [uploadPreview]);

  const modeChip = (id, label) => {
    const on = evaluatorMode === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          setEvaluatorMode(id);
          setEvaluatorError("");
          setEvaluatorResult(null);
          setImprovedOutfitText(null);
        }}
        style={mergeStyles(
          ui.chip,
          on
            ? {
                border: `1px solid ${COLORS.primary}`,
                background: COLORS.primarySoft,
                color: COLORS.text,
              }
            : null,
          { cursor: "pointer", transition: baseTransition }
        )}
      >
        {label}
      </button>
    );
  };

  const togglePickId = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getOriginalOutfitInput = () => {
    if (evaluatorMode === "describe") return describeText.trim();
    if (evaluatorMode === "pick") {
      const items = wardrobeItems.filter((it) => selectedIds.has(it.id));
      return items
        .map(
          (it) =>
            `- ${it.name} (${it.category}): ${it.color || "—"}, style: ${it.style || "—"}, laundry: ${it.laundryStatus || "—"}`
        )
        .join("\n");
    }
    if (evaluatorMode === "upload") {
      return uploadFile ? "Outfit submitted as a photo upload." : "";
    }
    return "";
  };

  const runFixOutfit = async () => {
    if (!evaluatorResult) return;
    const original = getOriginalOutfitInput();
    const weaknesses = Array.isArray(evaluatorResult.improvements) ? evaluatorResult.improvements : [];
    setFixOutfitLoading(true);
    setEvaluatorError("");
    try {
      const system = `Improve this outfit based on weaknesses.\nUser profile:\n${buildProfileSummary(profile)}`;
      const user =
        `Original outfit:\n${original || "(not specified)"}\n\nImprovements to address:\n` +
        (weaknesses.length ? weaknesses.map((w, i) => `${i + 1}. ${w}`).join("\n") : "(none listed)");
      const text = await runAgent({
        agentName: "Evaluator Agent",
        task: "Improve outfit",
        systemPrompt: system,
        userPrompt: user,
      });
      setImprovedOutfitText(String(text || "").trim());
    } catch (e) {
      setEvaluatorError(e.message || "Request failed.");
    } finally {
      setFixOutfitLoading(false);
    }
  };

  const runEvaluate = async () => {
    setEvaluatorError("");
    setEvaluatorResult(null);
    setImprovedOutfitText(null);
    if (evaluatorMode === "describe") {
      if (!describeText.trim()) {
        setEvaluatorError("Describe your outfit first.");
        return;
      }
      setEvaluatorLoading(true);
      try {
        const user = `The user described their outfit as:\n${describeText.trim()}`;
        const text = await runAgent({
          agentName: "Evaluator Agent",
          task: "Evaluate outfit",
          systemPrompt: evaluatorSystemPrompt,
          userPrompt: user,
        });
        const parsed = normalizeEvaluatorResult(parseEvaluatorJson(text));
        if (!parsed) throw new Error("Could not parse evaluator response.");
        setEvaluatorResult(parsed);
        setAgentInsights((prev) => ({
          ...prev,
          frequentIssues: mergeFrequentIssuesFromImprovements(prev.frequentIssues || [], parsed.improvements),
        }));
      } catch (e) {
        setEvaluatorError(e.message || "Request failed.");
      } finally {
        setEvaluatorLoading(false);
      }
      return;
    }
    if (evaluatorMode === "pick") {
      if (selectedIds.size < 1) {
        setEvaluatorError("Select at least one wardrobe item.");
        return;
      }
      const items = wardrobeItems.filter((it) => selectedIds.has(it.id));
      const lines = items
        .map(
          (it) =>
            `- ${it.name} (${it.category}): ${it.color || "—"}, style: ${it.style || "—"}, laundry: ${it.laundryStatus || "—"}`
        )
        .join("\n");
      setEvaluatorLoading(true);
      try {
        const user = `The outfit is composed of these wardrobe pieces:\n${lines}`;
        const text = await runAgent({
          agentName: "Evaluator Agent",
          task: "Evaluate outfit",
          systemPrompt: evaluatorSystemPrompt,
          userPrompt: user,
        });
        const parsed = normalizeEvaluatorResult(parseEvaluatorJson(text));
        if (!parsed) throw new Error("Could not parse evaluator response.");
        setEvaluatorResult(parsed);
        setAgentInsights((prev) => ({
          ...prev,
          frequentIssues: mergeFrequentIssuesFromImprovements(prev.frequentIssues || [], parsed.improvements),
        }));
      } catch (e) {
        setEvaluatorError(e.message || "Request failed.");
      } finally {
        setEvaluatorLoading(false);
      }
      return;
    }
    if (evaluatorMode === "upload") {
      if (!uploadFile) {
        setEvaluatorError("Upload an outfit photo.");
        return;
      }
      setEvaluatorLoading(true);
      try {
        const mediaType = mediaTypeForFile(uploadFile);
        const b64 = await fileToBase64(uploadFile);
        const text = await evaluateOutfitWithVision(b64, mediaType, profile);
        const parsed = normalizeEvaluatorResult(parseEvaluatorJson(text));
        if (!parsed) throw new Error("Could not parse evaluator response.");
        setEvaluatorResult(parsed);
        setAgentInsights((prev) => ({
          ...prev,
          frequentIssues: mergeFrequentIssuesFromImprovements(prev.frequentIssues || [], parsed.improvements),
        }));
      } catch (e) {
        setEvaluatorError(e.message || "Request failed.");
      } finally {
        setEvaluatorLoading(false);
      }
    }
  };

  const verdictBadgeStyle = (v) => {
    if (v === "APPROVED") return { background: "rgba(61,140,90,0.15)", color: "#2d6b45", border: `1px solid rgba(61,140,90,0.35)` };
    if (v === "NEEDS WORK") return { background: "rgba(201,162,39,0.2)", color: "#8a6f12", border: `1px solid rgba(201,162,39,0.4)` };
    if (v === "RECONSIDER") return { background: "rgba(196,92,92,0.15)", color: "#a33", border: `1px solid rgba(196,92,92,0.35)` };
    return { background: COLORS.surface2, color: COLORS.textMuted, border: `1px solid ${COLORS.borderSoft}` };
  };

  const scoreBarMini = (label, val) => {
    const n = typeof val === "number" && !Number.isNaN(val) ? Math.min(10, Math.max(0, val)) : 0;
    const pct = (n / 10) * 100;
    const barColor = n >= 7 ? "#3d8c5a" : n >= 4 ? "#c9a227" : "#c45c5c";
    return (
      <div key={label} style={mergeStyles(ui.softPanel, { padding: "10px 12px", minWidth: 0 })}>
        <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 6 }}>{n.toFixed(1)}/10</div>
        <div style={{ height: 8, borderRadius: 4, background: COLORS.border, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: baseTransition }} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.75rem",
          fontWeight: 600,
          margin: "0 0 8px",
        }}
      >
        Outfit Evaluator
      </h2>
      <p style={{ color: COLORS.textMuted, margin: "0 0 20px", fontSize: "0.9rem" }}>
        Choose how to share your outfit, then evaluate when ready.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {modeChip("describe", "Describe outfit")}
        {modeChip("pick", "Pick items from wardrobe")}
        {modeChip("upload", "Upload photo")}
      </div>

      {evaluatorMode === "describe" && (
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 20,
            border: `1px solid ${COLORS.border}`,
            marginBottom: 16,
          }}
        >
          <textarea
            value={describeText}
            onChange={(e) => setDescribeText(e.target.value)}
            placeholder="Describe your outfit..."
            rows={5}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surface2,
              color: COLORS.text,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "0.9rem",
              resize: "vertical",
            }}
          />
        </div>
      )}

      {evaluatorMode === "pick" && (
        <div
          style={{
            marginBottom: 16,
            maxHeight: 320,
            overflowY: "auto",
            borderRadius: 12,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
          }}
        >
          {wardrobeItems.length === 0 ? (
            <div style={{ padding: 20, color: COLORS.textMuted, fontSize: "0.9rem" }}>No items in your wardrobe yet.</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {wardrobeItems.map((it) => {
                const sel = selectedIds.has(it.id);
                return (
                  <li key={it.id} style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                    <button
                      type="button"
                      onClick={() => togglePickId(it.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 16px",
                        fontSize: "0.9rem",
                        color: COLORS.text,
                        border: "none",
                        background: sel ? COLORS.primarySoft : "transparent",
                        cursor: "pointer",
                        transition: baseTransition,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{it.name}</span>
                      <span style={{ color: COLORS.textMuted, marginLeft: 8 }}>
                        {it.category}
                        {it.color ? ` · ${it.color}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {evaluatorMode === "upload" && (
        <>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `1px dashed ${COLORS.primary}`,
              borderRadius: 12,
              padding: "28px 20px",
              textAlign: "center",
              marginBottom: 16,
              background: COLORS.surface,
              cursor: "pointer",
              transition: baseTransition,
            }}
          >
            {uploadPreview ? (
              <img
                src={uploadPreview}
                alt=""
                style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, objectFit: "contain" }}
              />
            ) : (
              <>
                <div style={{ fontSize: "1.35rem", marginBottom: 6 }}>＋</div>
                <div style={{ fontWeight: 600 }}>Drop a photo or click to upload</div>
                <div style={{ color: COLORS.textMuted, fontSize: "0.85rem", marginTop: 4 }}>JPEG, PNG, WebP</div>
              </>
            )}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={runEvaluate}
        disabled={evaluatorLoading}
        style={mergeStyles(ui.primaryButton, {
          marginBottom: 20,
          opacity: evaluatorLoading ? 0.75 : 1,
          cursor: evaluatorLoading ? "wait" : "pointer",
        })}
      >
        {evaluatorLoading ? "Evaluating…" : "Evaluate Outfit"}
      </button>

      {evaluatorError ? (
        <div style={{ ...mergeStyles(ui.softPanel, { padding: 14, marginBottom: 16, color: COLORS.danger }) }}>{evaluatorError}</div>
      ) : null}

      {evaluatorResult && evaluatorResult.score ? (
        <>
        <div style={mergeStyles(ui.panel, { padding: 20, marginBottom: 20 })}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {scoreBarMini("Fit", evaluatorResult.score.fit)}
            {scoreBarMini("Color", evaluatorResult.score.color)}
            {scoreBarMini("Style", evaluatorResult.score.style)}
            {scoreBarMini("Occasion", evaluatorResult.score.occasion)}
            {scoreBarMini("Overall", evaluatorResult.score.overall)}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 6 }}>Verdict</div>
            <span
              style={mergeStyles(ui.chip, verdictBadgeStyle(evaluatorResult.verdict), {
                padding: "10px 14px",
                fontSize: "0.9rem",
              })}
            >
              {evaluatorResult.verdict}
            </span>
          </div>

          {evaluatorResult.strengths.length > 0 ? (
            <div style={mergeStyles(ui.softPanel, { padding: "14px 16px", marginBottom: 12 })}>
              <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 8 }}>Strengths</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: COLORS.text }}>
                {evaluatorResult.strengths.map((s, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {evaluatorResult.improvements.length > 0 ? (
            <div style={mergeStyles(ui.softPanel, { padding: "14px 16px", marginBottom: 12 })}>
              <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 8 }}>Improvements</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: COLORS.text }}>
                {evaluatorResult.improvements.map((s, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {evaluatorResult.stylist_note ? (
            <div
              style={mergeStyles(ui.softPanel, {
                padding: "16px 18px",
                background: COLORS.primarySoft,
                border: `1px solid ${COLORS.primarySoft}`,
              })}
            >
              <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 8 }}>Stylist note</div>
              <div style={{ fontSize: "0.95rem", lineHeight: 1.55, color: COLORS.text, fontStyle: "italic" }}>
                {evaluatorResult.stylist_note}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={runFixOutfit}
            disabled={fixOutfitLoading || evaluatorLoading}
            style={mergeStyles(ui.secondaryButton, {
              marginTop: 16,
              width: "100%",
              opacity: fixOutfitLoading || evaluatorLoading ? 0.75 : 1,
              cursor: fixOutfitLoading || evaluatorLoading ? "wait" : "pointer",
            })}
          >
            {fixOutfitLoading ? "Working…" : "Fix This Outfit"}
          </button>
        </div>

        {improvedOutfitText ? (
          <div
            style={mergeStyles(ui.softPanel, {
              padding: "18px 20px",
              marginBottom: 20,
              border: `1px solid ${COLORS.primary}`,
              background: COLORS.primarySoft,
              boxShadow: COLORS.cardGlow,
            })}
          >
            <div
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "1.25rem",
                fontWeight: 600,
                marginBottom: 12,
                color: COLORS.primary,
              }}
            >
              Improved Version
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, color: COLORS.text, fontSize: "0.95rem" }}>
              {improvedOutfitText}
            </div>
          </div>
        ) : null}
        </>
      ) : null}
    </div>
  );
}
