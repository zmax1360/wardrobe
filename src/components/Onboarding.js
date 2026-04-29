import { useEffect, useMemo, useState } from "react";

import { COLORS } from "../constants/colors";

async function parseStepWithAI(step, userText, currentDraft) {
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
  "brands": ["pick any mentioned from: Zara, H&M, ASOS, Uniqlo, Mango, COS, Nike, Levi's, Nordstrom, Net-a-Porter — empty array if none"]
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

export function Onboarding({
  onboardingStep,
  draft,
  setDraft,
  goBackOnboarding,
  goNextOnboarding,
  baseTransition,
  GENDER_OPTIONS,
  BUDGET_OPTIONS,
  STYLE_PREFS,
  BRANDS,
}) {
  const activeStep = Math.min(onboardingStep, 6);
  const [answers, setAnswers] = useState(() => ({
    1: draft.name || "",
    2: "",
    3: "",
    4: "",
    5: "",
  }));
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    if (onboardingStep === 7) goNextOnboarding();
  }, [goNextOnboarding, onboardingStep]);

  const genderMeta = useMemo(
    () => GENDER_OPTIONS.find((opt) => opt.value === draft.gender) || GENDER_OPTIONS.find((opt) => opt.value === "undisclosed"),
    [GENDER_OPTIONS, draft.gender]
  );

  const budgetMeta = useMemo(
    () => BUDGET_OPTIONS.find((opt) => opt.id === draft.budget),
    [BUDGET_OPTIONS, draft.budget]
  );

  const stepConfig = {
    1: {
      question: "What should we call you?",
      input: "input",
      placeholder: "Alex",
    },
    2: {
      question: "How do you identify? (optional)",
      input: "input",
      placeholder: "e.g. male, female, non-binary, prefer not to say",
    },
    3: {
      question: "Describe your body and size",
      input: "textarea",
      placeholder: "e.g. I'm 6'1, athletic build, broad shoulders.\nI wear size L tops, 32 pants, size 10.5 shoes",
    },
    4: {
      question: "How would you describe your personal style?",
      input: "textarea",
      placeholder: "e.g. I love clean minimal looks, mostly neutrals,\noccasional streetwear. Think Uniqlo meets Nike",
    },
    5: {
      question: "What's your typical clothing budget?",
      input: "input",
      placeholder: "e.g. $50-100 per item, or around $200/month",
    },
  };

  const current = stepConfig[activeStep];
  const answer = answers[activeStep] || "";
  const canContinue = activeStep === 6 || parsing ? !parsing : activeStep === 1 ? answer.trim().length > 0 : true;

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 16px",
    borderRadius: 10,
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
    setAnswers((prev) => ({ ...prev, [activeStep]: value }));
    if (activeStep === 1) setDraft((d) => ({ ...d, name: value }));
  };

  const continueStep = async () => {
    if (!canContinue) return;
    if (activeStep === 6) {
      goNextOnboarding();
      return;
    }

    setParsing(true);
    try {
      if (activeStep === 1) {
        setDraft((d) => ({ ...d, name: answer.trim() }));
      }

      if (activeStep === 2) {
        const parsed = await parseStepWithAI(2, answer, draft);
        setDraft((d) => ({
          ...d,
          gender: normalizeGender(parsed),
          bodyType: d.gender !== normalizeGender(parsed) ? "" : d.bodyType,
        }));
      }

      if (activeStep === 3) {
        const parsed = await parseStepWithAI(3, answer, draft);
        setDraft((d) => ({
          ...d,
          bodyType: String(parsed?.bodyType || ""),
          topSize: String(parsed?.topSize || ""),
          bottomSize: String(parsed?.bottomSize || ""),
          shoeSize: String(parsed?.shoeSize || ""),
        }));
      }

      if (activeStep === 4) {
        const parsed = await parseStepWithAI(4, answer, draft);
        const styles = asArray(parsed?.styles).map(String).filter((s) => STYLE_PREFS.includes(s)).slice(0, 3);
        const brands = asArray(parsed?.brands).map(String).filter((b) => BRANDS.includes(b));
        setDraft((d) => ({ ...d, styles, brands }));
      }

      if (activeStep === 5) {
        const parsed = await parseStepWithAI(5, answer, draft);
        setDraft((d) => ({ ...d, budget: normalizeBudget(parsed) }));
      }

      goNextOnboarding();
    } finally {
      setParsing(false);
    }
  };

  const editFromStart = () => {
    for (let i = 1; i < onboardingStep; i += 1) goBackOnboarding();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'DM Sans', sans-serif",
        padding: "48px 24px",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <style>{`
        @keyframes onboardingSlideIn {
          from { opacity: 0; transform: translateX(18px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "2.25rem",
            margin: "0 0 8px",
            letterSpacing: "0.02em",
          }}
        >
          Fashion OS
        </h1>
        <p style={{ color: COLORS.textMuted, margin: "0 0 32px", fontSize: "0.95rem" }}>
          Tell us about your style in six quick messages.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: n <= activeStep ? COLORS.primary : COLORS.surface2,
                transition: baseTransition,
              }}
            />
          ))}
        </div>

        <div
          key={activeStep}
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 28,
            border: `1px solid ${COLORS.border}`,
            animation: "onboardingSlideIn 260ms ease both",
          }}
        >
          {activeStep < 6 ? (
            <>
              <div style={{ color: COLORS.textMuted, fontSize: "0.78rem", marginBottom: 10 }}>
                Step {activeStep} of 6
              </div>
              <label
                style={{
                  display: "block",
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "1.55rem",
                  fontWeight: 600,
                  marginBottom: 18,
                }}
              >
                {current.question}
              </label>
              {current.input === "textarea" ? (
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={current.placeholder}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              ) : (
                <input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void continueStep();
                  }}
                  placeholder={current.placeholder}
                  style={inputStyle}
                />
              )}
            </>
          ) : (
            <>
              <div style={{ color: COLORS.textMuted, fontSize: "0.78rem", marginBottom: 10 }}>
                Step 6 of 6
              </div>
              <h2
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "1.65rem",
                  fontWeight: 600,
                  margin: "0 0 18px",
                }}
              >
                Confirm your profile
              </h2>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  background: COLORS.surface2,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  padding: 18,
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

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28, gap: 12 }}>
            {activeStep === 6 ? (
              <button
                type="button"
                onClick={editFromStart}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: "transparent",
                  color: COLORS.text,
                  cursor: "pointer",
                  transition: baseTransition,
                }}
              >
                ← Edit
              </button>
            ) : (
              <button
                type="button"
                onClick={goBackOnboarding}
                disabled={onboardingStep === 1 || parsing}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: "transparent",
                  color: onboardingStep === 1 || parsing ? COLORS.textMuted : COLORS.text,
                  cursor: onboardingStep === 1 || parsing ? "default" : "pointer",
                  transition: baseTransition,
                }}
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => void continueStep()}
              disabled={!canContinue}
              style={{
                padding: "12px 24px",
                borderRadius: 8,
                border: "none",
                background: canContinue ? COLORS.primary : COLORS.surface2,
                color: canContinue ? "#FFFFFF" : COLORS.textMuted,
                cursor: canContinue ? "pointer" : "default",
                fontWeight: 600,
                transition: baseTransition,
              }}
            >
              {activeStep === 6 ? "Looks good → Enter Fashion OS" : parsing ? "Parsing…" : "Continue"}
            </button>
          </div>
        </div>
      </div>
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
