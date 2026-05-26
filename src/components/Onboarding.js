import { useEffect, useMemo, useState } from "react";

import { COLORS } from "../constants/colors";
import { buildWardrobeItems } from "../utils/categoryMap";
import { ClosetScanner } from "./ClosetScanner";

async function parseStepWithAI(step, userText, currentDraft, brands) {
  const prompts = {
    2: {
      system: "Extract gender from text. Return ONLY one of these exact strings: male female nonbinary undisclosed. No other text.",
      user: userText,
    },
    3: {
      system: `Extract body type and clothing sizes from text.
Return ONLY valid JSON (no markdown):
{
  "bodyType": "closest match: Athletic / V-shape | Rectangle | Oval / Round | Triangle | Tall & Slim | Stocky / Broad | Hourglass | Pear | Apple | Inverted Triangle | Petite | Tall | Plus size",
  "topSize": "one of: XXS XS S M L XL XXL 3XL 4XL or empty string",
  "bottomSize": "waist size like 28 30 32 34 or XS S M L etc or empty string",
  "shoeSize": "US shoe size number or empty string"
}
If not mentioned leave as empty string.`,
      user: userText,
    },
    4: {
      system: `Extract style preferences and brand preferences from text.
Return ONLY valid JSON (no markdown):
{
  "styles": ["pick 1-3 from: Minimalist, Casual chic, Streetwear, Business formal, Bohemian, Sporty, Romantic, Edgy, Classic, Eclectic"],
  "brands": ["pick any mentioned from: ${brands.join(", ")} — empty array if none"]
}`,
      user: userText,
    },
    5: {
      system: `Classify shopping budget into one category.
Return ONLY one of these exact strings:
budget mid-range premium luxury mixed
Rules: under $50/item = budget, $50-150 = mid-range,
$150-400 = premium, $400+ = luxury,
varies = mixed. No other text.`,
      user: userText,
    },
  };

  const prompt = prompts[step];
  if (!prompt) return null;

  try {
    const { callTextCompletion } = await import("../services/aiService");
    const text = await callTextCompletion(prompt.system, prompt.user, `Parse onboarding step ${step}`);
    const trimmed = String(text || "").trim();
    if (step === 2 || step === 5) return trimmed.toLowerCase();
    const jsonText = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(jsonText);
  } catch {
    if (step === 2) return "undisclosed";
    if (step === 3) {
      return {
        bodyType: currentDraft.bodyType || "",
        topSize: "",
        bottomSize: "",
        shoeSize: "",
      };
    }
    if (step === 4) return { styles: [], brands: [] };
    if (step === 5) return "mixed";
    return null;
  }
}

function normalizeGender(value) {
  const v = String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (v === "male" || v === "man" || v === "masculine") return "male";
  if (v === "female" || v === "woman" || v === "feminine") return "female";
  if (v === "nonbinary" || v === "non-binary" || v === "nb") return "nonbinary";
  return "undisclosed";
}

