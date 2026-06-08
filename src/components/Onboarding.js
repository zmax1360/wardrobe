import { useEffect, useMemo, useState } from "react";

import { COLORS } from "../constants/colors";
import { generateStarterWardrobe } from "../services/aiService";
import { buildWardrobeItems } from "../utils/categoryMap";
import { ClosetScanner } from "./ClosetScanner";
import { Emoji } from "./Emoji";

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

const WARDROBE_TILES = [
  // Tops — unisex
  { id: "t-shirt", label: "T-Shirts", category: "Tops", color: "white", colors: ["white"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "button-shirt", label: "Button-up Shirts", category: "Tops", color: "white", colors: ["white", "blue"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "sweater", label: "Sweaters", category: "Tops", color: "cream", colors: ["cream"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "hoodie", label: "Hoodies", category: "Tops", color: "grey", colors: ["grey"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "tank", label: "Tank Tops", category: "Tops", color: "white", colors: ["white"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  // Tops — female leaning
  { id: "blouse", label: "Blouses", category: "Tops", color: "white", colors: ["white"], gender: ["female", "nonbinary", "undisclosed"] },
  { id: "crop-top", label: "Crop Tops", category: "Tops", color: "white", colors: ["white"], gender: ["female", "nonbinary", "undisclosed"] },
  // Bottoms — unisex
  { id: "jeans", label: "Jeans", category: "Bottoms", color: "blue", colors: ["light blue"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "trousers", label: "Trousers", category: "Bottoms", color: "black", colors: ["black"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "chinos", label: "Chinos", category: "Bottoms", color: "beige", colors: ["beige"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "shorts", label: "Shorts", category: "Bottoms", color: "navy", colors: ["navy"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "leggings", label: "Leggings", category: "Bottoms", color: "black", colors: ["black"], gender: ["female", "nonbinary", "undisclosed"] },
  // Bottoms — female leaning
  { id: "skirt", label: "Skirts", category: "Bottoms", color: "black", colors: ["black"], gender: ["female", "nonbinary", "undisclosed"] },
  { id: "mini-skirt", label: "Mini Skirts", category: "Bottoms", color: "black", colors: ["black"], gender: ["female", "nonbinary", "undisclosed"] },
  // Dresses — female leaning
  { id: "dress", label: "Dresses", category: "Dresses", color: "black", colors: ["black"], gender: ["female", "nonbinary", "undisclosed"] },
  { id: "maxi-dress", label: "Maxi Dresses", category: "Dresses", color: "floral", colors: ["white", "floral"], gender: ["female", "nonbinary", "undisclosed"] },
  // Outerwear — unisex
  { id: "jacket", label: "Jacket", category: "Outerwear", color: "navy", colors: ["navy"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "coat", label: "Coat", category: "Outerwear", color: "camel", colors: ["camel"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "blazer", label: "Blazer", category: "Outerwear", color: "grey", colors: ["grey"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  // Shoes — unisex
  { id: "sneakers", label: "Sneakers", category: "Shoes", color: "white", colors: ["white"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "boots", label: "Boots", category: "Shoes", color: "brown", colors: ["brown"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "loafers", label: "Loafers", category: "Shoes", color: "black", colors: ["black"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "sandals", label: "Sandals", category: "Shoes", color: "tan", colors: ["tan"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  // Shoes — female leaning
  { id: "heels", label: "Heels", category: "Shoes", color: "black", colors: ["black"], gender: ["female", "nonbinary", "undisclosed"] },
  { id: "ballet-flats", label: "Ballet Flats", category: "Shoes", color: "black", colors: ["black"], gender: ["female", "nonbinary", "undisclosed"] },
  // Accessories — unisex
  { id: "bag", label: "Bags", category: "Accessories", color: "black", colors: ["black"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "scarf", label: "Scarves", category: "Accessories", color: "grey", colors: ["grey"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "belt", label: "Belts", category: "Accessories", color: "black", colors: ["black"], gender: ["male", "female", "nonbinary", "undisclosed"] },
  { id: "watch", label: "Watches", category: "Accessories", color: "silver", colors: ["silver"], gender: ["male", "female", "nonbinary", "undisclosed"] },
];

const COLOR_PALETTE = [
  { id: "black", label: "Black", hex: "#1a1a1a" },
  { id: "white", label: "White", hex: "#f5f5f5" },
  { id: "navy", label: "Navy", hex: "#1a237e" },
  { id: "grey", label: "Grey", hex: "#9e9e9e" },
  { id: "beige", label: "Beige", hex: "#d4b896" },
  { id: "camel", label: "Camel", hex: "#c19a6b" },
  { id: "brown", label: "Brown", hex: "#4e342e" },
  { id: "cream", label: "Cream", hex: "#fff8e1" },
  { id: "red", label: "Red", hex: "#c62828" },
  { id: "burgundy", label: "Burgundy", hex: "#6a1b1b" },
  { id: "pink", label: "Pink", hex: "#f48fb1" },
  { id: "blue", label: "Blue", hex: "#1565c0" },
  { id: "light blue", label: "Light Blue", hex: "#90caf9" },
  { id: "green", label: "Green", hex: "#2e7d32" },
  { id: "olive", label: "Olive", hex: "#827717" },
  { id: "yellow", label: "Yellow", hex: "#f9a825" },
  { id: "orange", label: "Orange", hex: "#e65100" },
  { id: "purple", label: "Purple", hex: "#6a1b9a" },
  { id: "multicolor", label: "Prints", hex: "linear-gradient(135deg, #f48fb1, #90caf9, #a5d6a7)" },
];

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
  const [selectedTiles, setSelectedTiles] = useState(new Set());
  const [selectedColors, setSelectedColors] = useState(new Set());
  const [showAllTiles, setShowAllTiles] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState("");

  const toggleColor = (id) => {
    setSelectedColors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTile = (id) => {
    setSelectedTiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const flushTilesToWardrobe = async () => {
    setGenerating(true);
    setGenerateProgress("Analysing your style...");

    const profile = {
      gender: draft?.gender || "undisclosed",
      styles: draft?.styles || [],
      colorPreferences: [...selectedColors],
      bodyType: draft?.bodyType || "",
      climate: "cold winters, warm summers",
      occasions: draft?.occasions || [],
      name: draft?.name || "",
    };

    if (selectedColors.size > 0) {
      setDraft((d) => ({ ...d, colorPreferences: [...selectedColors] }));
    }

    try {
      setGenerateProgress("Building your wardrobe...");
      const firstBatch = await generateStarterWardrobe(profile, 20, 0);
      firstBatch.forEach((item) => addItem(item));
      setGenerateProgress("Almost there...");

      goNextOnboarding();
      setGenerating(false);

      setTimeout(async () => {
        try {
          const secondBatch = await generateStarterWardrobe(profile, 30, 20);
          secondBatch.forEach((item) => addItem(item));
        } catch (e) {
          console.warn("Background wardrobe generation failed:", e);
        }
      }, 500);
    } catch (err) {
      console.error("Wardrobe generation failed:", err);
      setGenerating(false);
      const fallbackItems = WARDROBE_TILES
        .filter((t) => selectedTiles.has(t.id))
        .map((t) => ({
          id: `tile-${t.id}-${Date.now()}`,
          name: t.label,
          category: t.category,
          color: t.color,
          colors: t.colors,
          style: "casual",
          source: "onboarding_tile",
          tags: ["onboarding"],
          laundryStatus: "clean",
          timesWorn: 0,
          season: "all",
          description: "",
          purchasePrice: "",
          imagePreview: "",
          imageFilename: "",
        }));
      fallbackItems.forEach((item) => addItem(item));
      goNextOnboarding();
    }
  };

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
    fontFamily: "var(--font-sans)",
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
          fontFamily: "var(--font-sans)",
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
        fontFamily: "var(--font-sans)",
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
            fontFamily: "var(--font-serif)",
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
                  fontFamily: "var(--font-serif)",
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

          {isWardrobeStep && (() => {
            const userGender = draft?.gender || "undisclosed";
            const visibleTiles = showAllTiles
              ? WARDROBE_TILES
              : WARDROBE_TILES.filter((t) => t.gender.includes(userGender));

            return (
            <>
              <div style={{ color: COLORS.textMuted, fontSize: "0.72rem", marginBottom: 16, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Step 7 of 7
              </div>
              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 48, lineHeight: 1.1 }} aria-hidden>👗</div>
              </div>
              <h2 style={{
                fontFamily: "var(--font-serif)",
                fontSize: "1.55rem",
                fontWeight: 600,
                margin: "0 0 6px",
                textAlign: "center",
                lineHeight: 1.25,
              }}>
                What do you own?
              </h2>
              <p style={{ color: COLORS.textMuted, fontSize: "0.88rem", margin: "0 auto 20px", textAlign: "center", maxWidth: 380, lineHeight: 1.5 }}>
                Tap everything you have. We'll build your first outfit suggestion instantly.
              </p>

              {/* Tile grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
                marginBottom: 20,
                maxHeight: 340,
                overflowY: "auto",
                paddingRight: 2,
              }}>
                {visibleTiles.map((tile) => {
                  const selected = selectedTiles.has(tile.id);
                  return (
                    <button
                      key={tile.id}
                      type="button"
                      onClick={() => toggleTile(tile.id)}
                      style={{
                        padding: "12px 8px",
                        borderRadius: 12,
                        border: `2px solid ${selected ? COLORS.primary : COLORS.border}`,
                        background: selected ? COLORS.primarySoft : COLORS.surface2,
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                        transition: "all 0.15s ease",
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      <Emoji emoji={tile.emoji} size={26} />
                      <span style={{ fontSize: "0.72rem", fontWeight: 600, color: COLORS.text, textAlign: "center", lineHeight: 1.2 }}>
                        {tile.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setShowAllTiles((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  color: COLORS.primary,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                  marginBottom: 8,
                  fontFamily: "var(--font-sans)",
                }}
              >
                {showAllTiles ? "Show fewer items" : "Show all clothing types"}
              </button>

              {/* Selected count */}
              <p style={{ textAlign: "center", fontSize: "0.82rem", color: COLORS.textMuted, margin: "0 0 16px" }}>
                {selectedTiles.size > 0
                  ? `${selectedTiles.size} item type${selectedTiles.size > 1 ? "s" : ""} selected`
                  : "Tap items you own above"}
              </p>

              {/* Color preferences */}
              <div style={{ marginBottom: 16 }}>
                <p style={{
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: COLORS.text,
                  margin: "0 0 10px",
                  textAlign: "center",
                }}>
                  What colors do you usually wear?
                </p>
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  justifyContent: "center",
                }}>
                  {COLOR_PALETTE.map((c) => {
                    const selected = selectedColors.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleColor(c.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "5px 10px",
                          borderRadius: 99,
                          border: `1.5px solid ${selected ? COLORS.primary : COLORS.border}`,
                          background: selected ? "rgba(196,129,58,0.08)" : "transparent",
                          cursor: "pointer",
                          fontFamily: "var(--font-sans)",
                          fontSize: "0.78rem",
                          fontWeight: selected ? 600 : 400,
                          color: COLORS.text,
                        }}
                      >
                        <span style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: c.hex,
                          flexShrink: 0,
                          border: "0.5px solid rgba(0,0,0,0.15)",
                        }} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Primary CTA */}
              <button
                type="button"
                onClick={!generating && selectedColors.size > 0 ? flushTilesToWardrobe : undefined}
                disabled={generating || selectedColors.size === 0}
                style={{
                  width: "100%",
                  padding: "14px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: selectedColors.size > 0 && !generating ? COLORS.primary : COLORS.surface2,
                  color: selectedColors.size > 0 && !generating ? "#FFFFFF" : COLORS.textMuted,
                  cursor: selectedColors.size > 0 && !generating ? "pointer" : "default",
                  fontWeight: 600,
                  fontFamily: "var(--font-sans)",
                  fontSize: "1rem",
                  marginBottom: 10,
                  transition: "all 0.15s ease",
                }}
              >
                {generating
                  ? generateProgress
                  : selectedColors.size > 0
                    ? "Build my wardrobe →"
                    : "Pick your colors to continue"}
              </button>

              {generating && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 12,
                  fontSize: "0.82rem",
                  color: COLORS.textMuted,
                }}>
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: "2px solid rgba(196,129,58,0.2)",
                    borderTopColor: "#c4813a",
                    animation: "spin 0.8s linear infinite",
                    flexShrink: 0,
                  }} />
                  <span>AI is personalising your wardrobe</span>
                </div>
              )}

              {/* Optional scan link */}
              <p style={{ textAlign: "center", fontSize: "0.82rem", color: COLORS.textMuted, margin: 0 }}>
                Have photos?{" "}
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: COLORS.primary,
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    padding: 0,
                    fontFamily: "var(--font-sans)",
                    textDecoration: "underline",
                  }}
                >
                  Scan your closet instead
                </button>
              </p>

              {/* Skip */}
              <button
                type="button"
                onClick={() => void goNextOnboarding()}
                style={{
                  width: "100%",
                  marginTop: 14,
                  padding: "8px",
                  border: "none",
                  background: "none",
                  color: COLORS.textMuted,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  textDecoration: "underline",
                }}
              >
                Skip for now
              </button>

              {wardrobeError && (
                <p style={{ color: COLORS.danger, fontSize: "0.88rem", textAlign: "center", marginTop: 12 }}>
                  {wardrobeError}
                </p>
              )}
            </>
            );
          })()}

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
                      fontFamily: "var(--font-sans)",
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
                        fontFamily: "var(--font-sans)",
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
                        fontFamily: "var(--font-sans)",
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
                        fontFamily: "var(--font-sans)",
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
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      <Emoji emoji={emoji} size={26} />
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
                      fontFamily: "var(--font-sans)",
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
                  fontFamily: "var(--font-serif)",
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
                    fontFamily: "var(--font-sans)",
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
                    fontFamily: "var(--font-sans)",
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
                    fontFamily: "var(--font-sans)",
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
                    fontFamily: "var(--font-sans)",
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
                      fontFamily: "var(--font-sans)",
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