function normalizeBudget(value) {
  const v = String(value || "").trim().toLowerCase();
  return ["budget", "mid-range", "premium", "luxury", "mixed"].includes(v) ? v : "mixed";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function displayBodyType(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Not set";
  return value || "Not set";
}

const STYLE_EMOJI = {
  Minimalist: "🤍",
  "Casual chic": "👟",
  Streetwear: "🧢",
  "Business formal": "👔",
  Bohemian: "🌸",
  Sporty: "⚡",
  Romantic: "🌹",
  Edgy: "🖤",
  Classic: "🏛️",
  Eclectic: "🎨",
};

const BODY_HINT_CHIPS = ["Athletic", "Slim", "Average", "Broad", "Plus size"];
const SIZE_HINT_CHIPS_ROW1 = ["Size S", "Size M", "Size L", "Size XL"];
const SIZE_HINT_CHIPS_ROW2 = ["Shoe 8", "Shoe 9", "Shoe 10", "Shoe 11"];

const BUDGET_EMOJI = {
  budget: "💸",
  "mid-range": "🛍️",
  premium: "✨",
  luxury: "👑",
  mixed: "🔄",
};

function tileBase(selected, transition) {
  return {
    cursor: "pointer",
    borderRadius: 14,
    border: `2px solid ${selected ? COLORS.primary : COLORS.border}`,
    boxSizing: "border-box",
    transition,
    outline: "none",
  };
}

export function Onboarding({
  onboardingStep,
  draft,
  setDraft,
  goBackOnboarding,
  goNextOnboarding,
  uploadWardrobeItem,
  addItem,
  baseTransition,
  GENDER_OPTIONS,
  BUDGET_OPTIONS,
  STYLE_PREFS,
  BRANDS,
}) {
  const isWardrobeStep = onboardingStep === 7;
  const profileUiStep = onboardingStep <= 6 ? onboardingStep : null;
  const [wardrobePhase, setWardrobePhase] = useState("pick");
  const [wardrobePreview, setWardrobePreview] = useState("");
  const [wardrobeItem, setWardrobeItem] = useState(null);
  const [wardrobeError, setWardrobeError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [completedScans, setCompletedScans] = useState([]);

  const [answers, setAnswers] = useState(() => ({
    1: draft.name || "",
    2: "",
    3: "",
    4: "",
    5: "",
  }));
  const [selectedStyles, setSelectedStyles] = useState(() =>
    (draft.styles || []).filter((s) => STYLE_PREFS.includes(s)).slice(0, 3)
  );
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    if (onboardingStep === 8) goNextOnboarding();
  }, [goNextOnboarding, onboardingStep]);

  useEffect(() => {
    if (onboardingStep === 7) return;
    setCompletedScans((prev) => {
      prev.forEach((s) => {
        const u = s?.thumbnail;
        if (u && String(u).startsWith("blob:")) URL.revokeObjectURL(u);
      });
      return [];
    });
    setScannerOpen(false);
    setWardrobePhase("pick");
    setWardrobePreview("");
    setWardrobeItem(null);
    setWardrobeError("");
  }, [onboardingStep]);

  useEffect(() => {
    if (profileUiStep !== 4) return;
    setSelectedStyles((draft.styles || []).filter((s) => STYLE_PREFS.includes(s)).slice(0, 3));
  }, [profileUiStep, onboardingStep, draft.styles, STYLE_PREFS]);

  const genderMeta = useMemo(
    () => GENDER_OPTIONS.find((opt) => opt.value === draft.gender) || GENDER_OPTIONS.find((opt) => opt.value === "undisclosed"),
    [GENDER_OPTIONS, draft.gender]
  );

  const budgetMeta = useMemo(
    () => BUDGET_OPTIONS.find((opt) => opt.id === draft.budget),
    [BUDGET_OPTIONS, draft.budget]
  );

  const wardrobeTotalFound = completedScans.reduce((sum, s) => sum + s.itemCount, 0);

  const answer = profileUiStep != null ? answers[profileUiStep] || "" : "";

  const canContinue =
    profileUiStep == null || isWardrobeStep
      ? false
      : profileUiStep === 6 || parsing
        ? !parsing
        : profileUiStep === 1
          ? answer.trim().length > 0
          : profileUiStep === 4
            ? selectedStyles.length > 0
            : profileUiStep === 2 || profileUiStep === 5
              ? false
              : true;

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 16px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.surface2,
    color: COLORS.text,
    fontSize: "1rem",
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    lineHeight: 1.5,
    transition: baseTransition,
  };

  const setAnswer = (value) => {
    if (profileUiStep == null) return;
    setAnswers((prev) => ({ ...prev, [profileUiStep]: value }));
    if (profileUiStep === 1) setDraft((d) => ({ ...d, name: value }));
  };

  const appendBodyHint = (snippet) => {
    setAnswers((prev) => {
      const cur = prev[3] || "";
      const next = cur.trim() ? `${cur.trim()} ${snippet}` : snippet;
      return { ...prev, 3: next };
    });
  };

  const selectGender = (opt) => {
    setDraft((d) => ({
      ...d,
      gender: opt.value,
      bodyType: d.gender !== opt.value ? "" : d.bodyType,
    }));
    goNextOnboarding();
  };

  const toggleStyle = (name) => {
    setSelectedStyles((prev) => {
      if (prev.includes(name)) return prev.filter((x) => x !== name);
      if (prev.length >= 3) return prev;
      return [...prev, name];
    });
  };

  const selectBudget = (id) => {
    setDraft((d) => ({ ...d, budget: normalizeBudget(id) }));
    goNextOnboarding();
  };

  const continueStep = async () => {
    if (!canContinue) return;
    if (profileUiStep === 6) {
      goNextOnboarding();
      return;
    }
    if (profileUiStep === 2 || profileUiStep === 5) return;

    if (profileUiStep === 1) {
      setDraft((d) => ({ ...d, name: answer.trim() }));
      goNextOnboarding();
      return;
    }

    if (profileUiStep === 4) {
      setDraft((d) => ({
        ...d,
        styles: selectedStyles.filter((s) => STYLE_PREFS.includes(s)).slice(0, 3),
      }));
      goNextOnboarding();
      return;
    }

    if (profileUiStep === 3) {
      setParsing(true);
      try {
        const parsed = await parseStepWithAI(3, answer, draft, BRANDS);
        setDraft((d) => ({
          ...d,
          bodyType: String(parsed?.bodyType || ""),
          topSize: String(parsed?.topSize || ""),
          bottomSize: String(parsed?.bottomSize || ""),
          shoeSize: String(parsed?.shoeSize || ""),
        }));
        goNextOnboarding();
      } finally {
        setParsing(false);
      }
    }
  };

  const handleWardrobeFiles = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    if (!uploadWardrobeItem) {
      setWardrobeError("Upload is not available.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setWardrobeError("Please choose an image file.");
      return;
    }
    setWardrobeError("");
    const objectUrl = URL.createObjectURL(file);
    setWardrobePreview(objectUrl);
    setWardrobePhase("scanning");
    const item = await uploadWardrobeItem(file);
    URL.revokeObjectURL(objectUrl);
    if (!item) {
      setWardrobePreview("");
      setWardrobePhase("pick");
      setWardrobeError("We couldn't read that photo. Try another image.");
      return;
    }
    setWardrobeItem(item);
    setWardrobePreview(item.imagePreview || "");
    setWardrobePhase("result");
  };

  const editFromStart = () => {
    for (let i = 1; i < onboardingStep; i += 1) goBackOnboarding();
  };

  const flushCompletedClosetScansToWardrobe = () => {
    for (const scan of completedScans) {
      const items = buildWardrobeItems(scan.rows, scan.thumbnail || "", "");
      items.forEach((item) => addItem(item));
    }
    goNextOnboarding();
  };

  const stepChrome = {
    1: {
      icon: "👋",
      question: "What should we call you?",
      subtitle: "We'll personalize everything for you",
      dataUse: "We use your name in greetings and to make recommendations feel like they’re just for you.",
    },
    2: {
      icon: "🪞",
      question: "How do you identify?",
      subtitle: "Helps us find the right fit and styles",
      dataUse: "Sizing cues and product catalogs are tailored to how you shop and dress.",
    },
    3: {
      icon: "📏",
      question: "Describe your body and sizing",
      subtitle: "Type naturally — AI understands you",
      dataUse: "We turn this into structured sizes so outfit and product matches actually fit.",
    },
    4: {
      icon: "✨",
      question: "What's your personal style?",
      subtitle: "Pick up to 3 that feel like you",
      dataUse: "Your picks shape daily outfit ideas and what we surface from millions of items.",
    },
    5: {
      icon: "💳",
      question: "What's your shopping comfort zone?",
      subtitle: "We’ll match suggestions to your typical spend",
      dataUse: "Filters help us avoid surprises—only pieces in a range that works for you.",
    },
  };

  const sc = profileUiStep != null ? stepChrome[profileUiStep] : null;

  if (onboardingStep >= 8) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: COLORS.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Sans', sans-serif",
          color: COLORS.textMuted,
          fontSize: "0.95rem",
        }}
      >
        Saving your profile…
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'DM Sans', sans-serif",
        padding: "40px 20px 56px",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <style>{`
        @keyframes onboardingSlideIn {
          from { opacity: 0; transform: translateX(14px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "2.1rem",
            margin: "0 0 6px",
            letterSpacing: "0.02em",
            color: COLORS.text,
          }}
        >
          Fashion OS
        </h1>
        <p style={{ color: COLORS.textMuted, margin: "0 0 28px", fontSize: "0.98rem", lineHeight: 1.5 }}>
          {isWardrobeStep
            ? "One last step—scan your closet and we'll catalogue what we see automatically."
            : "A warm welcome—seven quick steps to a wardrobe that feels like you."}
        </p>

        <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <div
              key={n}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 4,
                background: n <= onboardingStep ? COLORS.primary : COLORS.surface2,
                transition: baseTransition,
              }}
            />
          ))}
        </div>

        <div
          key={onboardingStep}
          style={{
            background: COLORS.surface,
            borderRadius: 18,
            padding: isWardrobeStep ? 28 : profileUiStep != null && profileUiStep < 6 ? 28 : 26,
            border: `1px solid ${COLORS.border}`,
            boxShadow: "0 12px 40px rgba(26, 18, 8, 0.06)",
            animation: "onboardingSlideIn 280ms ease both",
          }}
        >
          {profileUiStep != null && profileUiStep < 6 && sc && (
            <>
              <div style={{ color: COLORS.textMuted, fontSize: "0.72rem", marginBottom: 16, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Step {profileUiStep} of 7
              </div>
              <div style={{ textAlign: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 48, lineHeight: 1.1 }} aria-hidden>
                  {sc.icon}
                </div>
              </div>
              <h2
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "1.65rem",
                  fontWeight: 600,
                  margin: "0 0 10px",
                  textAlign: "center",
                  lineHeight: 1.25,
                }}
              >
                {sc.question}
              </h2>
              <p style={{ color: COLORS.textMuted, fontSize: "0.92rem", margin: "0 auto 8px", textAlign: "center", maxWidth: 400, lineHeight: 1.5 }}>
                {sc.subtitle}
              </p>
              <p style={{ color: "#9a8a78", fontSize: "0.8rem", margin: "0 auto 22px", textAlign: "center", maxWidth: 420, lineHeight: 1.45, fontStyle: "italic" }}>
                {sc.dataUse}
              </p>
            </>
          )}

          {isWardrobeStep && (
            <>
              <div style={{ color: COLORS.textMuted, fontSize: "0.72rem", marginBottom: 16, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Step 7 of 7
              </div>
              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 48, lineHeight: 1.1 }} aria-hidden>
                  👗
                </div>
              </div>
              <h2
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "1.65rem",
                  fontWeight: 600,
                  margin: "0 0 8px",
                  textAlign: "center",
                  lineHeight: 1.25,
                }}
              >
                Now let&apos;s meet your wardrobe
              </h2>
              <p style={{ color: COLORS.textMuted, fontSize: "0.95rem", margin: "0 auto 18px", textAlign: "center", maxWidth: 420, lineHeight: 1.5 }}>
                Scan one or more photos of your closet.
                <br />
                We&apos;ll identify everything automatically.
              </p>

              <div style={{ marginBottom: 14 }}>
                {completedScans.length === 0 ? (
                  <p
                    style={{
                      color: COLORS.textMuted,
                      fontSize: "0.92rem",
                      textAlign: "center",
                      margin: "6px 0 6px",
                      padding: "20px 12px",
                      borderRadius: 12,
                      border: `1px dashed ${COLORS.border}`,
                      background: COLORS.surface2,
                      lineHeight: 1.5,
                    }}
                  >
                    No photos scanned yet
                  </p>
                ) : (
                  completedScans.map((scan, i) => (
                    <div
                      key={scan.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(196,129,58,0.3)",
                        background: "rgba(12,8,4,0.06)",
                        marginBottom: 10,
                      }}
                    >
                      {scan.thumbnail ? (
                        <img
                          src={scan.thumbnail}
                          alt={`Scan ${i + 1}`}
                          style={{
                            width: 56,
                            height: 56,
                            objectFit: "cover",
                            borderRadius: 8,
                            flexShrink: 0,
                          }}
                        />
                      ) : null}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>Scan {i + 1}</div>
                        <div style={{ color: "#c4813a", fontSize: "0.85rem", fontWeight: 500 }}>{scan.itemCount} items found</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                style={{
                  width: "100%",
                  padding: "14px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: COLORS.primary,
                  color: "#FFFFFF",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: baseTransition,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "1rem",
                }}
              >
                Scan a Photo
              </button>
              <button
                type="button"
                onClick={() => void goNextOnboarding()}
                style={{
                  width: "100%",
                  marginTop: 12,
                  padding: "10px 8px",
                  border: "none",
                  background: "none",
                  color: COLORS.textMuted,
                  fontSize: "0.93rem",
                  fontWeight: 500,
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Skip for now
              </button>

              {completedScans.length > 0 ? (
                <div style={{ marginTop: 22, textAlign: "center" }}>
                  <p style={{ color: "#c4813a", fontWeight: 700, margin: "0 0 16px", fontSize: "0.98rem" }}>
                    {wardrobeTotalFound} items found across {completedScans.length} scan{completedScans.length > 1 ? "s" : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => void flushCompletedClosetScansToWardrobe()}
                    style={{
                      width: "100%",
                      padding: "14px 20px",
                      borderRadius: 10,
                      border: "none",
                      background: COLORS.primary,
                      color: "#FFFFFF",
                      cursor: "pointer",
                      fontWeight: 600,
                      transition: baseTransition,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: "1rem",
                    }}
                  >
                    Continue →
                  </button>
                </div>
              ) : null}

              {wardrobeError ? (
                <p style={{ color: COLORS.danger, fontSize: "0.88rem", textAlign: "center", marginTop: 16, marginBottom: 0 }}>
                  {wardrobeError}
                </p>
              ) : null}
            </>
          )}

          {profileUiStep === 1 && (
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void continueStep();
              }}
              placeholder="Your first name"
              style={inputStyle}
              autoComplete="given-name"
            />
          )}

          {profileUiStep === 2 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {GENDER_OPTIONS.map((opt) => {
                const selected = draft.gender === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => selectGender(opt)}
                    style={{
                      ...tileBase(selected, baseTransition),
                      padding: "18px 14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      background: selected ? COLORS.primarySoft : COLORS.surface2,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <span style={{ fontSize: 36, lineHeight: 1 }}>{opt.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem", color: COLORS.text }}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {profileUiStep === 3 && (
            <>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="e.g. I'm 6'1, athletic build, broad shoulders. I wear size L tops, 32 pants, size 10.5 shoes"
                rows={4}
                style={{ ...inputStyle, resize: "vertical", minHeight: 120 }}
              />
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 8, letterSpacing: "0.04em" }}>Quick hints — tap to add</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  {BODY_HINT_CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => appendBodyHint(c)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.surface2,
                        color: COLORS.text,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                        transition: baseTransition,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  {SIZE_HINT_CHIPS_ROW1.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => appendBodyHint(c)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.surface2,
                        color: COLORS.text,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                        transition: baseTransition,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SIZE_HINT_CHIPS_ROW2.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => appendBodyHint(c)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.surface2,
                        color: COLORS.text,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                        transition: baseTransition,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {profileUiStep === 4 && (
            <div>
              <p style={{ textAlign: "center", fontSize: "0.78rem", color: COLORS.textMuted, margin: "0 0 14px" }}>
                {selectedStyles.length}/3 selected
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 10,
                }}
              >
                {STYLE_PREFS.map((name) => {
                  const selected = selectedStyles.includes(name);
                  const emoji = STYLE_EMOJI[name] || "✨";
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleStyle(name)}
                      style={{
                        ...tileBase(selected, baseTransition),
                        padding: "14px 12px",
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        textAlign: "left",
                        background: selected ? COLORS.primarySoft : COLORS.surface2,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      <span style={{ fontSize: 26, lineHeight: 1 }}>{emoji}</span>
                      <span style={{ fontWeight: 600, fontSize: "0.88rem", color: COLORS.text, lineHeight: 1.3 }}>{name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {profileUiStep === 5 && (
            <div style={{ display: "grid", gap: 10 }}>
              {BUDGET_OPTIONS.map((b) => {
                const selected = draft.budget === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => selectBudget(b.id)}
                    style={{
                      ...tileBase(selected, baseTransition),
                      padding: "16px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      textAlign: "left",
                      background: selected ? COLORS.primarySoft : COLORS.surface2,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <span style={{ fontSize: 30 }}>{BUDGET_EMOJI[b.id] || "◇"}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.98rem", color: COLORS.text, marginBottom: 2 }}>{b.label}</div>
                      <div style={{ fontSize: "0.82rem", color: COLORS.textMuted, lineHeight: 1.35 }}>{b.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {profileUiStep === 6 && (
            <>
              <div style={{ color: COLORS.textMuted, fontSize: "0.72rem", marginBottom: 12, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center" }}>
                Step 6 of 7
              </div>
              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 48, lineHeight: 1 }} aria-hidden>
                  🎉
                </div>
              </div>
              <h2
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "1.6rem",
                  fontWeight: 600,
                  margin: "0 0 8px",
                  textAlign: "center",
                }}
              >
                You&apos;re all set
              </h2>
              <p style={{ color: COLORS.textMuted, fontSize: "0.9rem", margin: "0 0 20px", textAlign: "center", lineHeight: 1.45 }}>
                Here&apos;s how we&apos;ll use your profile—tap enter when it looks right.
              </p>
              <div
                style={{
                  display: "grid",
                  gap: 14,
                  background: COLORS.surface2,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <SummaryRow label="Name" value={draft.name || "Not set"} />
                <SummaryRow label="Gender" value={`${genderMeta?.icon || "🤐"} ${genderMeta?.label || "Prefer not to say"}`} />
                <SummaryRow label="Body type" value={displayBodyType(draft.bodyType)} />
                <SummaryRow
                  label="Sizes"
                  value={`Top ${draft.topSize || "—"}, bottom ${draft.bottomSize || "—"}, shoe ${draft.shoeSize || "—"}`}
                />
                <SummaryRow label="Styles" value={draft.styles?.length ? draft.styles.join(", ") : "Not set"} />
                <SummaryRow label="Brands" value={draft.brands?.length ? draft.brands.join(", ") : "Not set"} />
                <SummaryRow label="Budget" value={budgetMeta ? `${budgetMeta.label} — ${budgetMeta.sub}` : draft.budget || "Not set"} />
              </div>
            </>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 28,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {isWardrobeStep ? (
              <>
                <button
                  type="button"
                  onClick={goBackOnboarding}
                  disabled={onboardingStep === 1 || scannerOpen}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 10,
                    border: `1px solid ${COLORS.border}`,
                    background: "transparent",
                    color: onboardingStep === 1 || scannerOpen ? COLORS.textMuted : COLORS.text,
                    cursor: onboardingStep === 1 || scannerOpen ? "default" : "pointer",
                    transition: baseTransition,
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  Back
                </button>
                <span style={{ flex: 1 }} />
              </>
            ) : profileUiStep === 6 ? (
              <>
                <button
                  type="button"
                  onClick={editFromStart}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 10,
                    border: `1px solid ${COLORS.border}`,
                    background: "transparent",
                    color: COLORS.text,
                    cursor: "pointer",
                    transition: baseTransition,
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  ← Edit
                </button>
                <button
                  type="button"
                  onClick={() => void continueStep()}
                  disabled={!canContinue}
                  style={{
                    padding: "12px 24px",
                    borderRadius: 10,
                    border: "none",
                    background: canContinue ? COLORS.primary : COLORS.surface2,
                    color: canContinue ? "#FFFFFF" : COLORS.textMuted,
                    cursor: canContinue ? "pointer" : "default",
                    fontWeight: 600,
                    transition: baseTransition,
                    fontFamily: "'DM Sans', sans-serif",
                    marginLeft: "auto",
                  }}
                >
                  {parsing ? "Parsing…" : "Continue to wardrobe →"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={goBackOnboarding}
                  disabled={onboardingStep === 1 || parsing}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 10,
                    border: `1px solid ${COLORS.border}`,
                    background: "transparent",
                    color: onboardingStep === 1 || parsing ? COLORS.textMuted : COLORS.text,
                    cursor: onboardingStep === 1 || parsing ? "default" : "pointer",
                    transition: baseTransition,
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  Back
                </button>
                {profileUiStep === 2 || profileUiStep === 5 ? (
                  <span style={{ flex: 1 }} />
                ) : (
                  <button
                    type="button"
                    onClick={() => void continueStep()}
                    disabled={!canContinue}
                    style={{
                      padding: "12px 24px",
                      borderRadius: 10,
                      border: "none",
                      background: canContinue ? COLORS.primary : COLORS.surface2,
                      color: canContinue ? "#FFFFFF" : COLORS.textMuted,
                      cursor: canContinue ? "pointer" : "default",
                      fontWeight: 600,
                      transition: baseTransition,
                      fontFamily: "'DM Sans', sans-serif",
                      marginLeft: "auto",
                    }}
                  >
                    {parsing ? "Parsing…" : "Continue"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <ClosetScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanComplete={(result) => {
          const totalItems = result.rows.filter((r) => r.included).reduce((sum, r) => sum + r.count, 0);
          setCompletedScans((prev) => [
            ...prev,
            {
              id: Date.now(),
              thumbnail: result.thumbnail,
              itemCount: totalItems,
              rows: result.rows,
            },
          ]);
          setScannerOpen(false);
        }}
      />
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ color: COLORS.textMuted, fontSize: "0.74rem", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color: COLORS.text, fontSize: "0.96rem", lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}
