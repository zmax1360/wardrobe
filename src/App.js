import { COLORS } from "./constants/colors";
import { baseTransition } from "./constants/theme";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";

import { auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";

import { radius } from "./styles/theme";
import { type } from "./styles/typography";
import { ui } from "./styles/ui";
import { mergeStyles, focusInputVisual, blurInputVisual } from "./utils/styleUtils";
import {
  bodyTypesForGender,
  topSizesForGender,
  bottomSizesForGender,
  shoeSizesForGender,
  loadJson,
  todayYmdLocal,
  mediaTypeForFile,
  fileToBase64,
  fileToDataUrl,
  compressImage,
  defaultProfile,
} from "./utils/helpers";
import {
  CAL_OCCASION_TYPES,
  CAL_DRESS_CODES,
  formatDisplayDate,
  daysRelativeLabel,
  emptyEventForm,
} from "./utils/dateHelpers";
import {
  buildProfileSummary,
  buildCleanWardrobeList,
  buildFullWardrobeList,
  parseDesignerOutfitsJson,
  parseEvaluatorJson,
  parseGapAnalysisGaps,
  parsePlannerResponse,
  parseShopperRecommendations,
  normalizeEvaluatorResult,
} from "./services/parsers";
import {
  callShoppingAssistant,
  evaluateOutfitWithVision,
} from "./services/anthropicExtended";
import {
  ANTHROPIC_URL,
  CLAUDE_MODEL,
  OPENAI_VISION_URL,
  OPENAI_VISION_MODEL,
  resolveVisionCredentials,
  parseCatalogJson,
} from "./services/aiService";
import { runAgent } from "./agents/agentOrchestrator";
import { useAgentActivity } from "./hooks/useAgentActivity";
import { useAgentInsights } from "./hooks/useAgentInsights";
import { useWardrobe } from "./hooks/useWardrobe";
import { AppLayout, AppLayoutSidebarDataProvider } from "./layout/AppLayout";
import { WardrobeScreen } from "./screens/WardrobeScreen";
import { PlannerScreen } from "./screens/PlannerScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { ShopperScreen } from "./screens/ShopperScreen";
import { DesignerScreen } from "./screens/DesignerScreen";
import { EvaluatorScreen } from "./screens/EvaluatorScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { GapAnalysisScreen } from "./screens/GapAnalysisScreen";
import { WardrobeEquityScreen } from "./screens/WardrobeEquityScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { AgentPanel } from "./components/AgentPanel";
import { Onboarding } from "./components/Onboarding";
import {
  getTimesWorn,
  getPurchasePriceNum,
} from "./utils/wardrobeFinance";
// (kept minimal) apiBase still used elsewhere in the app
import { placeholderRemoveBackground } from "./services/backgroundRemoval";

const STORAGE_PROFILE = "fos_profile";
const STORAGE_EVENTS = "fos_events";
const STORAGE_WISHLIST = "fos_wishlist";
const STORAGE_GAP_ANALYSIS_LAST = "fos_gap_analysis_last";

const GENDER_OPTIONS = [
  { value: "male", icon: "👨", label: "Male" },
  { value: "female", icon: "👩", label: "Female" },
  { value: "nonbinary", icon: "🧑", label: "Non-binary" },
  { value: "undisclosed", icon: "🤐", label: "Prefer not to say" },
];

const BUDGET_OPTIONS = [
  { id: "budget", label: "Budget", sub: "Mostly under $50 per piece" },
  { id: "mid-range", label: "Mid-range", sub: "$50 – $150 typical" },
  { id: "premium", label: "Premium", sub: "$150 – $400" },
  { id: "luxury", label: "Luxury", sub: "$400+" },
  { id: "mixed", label: "Mixed", sub: "Varies by category" },
];

const STYLE_PREFS = [
  "Minimalist",
  "Casual chic",
  "Streetwear",
  "Business formal",
  "Bohemian",
  "Sporty",
  "Romantic",
  "Edgy",
  "Classic",
  "Eclectic",
];

const BRANDS = [
  "Zara",
  "H&M",
  "ASOS",
  "Uniqlo",
  "Mango",
  "COS",
  "Nike",
  "Levi's",
  "Nordstrom",
  "Net-a-Porter",
];

const CATEGORIES = [
  "Tops",
  "Bottoms",
  "Outerwear",
  "Shoes",
  "Accessories",
  "Dresses",
  "Activewear",
  "Formal",
  "Bags",
];

const CATALOG_SYSTEM =
  "You are a fashion cataloger for a personal wardrobe app. Analyze the clothing/accessories in the image and return a single JSON object with keys: " +
  "name, category (one of: Tops, Bottoms, Outerwear, Shoes, Accessories, Dresses, Activewear, Formal, Bags), color, style, season, tags (array of strings), material, description. " +
  "Output rules: respond with ONLY raw JSON — no markdown fences, no code blocks, no explanation, apology, or other prose. Start with { and end with }. " +
  "If the image shows wearable items or bags, always produce your best-effort JSON; do not refuse or say you cannot.";

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(undefined);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [draft, setDraft] = useState(defaultProfile);

  /** Default landing: Home / Dashboard (`currentScreen` equivalent). */
  const [activeNav, setActiveNav] = useState("dashboard");
  const { wardrobe, setWardrobe, addItem, updateItem, removeItem } = useWardrobe(hydrated, firebaseUser);
  const [events, setEvents] = useState(() => {
    const e = loadJson(STORAGE_EVENTS, []);
    return Array.isArray(e) ? e : [];
  });
  const [catFilter, setCatFilter] = useState("All");
  const [laundryFilter, setLaundryFilter] = useState("All");
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    color: "",
    purchasePrice: "",
    purchaseDate: "",
    timesWorn: "",
    expectedLifespan: "",
  });

  const {
    agentActivity,
    startAgentRun,
    finishAgentRun,
    failAgentRun,
    formatDuration,
    getAgentStatusTone,
  } = useAgentActivity(activeNav);

  const [agentPanelOpen, setAgentPanelOpen] = useState(() => {
    try {
      const raw = localStorage.getItem("fos_agent_panel_open");
      if (raw == null) return false;
      return JSON.parse(raw) === true;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("fos_agent_panel_open", JSON.stringify(agentPanelOpen));
    } catch {
      /* ignore quota */
    }
  }, [agentPanelOpen]);

  const [agentInsights, setAgentInsights] = useAgentInsights();

  const fileRef = useRef(null);
  const fontsLinked = useRef(false);

  useEffect(() => {
    if (fontsLinked.current) return;
    fontsLinked.current = true;
    const href =
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap";
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setFirebaseUser(u ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    const p = loadJson(STORAGE_PROFILE, null);
    setProfile(p);
    setDraft(p ? { ...defaultProfile(), ...p } : defaultProfile());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_EVENTS, JSON.stringify(events));
  }, [events, hydrated]);

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = err?.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return;
      }
      const googleMsgs = {
        "auth/operation-not-allowed":
          "Google sign-in is not enabled. In Firebase Console → Authentication → Sign-in method, turn on Google.",
        "auth/unauthorized-domain":
          "This site’s domain is not allowed. In Firebase Console → Authentication → Settings → Authorized domains, add localhost (and 127.0.0.1 if you use it).",
        "auth/popup-blocked":
          "The browser blocked the sign-in popup. Allow popups for this site and try again.",
        "auth/network-request-failed":
          "Network error. Check your connection and try again.",
        "auth/account-exists-with-different-credential":
          "An account already exists with this email using another sign-in method. Sign in with email/password first, or use the same method you used before.",
        "auth/invalid-api-key":
          "Invalid Firebase config. Check src/firebase.js matches your Firebase project (Project settings → Your apps).",
        "auth/configuration-not-found":
          "Firebase Authentication isn’t set up for this project yet. In Firebase Console open Build → Authentication, click Get started, then enable Google (and Email/Password) under Sign-in method.",
      };
      setAuthError(
        googleMsgs[code] ||
          (code
            ? `Google sign-in failed (${code}). Check the browser console or Firebase Authentication settings.`
            : "Google sign-in failed. Please try again.")
      );
      if (process.env.NODE_ENV === "development" && err) {
        console.error("[Google sign-in]", code, err.message || err);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      if (authMode === "signup") {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (err) {
      const msgs = {
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/configuration-not-found":
          "Firebase Authentication isn’t set up for this project yet. In Firebase Console open Build → Authentication, click Get started, then enable Email/Password (and Google) under Sign-in method.",
      };
      setAuthError(msgs[err?.code] || "Something went wrong. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const onboardingDone = Boolean(profile && profile.name);

  const persistProfile = useCallback((next) => {
    setProfile(next);
    localStorage.setItem(STORAGE_PROFILE, JSON.stringify(next));
  }, []);

  const goNextOnboarding = () => {
    if (onboardingStep < 7) setOnboardingStep((s) => s + 1);
    else {
      const saved = { ...draft };
      persistProfile(saved);
    }
  };

  const goBackOnboarding = () => {
    if (onboardingStep > 1) setOnboardingStep((s) => s - 1);
  };

  const canAdvance = useMemo(() => {
    switch (onboardingStep) {
      case 1:
        return Boolean(draft.name && draft.name.trim());
      case 2:
        return draft.gender !== "";
      case 3:
        return Array.isArray(draft.bodyType)
          ? draft.bodyType.length > 0
          : Boolean(draft.bodyType);
      case 4:
        return Boolean(draft.budget);
      case 5:
        return draft.styles.length > 0;
      case 6:
        return true;
      case 7:
        return Boolean(draft.topSize && draft.bottomSize && draft.shoeSize);
      default:
        return false;
    }
  }, [onboardingStep, draft]);

  const onboardingBodyTypes = useMemo(() => bodyTypesForGender(draft.gender), [draft.gender]);
  const onboardingTopSizes = useMemo(() => topSizesForGender(draft.gender), [draft.gender]);
  const onboardingBottomSizes = useMemo(() => bottomSizesForGender(draft.gender), [draft.gender]);
  const onboardingShoeSizes = useMemo(() => shoeSizesForGender(draft.gender), [draft.gender]);

  const catalogImageWithVision = async (base64, mediaType) => {
    const agentRunStartedAt = startAgentRun("Wardrobe Agent", "Image analysis");
    try {
      const creds = resolveVisionCredentials();
      if (!creds || creds.provider === "anthropic") {
      const body = {
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: CATALOG_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              {
                type: "text",
                text: 'Reply with one raw JSON object only (keys: name, category, color, style, season, tags, material, description). No other text.',
              },
            ],
          },
        ],
      };

      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Anthropic error ${res.status}`);
      }

      const data = await res.json();
      const text = Array.isArray(data?.content)
        ? data.content.filter((c) => c.type === "text").map((c) => c.text).join("")
        : data?.content?.[0]?.text;
      const outAnthropic = parseCatalogJson(text);
      finishAgentRun("Wardrobe Agent", "Image analysis", agentRunStartedAt, { status: "success" });
      return outAnthropic;
    }

    const dataUrl = `data:${mediaType};base64,${base64}`;
    const body = {
      model: OPENAI_VISION_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: CATALOG_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Reply with one raw JSON object only (keys: name, category, color, style, season, tags, material, description). No other text.',
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    };

    const res = await fetch(OPENAI_VISION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.key}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `OpenAI error ${res.status}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    const outOpenai = parseCatalogJson(text);
    finishAgentRun("Wardrobe Agent", "Image analysis", agentRunStartedAt, { status: "success" });
    return outOpenai;
    } catch (error) {
      failAgentRun("Wardrobe Agent", "Image analysis", agentRunStartedAt, error);
      throw error;
    }
  };

  const addWardrobeFromFile = async (file, options = {}) => {
    if (!file || !file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }
    setUploadError("");
    setAnalyzing(true);
    try {
      let fileToUse = file;
      if (options.removeBg) {
        fileToUse = await placeholderRemoveBackground(file);
      }
      const dataUrl = await compressImage(fileToUse, 800, 0.6);
      const b64 = String(dataUrl).includes(",") ? String(dataUrl).split(",")[1] : String(dataUrl);
      const parsed = await catalogImageWithVision(b64, "image/jpeg");
      const category = CATEGORIES.includes(parsed.category) ? parsed.category : "Accessories";
      const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 20) : [];
      const item = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        imagePreview: dataUrl,
        imageFilename: null,
        name: String(parsed.name || "Untitled"),
        category,
        color: String(parsed.color || ""),
        style: String(parsed.style || ""),
        season: String(parsed.season || ""),
        tags,
        material: String(parsed.material || ""),
        description: String(parsed.description || ""),
        laundryStatus: "clean",
        purchasePrice: 0,
        timesWorn: 0,
        occasion: [],
        lastWorn: null,
        purchaseDate: new Date().toISOString().split("T")[0],
        expectedLifespan: 365,
      };
      addItem(item);
    } catch (e) {
      setUploadError(e.message || "Could not analyze image.");
    } finally {
      setAnalyzing(false);
    }
  };

  const onDrop = (e, opts = {}) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) addWardrobeFromFile(f, opts);
  };

  const onFileChange = (e, opts = {}) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) addWardrobeFromFile(f, opts);
  };

  const addManualWardrobeItem = useCallback(
    async (payload) => {
      let imagePreview = null;
      let imageFilename = null;
      if (payload.imageFile instanceof File) {
        imagePreview = await compressImage(payload.imageFile, 800, 0.6);
        imageFilename = null;
      }

      const raw = String(payload.purchasePrice ?? "").trim();
      const priceNum =
        raw === "" ? 0 : parseFloat(raw.replace(/[^0-9.-]/g, ""));
      const purchasePrice = Number.isFinite(priceNum) ? priceNum : 0;

      const tags = ["manual-entry"];
      if (payload.brand?.trim()) tags.push(payload.brand.trim());

      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

      addItem({
        id,
        name: payload.name.trim(),
        category: payload.category,
        color: payload.color?.trim() ?? "",
        style: "",
        season:
          Array.isArray(payload.season) && payload.season.length
            ? payload.season.join(", ")
            : "",
        occasion: Array.isArray(payload.occasion) ? payload.occasion : [],
        material: payload.material?.trim() ?? "",
        description: payload.notes?.trim() ?? "",
        laundryStatus: "clean",
        purchasePrice,
        timesWorn: 0,
        lastWorn: null,
        purchaseDate: new Date().toISOString().split("T")[0],
        expectedLifespan: 365,
        mood: payload.mood?.trim() ?? "",
        tags,
        imagePreview,
        imageFilename,
        sourceUrl: payload.sourceUrl?.trim() ?? "",
      });
    },
    [addItem]
  );

  const openEdit = (it) => {
    setEditItem(it);
    const pp = getPurchasePriceNum(it);
    setEditForm({
      name: it.name,
      color: it.color,
      purchasePrice: pp > 0 ? String(pp) : "",
      purchaseDate: it.purchaseDate ?? new Date().toISOString().split("T")[0],
      timesWorn: String(getTimesWorn(it)),
      expectedLifespan: it.expectedLifespan != null ? String(it.expectedLifespan) : "365",
    });
  };

  const saveEdit = () => {
    if (!editItem) return;
    const priceStr = editForm.purchasePrice.trim();
    const wc = Math.max(0, parseInt(String(editForm.timesWorn).replace(/\D/g, ""), 10) || 0);
    const lifespan = Math.max(0, parseInt(String(editForm.expectedLifespan).replace(/\D/g, ""), 10) || 0);
    updateItem(editItem.id, {
      name: editForm.name.trim() || editItem.name,
      color: editForm.color.trim(),
      purchasePrice: priceStr === "" ? "" : parseFloat(priceStr.replace(/[^0-9.]/g, "")) || priceStr,
      timesWorn: wc,
      purchaseDate: editForm.purchaseDate || editItem.purchaseDate,
      expectedLifespan: lifespan || 365,
    });
    setEditItem(null);
  };

  const stats = useMemo(() => {
    const total = wardrobe.length;
    let clean = 0;
    let dirty = 0;
    let wash = 0;
    wardrobe.forEach((it) => {
      if (it.laundryStatus === "clean") clean++;
      else if (it.laundryStatus === "dirty") dirty++;
      else wash++;
    });
    return { total, clean, dirty, wash };
  }, [wardrobe]);

  const filteredWardrobe = useMemo(() => {
    return wardrobe.filter((it) => {
      if (catFilter !== "All" && it.category !== catFilter) return false;
      if (laundryFilter !== "All") {
        const map = { Clean: "clean", Dirty: "dirty", "In wash": "wash" };
        if (it.laundryStatus !== map[laundryFilter]) return false;
      }
      return true;
    });
  }, [wardrobe, catFilter, laundryFilter]);

  const agentTitle =
    activeNav === "dashboard"
      ? "Home"
      : activeNav === "wardrobe"
        ? "Wardrobe"
        : activeNav === "equity"
        ? "Wardrobe Equity"
        : activeNav === "calendar"
          ? "Calendar"
          : activeNav === "planner"
            ? "Planner"
            : activeNav === "designer"
              ? "Style Designer"
              : activeNav === "evaluator"
                ? "Outfit Evaluator"
                : activeNav === "shopper"
                  ? "Shopping Agent"
                  : activeNav === "gaps"
                    ? "Gap Analysis"
                    : "Profile";
  const userName = profile?.name || "";

  const styleIntelligence = useMemo(() => {
    const issues = Array.isArray(agentInsights?.frequentIssues) ? agentInsights.frequentIssues : [];
    let mostCommonIssue = "—";
    if (issues.length) {
      const counts = new Map();
      for (const s of issues) {
        const k = String(s).trim().toLowerCase();
        if (!k) continue;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      let bestKey = "";
      let bestN = 0;
      for (const [k, n] of counts) {
        if (n > bestN) {
          bestN = n;
          bestKey = k;
        }
      }
      if (bestKey) {
        const orig = issues.find((x) => String(x).trim().toLowerCase() === bestKey);
        mostCommonIssue = orig != null ? String(orig).trim() : bestKey;
      } else {
        mostCommonIssue = String(issues[issues.length - 1]).trim();
      }
    }

    let mostUsedItem = "—";
    if (wardrobe.length) {
      let maxW = -1;
      for (const it of wardrobe) {
        const w = getTimesWorn(it);
        if (w > maxW) maxW = w;
      }
      if (maxW > 0) {
        const top = wardrobe.filter((it) => getTimesWorn(it) === maxW);
        top.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        mostUsedItem = top[0].name || "Untitled";
      } else {
        mostUsedItem = "No wear counts yet — log wears in Wardrobe.";
      }
    }

    let suggestedFocus = "—";
    if (mostCommonIssue !== "—") {
      const short = mostCommonIssue.split(/[.!?]/)[0].trim().slice(0, 120);
      suggestedFocus = short ? `Focus on: ${short}` : "Refine fit and balance using evaluator feedback.";
    } else if (issues.length) {
      suggestedFocus = "Keep logging outfits in the Evaluator to sharpen recommendations.";
    } else {
      suggestedFocus = "Run the Outfit Evaluator to surface your first improvement themes.";
    }

    return { mostCommonIssue, mostUsedItem, suggestedFocus };
  }, [agentInsights, wardrobe]);

  if (!hydrated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: COLORS.bg,
          color: COLORS.text,
          fontFamily: "'DM Sans', sans-serif",
        }}
      />
    );
  }

  if (firebaseUser === undefined) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: COLORS.textMuted, fontSize: "0.95rem" }}>Loading…</p>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: "24px" }}>
        <div style={{ background: COLORS.surface2, borderRadius: 20, padding: "48px 40px", width: "100%", maxWidth: 400, boxShadow: "0 8px 40px rgba(0,0,0,0.10)", border: `1px solid ${COLORS.border}` }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem", fontWeight: 700, color: COLORS.text, margin: "0 0 4px" }}>
            Fashion OS
          </h1>
          <p style={{ color: COLORS.textMuted, fontSize: "0.9rem", margin: "0 0 32px" }}>
            {authMode === "login" ? "Welcome back." : "Create your account."}
          </p>
          {/* Google Sign-In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={authLoading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              width: "100%",
              padding: "12px 16px",
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
              color: "#3c4043",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "0.95rem",
              fontWeight: 600,
              cursor: authLoading ? "not-allowed" : "pointer",
              opacity: authLoading ? 0.7 : 1,
              marginBottom: 16,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              transition: baseTransition,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ flex: 1, height: 1, background: COLORS.border }} />
            <span style={{ fontSize: "0.78rem", color: COLORS.textMuted }}>or use email</span>
            <div style={{ flex: 1, height: 1, background: COLORS.border }} />
          </div>

          <form onSubmit={handleAuthSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              type="email" placeholder="Email address" value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)} required
              style={{ padding: "12px 16px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.95rem", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
            />
            <input
              type="password" placeholder="Password" value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)} required
              style={{ padding: "12px 16px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.95rem", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
            />
            {authError && <p style={{ color: "#C0392B", fontSize: "0.85rem", margin: 0 }}>{authError}</p>}
            <button
              type="submit" disabled={authLoading}
              style={{ padding: "13px", borderRadius: 10, border: "none", background: COLORS.primary, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.95rem", fontWeight: 600, cursor: authLoading ? "not-allowed" : "pointer", opacity: authLoading ? 0.7 : 1, marginTop: 4 }}
            >
              {authLoading ? "Please wait…" : authMode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
          <p style={{ textAlign: "center", marginTop: 24, fontSize: "0.88rem", color: COLORS.textMuted }}>
            {authMode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}
              style={{ background: "none", border: "none", color: COLORS.primary, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "0.88rem", fontWeight: 600, padding: 0 }}
            >
              {authMode === "login" ? "Sign Up" : "Sign In"}
            </button>
          </p>
          <p style={{ textAlign: "center", marginTop: 12, fontSize: "0.82rem", color: COLORS.textMuted }}>
            Already signed in on another device?{" "}
            <button
              onClick={() => signOut(auth)}
              style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "0.82rem", textDecoration: "underline", padding: 0 }}
            >
              Sign out everywhere
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (!onboardingDone) {
    return (
      <Onboarding
        onboardingStep={onboardingStep}
        draft={draft}
        setDraft={setDraft}
        onboardingBodyTypes={onboardingBodyTypes}
        onboardingTopSizes={onboardingTopSizes}
        onboardingBottomSizes={onboardingBottomSizes}
        onboardingShoeSizes={onboardingShoeSizes}
        goBackOnboarding={goBackOnboarding}
        goNextOnboarding={goNextOnboarding}
        canAdvance={canAdvance}
        baseTransition={baseTransition}
        GENDER_OPTIONS={GENDER_OPTIONS}
        BUDGET_OPTIONS={BUDGET_OPTIONS}
        STYLE_PREFS={STYLE_PREFS}
        BRANDS={BRANDS}
      />
    );
  }

  return (
    <>
      <AppLayoutSidebarDataProvider profile={profile} wardrobe={wardrobe} events={events}>
        <AppLayout
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          agentPanelOpen={agentPanelOpen}
          onToggleAgentPanel={() => setAgentPanelOpen((o) => !o)}
          agentActivity={agentActivity}
        >
        <header
          className="app-header"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            padding: "20px 32px 16px 40px",
            marginBottom: "4rem",
            width: "100%",
            boxSizing: "border-box",
            background: "transparent",
            border: "none",
            boxShadow: "none",
          }}
        >
          <div style={{ ...type.eyebrow, fontSize: "0.65rem", opacity: 0.75 }}>{agentTitle}</div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "1.2rem",
              fontWeight: 500,
              marginTop: 6,
              color: COLORS.text,
              letterSpacing: "-0.03em",
            }}
          >
            Welcome{userName ? `, ${userName}` : ""}
          </div>
        </header>

        <div className="app-style-intel-wrap" style={{ padding: "0 32px 20px", flexShrink: 0 }}>
          <div
            style={mergeStyles(ui.panel, {
              padding: "22px 24px",
              display: "grid",
              gap: 18,
            })}
          >
            <div
              className="app-style-intel-title"
              style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 600, color: COLORS.text }}
            >
              Your Style Intelligence
            </div>
            <div
              className="app-style-intel-cards"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 14,
              }}
            >
              <div style={mergeStyles(ui.softPanel, { padding: "16px 18px" })}>
                <div style={type.meta}>Most common issue</div>
                <div style={{ ...type.bodyStrong, marginTop: 10, lineHeight: 1.45 }}>{styleIntelligence.mostCommonIssue}</div>
              </div>
              <div style={mergeStyles(ui.softPanel, { padding: "16px 18px" })}>
                <div style={type.meta}>Most used item</div>
                <div style={{ ...type.bodyStrong, marginTop: 10, lineHeight: 1.45 }}>{styleIntelligence.mostUsedItem}</div>
              </div>
              <div style={mergeStyles(ui.softPanel, { padding: "16px 18px" })}>
                <div style={type.meta}>Suggested improvement focus</div>
                <div style={{ ...type.bodyStrong, marginTop: 10, lineHeight: 1.45 }}>{styleIntelligence.suggestedFocus}</div>
              </div>
            </div>
          </div>
        </div>

        <main style={mergeStyles(ui.contentWrap, { flex: 1, padding: "32px 32px 48px", minWidth: 0 })}>
          {activeNav === "dashboard" && (
            <DashboardScreen wardrobe={wardrobe} setActiveNav={setActiveNav} agentActivity={agentActivity} />
          )}

          {activeNav === "wardrobe" && (
            <WardrobeScreen
              profile={profile}
              wardrobe={wardrobe}
              agentActivity={agentActivity}
              agentInsights={agentInsights}
              handlers={{
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
                categories: CATEGORIES,
                addManualWardrobeItem,
                addWardrobeFromFile,
              }}
            />
          )}

          {activeNav === "equity" && <WardrobeEquityScreen wardrobe={wardrobe} />}

          {activeNav === "calendar" && (
            <CalendarScreen
              events={events}
              setEvents={setEvents}
              baseTransition={baseTransition}
              emptyEventForm={emptyEventForm}
              todayYmdLocal={todayYmdLocal}
              CAL_OCCASION_TYPES={CAL_OCCASION_TYPES}
              CAL_DRESS_CODES={CAL_DRESS_CODES}
              formatDisplayDate={formatDisplayDate}
              daysRelativeLabel={daysRelativeLabel}
            />
          )}
          {activeNav === "planner" && (
            <PlannerScreen
              profile={profile}
              wardrobe={wardrobe}
              events={events}
              setActiveNav={setActiveNav}
              baseTransition={baseTransition}
              agentInsights={agentInsights}
              todayYmdLocal={todayYmdLocal}
              buildProfileSummary={buildProfileSummary}
              buildCleanWardrobeList={buildCleanWardrobeList}
              formatDisplayDate={formatDisplayDate}
              daysRelativeLabel={daysRelativeLabel}
              parsePlannerResponse={parsePlannerResponse}
            />
          )}
          {activeNav === "shopper" && (
            <ShopperScreen
              profile={profile}
              wardrobe={wardrobe}
              baseTransition={baseTransition}
              STORAGE_WISHLIST={STORAGE_WISHLIST}
              buildProfileSummary={buildProfileSummary}
              callShoppingAssistant={callShoppingAssistant}
              searchShopifyCatalog={searchShopifyCatalog}
              getShopifyProductDetails={getShopifyProductDetails}
            />
          )}
          {activeNav === "designer" && (
            <DesignerScreen
              profile={profile}
              wardrobe={wardrobe}
              baseTransition={baseTransition}
              DESIGNER_STYLE_DIRECTIONS={DESIGNER_STYLE_DIRECTIONS}
              DESIGNER_MOODS={DESIGNER_MOODS}
              buildProfileSummary={buildProfileSummary}
              buildFullWardrobeList={buildFullWardrobeList}
              parseDesignerOutfitsJson={parseDesignerOutfitsJson}
            />
          )}
          {activeNav === "evaluator" && (
            <EvaluatorScreen
              profile={profile}
              wardrobe={wardrobe}
              baseTransition={baseTransition}
              setAgentInsights={setAgentInsights}
              buildProfileSummary={buildProfileSummary}
              parseEvaluatorJson={parseEvaluatorJson}
              normalizeEvaluatorResult={normalizeEvaluatorResult}
              mergeFrequentIssuesFromImprovements={mergeFrequentIssuesFromImprovements}
              mediaTypeForFile={mediaTypeForFile}
              fileToBase64={fileToBase64}
              evaluateOutfitWithVision={evaluateOutfitWithVision}
            />
          )}
          {activeNav === "gaps" && (
            <GapAnalysisScreen
              profile={profile}
              wardrobe={wardrobe}
              agentActivity={agentActivity}
              agentInsights={agentInsights}
              handlers={{ GapAnalysisAgent, events, baseTransition }}
            />
          )}

          {activeNav === "profile" && (
            <ProfileScreen
              initial={profile}
              onSave={(next) => {
                setDraft(next);
                persistProfile(next);
              }}
              baseTransition={baseTransition}
              defaultProfile={defaultProfile}
              bodyTypesForGender={bodyTypesForGender}
              topSizesForGender={topSizesForGender}
              bottomSizesForGender={bottomSizesForGender}
              shoeSizesForGender={shoeSizesForGender}
              GENDER_OPTIONS={GENDER_OPTIONS}
              BUDGET_OPTIONS={BUDGET_OPTIONS}
              STYLE_PREFS={STYLE_PREFS}
              BRANDS={BRANDS}
            />
          )}
        </main>
        </AppLayout>
      </AppLayoutSidebarDataProvider>

      {editItem && (
        <div
          role="presentation"
          onClick={() => setEditItem(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
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
            style={mergeStyles(ui.panel, {
              width: "100%",
              maxWidth: 400,
              padding: 28,
            })}
          >
            <h2
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                margin: "0 0 20px",
                fontSize: "1.5rem",
              }}
            >
              Edit piece
            </h2>
            <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 8 }}>Name</label>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              onFocus={focusInputVisual}
              onBlur={blurInputVisual}
              style={mergeStyles(ui.input, { marginBottom: 14, background: COLORS.surface2 })}
            />
            <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 8 }}>Color</label>
            <input
              value={editForm.color}
              onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
              onFocus={focusInputVisual}
              onBlur={blurInputVisual}
              style={mergeStyles(ui.input, { marginBottom: 14, background: COLORS.surface2 })}
            />
            <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 8 }}>
              Purchase price (for CPW)
            </label>
            <input
              value={editForm.purchasePrice}
              onChange={(e) => setEditForm((f) => ({ ...f, purchasePrice: e.target.value }))}
              placeholder="e.g. 89"
              onFocus={focusInputVisual}
              onBlur={blurInputVisual}
              style={mergeStyles(ui.input, { marginBottom: 14, background: COLORS.surface2 })}
            />
            <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 8 }}>
              Wear count
            </label>
            <input
              type="number"
              min={0}
              value={editForm.timesWorn}
              onChange={(e) => setEditForm((f) => ({ ...f, timesWorn: e.target.value }))}
              onFocus={focusInputVisual}
              onBlur={blurInputVisual}
              style={mergeStyles(ui.input, { marginBottom: 14, background: COLORS.surface2 })}
            />
            <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 8 }}>
              Expected lifespan (days)
            </label>
            <input
              type="number"
              min={1}
              value={editForm.expectedLifespan}
              onChange={(e) => setEditForm((f) => ({ ...f, expectedLifespan: e.target.value }))}
              onFocus={focusInputVisual}
              onBlur={blurInputVisual}
              style={mergeStyles(ui.input, { marginBottom: 20, background: COLORS.surface2 })}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Purchase Date
              </label>
              <input
                type="date"
                value={editForm.purchaseDate}
                onChange={(e) => setEditForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.bg,
                  color: COLORS.text,
                  fontSize: "0.92rem",
                  fontFamily: "'DM Sans', sans-serif",
                  outline: "none",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setEditItem(null)}
                style={mergeStyles(ui.secondaryButton, { padding: "12px 18px" })}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                style={mergeStyles(ui.primaryButton, { padding: "12px 20px" })}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <AgentPanel
        agentActivity={agentActivity}
        formatDuration={formatDuration}
        getAgentStatusTone={getAgentStatusTone}
        agentPanelOpen={agentPanelOpen}
        setAgentPanelOpen={setAgentPanelOpen}
      />
    </>
  );
}

const DESIGNER_STYLE_DIRECTIONS = [
  "Casual Chic",
  "Business Formal",
  "Street Style",
  "Minimalist",
  "Bohemian",
  "Sporty Luxe",
  "Evening Glam",
  "Smart Casual",
];

const DESIGNER_MOODS = [
  "Confident",
  "Playful",
  "Mysterious",
  "Romantic",
  "Edgy",
  "Effortless",
  "Bold",
  "Relaxed",
];



function mergeFrequentIssuesFromImprovements(prev, improvements) {
  const list = Array.isArray(improvements) ? improvements : [];
  const next = [...prev];
  for (const raw of list) {
    const s = String(raw || "").trim();
    if (!s) continue;
    if (!next.some((x) => String(x).toLowerCase() === s.toLowerCase())) next.push(s);
  }
  return next.slice(-20);
}



function extractWishlistSuggestions(text) {
  const out = [];
  const lines = String(text || "").split("\n");
  for (const line of lines) {
    const m = line.match(/^ADD_TO_WISHLIST:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/i);
    if (m) {
      out.push({
        name: m[1].trim(),
        price: m[2].trim(),
        store: m[3].trim(),
      });
    }
  }
  return out;
}

function ShopperAgentOld({ profile, wardrobe, baseTransition, agentInsights }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [shoppingList, setShoppingList] = useState(() => {
    const w = loadJson(STORAGE_WISHLIST, []);
    return Array.isArray(w) ? w : [];
  });
  const [showList, setShowList] = useState(false);
  const [manual, setManual] = useState({ name: "", price: "", store: "" });

  useEffect(() => {
    localStorage.setItem(STORAGE_WISHLIST, JSON.stringify(shoppingList));
  }, [shoppingList]);

  const budgetLine = useMemo(() => {
    const b = BUDGET_OPTIONS.find((x) => x.id === profile?.budget);
    return b ? `${b.label} — ${b.sub}` : profile?.budget || "not set";
  }, [profile]);

  const brandsLine = useMemo(() => {
    return Array.isArray(profile?.brands) && profile.brands.length ? profile.brands.join(", ") : "any";
  }, [profile]);

  const agentInsightsBlock = useMemo(() => {
    const a = agentInsights || {};
    const fi = Array.isArray(a.frequentIssues) ? a.frequentIssues : [];
    const ps = Array.isArray(a.preferredStyles) ? a.preferredStyles : [];
    const av = Array.isArray(a.avoidedItems) ? a.avoidedItems : [];
    return [
      fi.length ? `Repeated outfit issues:\n${fi.map((x, i) => `${i + 1}. ${x}`).join("\n")}` : "",
      ps.length ? `Preferred styles:\n${ps.join(", ")}` : "",
      av.length ? `Avoided items:\n${av.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n") || "(No agent insights recorded yet.)";
  }, [agentInsights]);

  const sendMessage = async (text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed || loading) return;
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    setMessages((m) => [...m, { role: "user", content: trimmed, id }]);
    setInput("");
    setLoading(true);
    let gapAnalysisResults = "(No gap analysis yet — run Gap Analysis for tailored gap context.)";
    try {
      const raw = localStorage.getItem(STORAGE_GAP_ANALYSIS_LAST);
      if (raw && raw.trim()) gapAnalysisResults = raw.trim();
    } catch {
      gapAnalysisResults = "(Gap analysis unavailable.)";
    }
    const system = `You are ARLO, an elite personal fashion shopping agent.
Recommend ONLY high-impact items that fix wardrobe gaps.

User budget: ${budgetLine}
Preferred brands (from profile): ${brandsLine}

Gap analysis results (most recent):
${gapAnalysisResults}

Agent insights:
${agentInsightsBlock}

User profile: ${buildProfileSummary(profile)}
Wardrobe catalog: ${wardrobe.length} item(s).

Respond with ONLY valid JSON (no markdown):
{
  "recommendations": [
    {
      "item": "product name",
      "price_range": "e.g. $40–$70",
      "why_it_matters": "how it fixes gaps or issues",
      "outfits_unlocked": 3
    }
  ]
}

Include as many recommendations as appropriate for the user's question (typically 3–8).`;
    try {
      const reply = await callShoppingAssistant(system, trimmed);
      const structured = parseShopperRecommendations(reply);
      const aid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "a";
      setMessages((m) => [...m, { role: "assistant", content: reply, id: aid, structured }]);
    } catch (e) {
      const eid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "e";
      setMessages((m) => [
        ...m,
        { role: "assistant", content: e.message || "Something went wrong.", id: eid },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const addWishlistItem = (name, price, store, notes = "") => {
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    setShoppingList((L) => [...L, { id, name, price, store, notes }]);
  };

  const removeWishlistItem = (id) => {
    setShoppingList((L) => L.filter((x) => x.id !== id));
  };

  const quickPrompts = [
    "What's on sale at Zara?",
    "Find white sneakers under $100",
    "Compare blazers H&M vs ASOS",
    "Best summer pieces right now",
  ];

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
        Shopping Agent
      </h2>
      <p style={{ color: COLORS.textMuted, margin: "0 0 16px", fontSize: "0.9rem" }}>
        ARLO finds deals and compares retailers. With an Anthropic key, replies use live web search; with OpenAI only,
        ARLO uses general shopping knowledge (verify prices on retailer sites).
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setShowList(false)}
          style={{
            padding: "8px 16px",
            borderRadius: 999,
            border: `1px solid ${!showList ? COLORS.primary : COLORS.border}`,
            background: !showList ? COLORS.primarySoft : COLORS.surface2,
            color: !showList ? COLORS.text : COLORS.textMuted,
            cursor: "pointer",
            fontSize: "0.85rem",
            transition: baseTransition,
          }}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => setShowList(true)}
          style={{
            padding: "8px 16px",
            borderRadius: 999,
            border: `1px solid ${showList ? COLORS.primary : COLORS.border}`,
            background: showList ? COLORS.primarySoft : COLORS.surface2,
            color: showList ? COLORS.text : COLORS.textMuted,
            cursor: "pointer",
            fontSize: "0.85rem",
            transition: baseTransition,
          }}
        >
          Wishlist
        </button>
      </div>

      {!showList && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {quickPrompts.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void sendMessage(q)}
                disabled={loading}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface2,
                  color: COLORS.textMuted,
                  cursor: loading ? "default" : "pointer",
                  fontSize: "0.78rem",
                  transition: baseTransition,
                }}
              >
                {q}
              </button>
            ))}
          </div>

          <div
            style={{
              background: COLORS.surface,
              borderRadius: 12,
              border: `1px solid ${COLORS.border}`,
              padding: 16,
              minHeight: 280,
              maxHeight: 420,
              overflowY: "auto",
              marginBottom: 12,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages.length === 0 && (
              <p style={{ color: COLORS.textMuted, margin: 0, fontSize: "0.9rem" }}>Ask ARLO anything about shopping.</p>
            )}
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const suggestions = !isUser && !msg.structured ? extractWishlistSuggestions(msg.content) : [];
              return (
                <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                  {!isUser && Array.isArray(msg.structured) && msg.structured.length > 0 ? (
                    <div style={{ maxWidth: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
                      {msg.structured.map((rec, idx) => (
                        <div key={`${msg.id}-r-${idx}`} style={mergeStyles(ui.panel, { padding: 16 })}>
                          <div
                            style={{
                              fontFamily: "'Cormorant Garamond', serif",
                              fontWeight: 600,
                              fontSize: "1.1rem",
                              marginBottom: 10,
                              color: COLORS.text,
                            }}
                          >
                            {rec.item}
                          </div>
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ display: "grid", gap: 4 }}>
                              <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, letterSpacing: "0.04em" }}>Price</div>
                              <div
                                style={{
                                  fontSize: "1.15rem",
                                  fontWeight: 700,
                                  color: COLORS.primary,
                                  fontFamily: "'DM Sans', sans-serif",
                                }}
                              >
                                {rec.price_range || "—"}
                              </div>
                            </div>
                          </div>
                          <div style={mergeStyles(ui.softPanel, { padding: "12px 14px", marginBottom: 10 })}>
                            <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 6 }}>Why it matters</div>
                            <div style={{ fontSize: "0.88rem", lineHeight: 1.5, color: COLORS.text }}>{rec.why_it_matters || "—"}</div>
                          </div>
                          <div style={mergeStyles(ui.softPanel, { padding: "12px 14px", marginBottom: 12 })}>
                            <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 6 }}>Outfit impact</div>
                            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: COLORS.text }}>
                              {rec.outfits_unlocked != null && rec.outfits_unlocked > 0
                                ? `~${rec.outfits_unlocked} outfit${rec.outfits_unlocked === 1 ? "" : "s"} unlocked`
                                : "—"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              addWishlistItem(
                                rec.item,
                                rec.price_range || "",
                                "—",
                                rec.why_it_matters
                                  ? `Impact: ~${rec.outfits_unlocked || 0} outfits. ${rec.why_it_matters}`
                                  : ""
                              )
                            }
                            style={mergeStyles(ui.primaryButton, { width: "100%", padding: "12px 16px", fontSize: "0.9rem" })}
                          >
                            Save to Wishlist
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        maxWidth: "92%",
                        padding: "10px 14px",
                        borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                        background: isUser ? COLORS.primary : COLORS.surface2,
                        color: isUser ? "#FFFFFF" : COLORS.text,
                        fontSize: "0.9rem",
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {msg.content}
                    </div>
                  )}
                  {!isUser && suggestions.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                      {suggestions.map((s, idx) => (
                        <button
                          key={`${msg.id}-wl-${idx}`}
                          type="button"
                          onClick={() => addWishlistItem(s.name, s.price, s.store)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            border: `1px solid ${COLORS.primary}`,
                            background: COLORS.primarySoft,
                            color: COLORS.text,
                            cursor: "pointer",
                            fontSize: "0.78rem",
                            transition: baseTransition,
                          }}
                        >
                          Add to Wishlist: {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    border: `3px solid ${COLORS.border}`,
                    borderTopColor: COLORS.primary,
                    borderRadius: "50%",
                    animation: "fosSpin 0.8s linear infinite",
                  }}
                />
                <style>{`@keyframes fosSpin { to { transform: rotate(360deg); } }`}</style>
                <span style={{ color: COLORS.textMuted, fontSize: "0.85rem" }}>Searching…</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              placeholder="Ask about prices, sales, or comparisons…"
              style={{
                flex: 1,
                minWidth: 0,
                padding: "12px 14px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface2,
                color: COLORS.text,
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
            <button
              type="button"
              onClick={() => void sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                padding: "12px 20px",
                borderRadius: 8,
                border: "none",
                background: loading || !input.trim() ? COLORS.border : COLORS.primary,
                color: "#FFFFFF",
                fontWeight: 600,
                cursor: loading || !input.trim() ? "default" : "pointer",
                transition: baseTransition,
              }}
            >
              Send
            </button>
          </div>
        </>
      )}

      {showList && (
        <div>
          {shoppingList.length === 0 ? (
            <p style={{ color: COLORS.textMuted }}>No saved items yet. Add from chat suggestions or below.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {shoppingList.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: 14,
                    background: COLORS.surface2,
                    borderRadius: 10,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{it.name}</div>
                    <div style={{ fontSize: "0.85rem", color: COLORS.textMuted }}>
                      {it.price} · {it.store}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeWishlistItem(it.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: `1px solid rgba(232,160,160,0.35)`,
                      background: "transparent",
                      color: "#e8a0a0",
                      cursor: "pointer",
                      fontSize: "0.78rem",
                      transition: baseTransition,
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              background: COLORS.surface,
              borderRadius: 12,
              padding: 20,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div style={{ fontSize: "0.75rem", color: COLORS.textMuted, marginBottom: 10 }}>Add item manually</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <input
                value={manual.name}
                onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
                placeholder="Name"
                style={{
                  flex: "1 1 140px",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface2,
                  color: COLORS.text,
                }}
              />
              <input
                value={manual.price}
                onChange={(e) => setManual((m) => ({ ...m, price: e.target.value }))}
                placeholder="Price"
                style={{
                  flex: "1 1 100px",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface2,
                  color: COLORS.text,
                }}
              />
              <input
                value={manual.store}
                onChange={(e) => setManual((m) => ({ ...m, store: e.target.value }))}
                placeholder="Store"
                style={{
                  flex: "1 1 120px",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface2,
                  color: COLORS.text,
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!manual.name.trim()) return;
                addWishlistItem(manual.name.trim(), manual.price.trim() || "—", manual.store.trim() || "—");
                setManual({ name: "", price: "", store: "" });
              }}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: COLORS.primary,
                color: "#FFFFFF",
                fontWeight: 600,
                cursor: "pointer",
                transition: baseTransition,
              }}
            >
              Add to wishlist
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

async function searchShopifyCatalog(query, filters = {}) {
  const params = new URLSearchParams({
    q: query,
    limit: String(filters.limit || 10),
  });
  if (filters.max_price) params.append("price_max", filters.max_price);
  if (filters.min_price) params.append("price_min", filters.min_price);
  if (filters.country_code) params.append("country_code", filters.country_code);
  if (filters.currency) params.append("currency", filters.currency);
  if (filters.allow_secondhand !== undefined) {
    params.append("allow_secondhand", String(filters.allow_secondhand));
  }

  const res = await fetch(
    `http://localhost:3001/api/shopify/search?${params}`
  );
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

async function getShopifyProductDetails(upid) {
  const res = await fetch(`http://localhost:3001/api/shopify/product/${upid}`);
  if (!res.ok) throw new Error(`Product lookup failed: ${res.status}`);
  return res.json();
}



const GAP_SEASONS = ["Spring", "Summer", "Fall", "Winter"];

function GapAnalysisAgent({ profile, wardrobe, events, baseTransition, agentInsights }) {
  const [mode, setMode] = useState("full");
  const [season, setSeason] = useState("Spring");
  const [eventId, setEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const today = todayYmdLocal();
  const upcomingSorted = useMemo(() => {
    return [...events]
      .filter((e) => e && typeof e.date === "string" && e.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [events, today]);

  const selectedEvent = useMemo(
    () => upcomingSorted.find((e) => e.id === eventId) || null,
    [upcomingSorted, eventId]
  );

  const parsedGapItems = useMemo(() => (result ? parseGapAnalysisGaps(result) : null), [result]);

  const run = async () => {
    setError("");
    setResult("");
    const profileSummary = buildProfileSummary(profile);
    const count = wardrobe.length;
    const wardrobeItems = buildFullWardrobeList(wardrobe);
    const frequentIssuesBlock = Array.isArray(agentInsights?.frequentIssues) && agentInsights.frequentIssues.length
      ? agentInsights.frequentIssues.map((x, i) => `${i + 1}. ${String(x)}`).join("\n")
      : "(none recorded yet)";

    let modeContext = "";
    if (mode === "full") {
      modeContext = "Analyse the full wardrobe for gaps across their lifestyle.";
    } else if (mode === "event") {
      if (!selectedEvent) {
        setError("Select an upcoming event.");
        return;
      }
      modeContext = `Focus on gaps needed for this specific event: "${selectedEvent.title}" on ${formatDisplayDate(selectedEvent.date)} (${daysRelativeLabel(selectedEvent.date)}). Occasion: ${selectedEvent.occasionType}. Dress code: ${selectedEvent.dressCode}. ${selectedEvent.location ? `Location: ${selectedEvent.location}. ` : ""}${selectedEvent.notes ? `Notes: ${selectedEvent.notes}` : ""}`;
    } else {
      modeContext = `Focus on gaps for the ${season} season (weather-appropriate pieces, layering, and versatility for that time of year).`;
    }

    const system = `You are a wardrobe gap analyst.
Based on wardrobe and repeated outfit issues, identify missing pieces.

User profile:
${profileSummary}

Wardrobe items (${count}):
${wardrobeItems}

Repeated outfit issues (from evaluator insights):
${frequentIssuesBlock}

${modeContext}

Respond with ONLY valid JSON (no markdown):
{
  "gaps": [
    {
      "name": "item name",
      "reason": "why this piece is needed",
      "impact": "what problem or gap it solves"
    }
  ]
}

Include 5-8 gaps when appropriate. Each gap must include name, reason, and impact.`;

    const user = "Return the JSON gap analysis now.";
    setLoading(true);
    try {
      const text = await runAgent({
        agentName: "Gap Analysis Agent",
        task: "Analyze wardrobe gaps",
        systemPrompt: system,
        userPrompt: user,
      });
      setResult(text);
      try {
        localStorage.setItem(STORAGE_GAP_ANALYSIS_LAST, text);
      } catch {
        /* ignore quota */
      }
    } catch (e) {
      setError(e.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const pill = (id, label) => {
    const on = mode === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          setMode(id);
          setError("");
        }}
        style={{
          padding: "8px 16px",
          borderRadius: 999,
          border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
          background: on ? COLORS.primarySoft : COLORS.surface2,
          color: on ? COLORS.text : COLORS.textMuted,
          cursor: "pointer",
          fontSize: "0.85rem",
          transition: baseTransition,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.75rem",
          fontWeight: 600,
          margin: "0 0 8px",
        }}
      >
        Gap Analysis
      </h2>
      <p style={{ color: COLORS.textMuted, margin: "0 0 8px", fontSize: "0.9rem" }}>
        {"Discover what's missing from your wardrobe"}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {pill("full", "Full Wardrobe")}
        {pill("event", "For an Event")}
        {pill("season", "By Season")}
      </div>

      {wardrobe.length === 0 && (
        <p style={{ color: COLORS.textMuted, marginBottom: 16 }}>Your wardrobe is empty — add items first for a meaningful gap analysis.</p>
      )}

      {mode === "full" && (
        <div style={{ marginBottom: 20 }}>
          <button
            type="button"
            onClick={run}
            disabled={loading || wardrobe.length === 0}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              border: "none",
              background: loading || wardrobe.length === 0 ? COLORS.border : COLORS.primary,
              color: "#FFFFFF",
              fontWeight: 600,
              cursor: loading || wardrobe.length === 0 ? "default" : "pointer",
              transition: baseTransition,
            }}
          >
            {loading ? "Analysing…" : "Analyse my wardrobe"}
          </button>
        </div>
      )}

      {mode === "event" && (
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 20,
            border: `1px solid ${COLORS.border}`,
            marginBottom: 20,
          }}
        >
          {upcomingSorted.length === 0 ? (
            <p style={{ color: COLORS.textMuted, margin: 0, lineHeight: 1.6 }}>
              No upcoming events. Add one in the Calendar (📅 in the sidebar), then return here.
            </p>
          ) : (
            <>
              <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 6 }}>
                Upcoming event
              </label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface2,
                  color: COLORS.text,
                  marginBottom: 16,
                }}
              >
                <option value="">Select an event…</option>
                {upcomingSorted.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} — {ev.date}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={run}
                disabled={loading || wardrobe.length === 0 || !eventId}
                style={{
                  padding: "12px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: loading || wardrobe.length === 0 || !eventId ? COLORS.border : COLORS.primary,
                  color: "#FFFFFF",
                  fontWeight: 600,
                  cursor: loading || wardrobe.length === 0 || !eventId ? "default" : "pointer",
                  transition: baseTransition,
                }}
              >
                {loading ? "Analysing…" : "Analyse for this event"}
              </button>
            </>
          )}
        </div>
      )}

      {mode === "season" && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {GAP_SEASONS.map((s) => {
              const on = season === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeason(s)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                    background: on ? COLORS.primarySoft : COLORS.surface2,
                    color: on ? COLORS.text : COLORS.textMuted,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    transition: baseTransition,
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={run}
            disabled={loading || wardrobe.length === 0}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              border: "none",
              background: loading || wardrobe.length === 0 ? COLORS.border : COLORS.primary,
              color: "#FFFFFF",
              fontWeight: 600,
              cursor: loading || wardrobe.length === 0 ? "default" : "pointer",
              transition: baseTransition,
            }}
          >
            {loading ? "Analysing…" : `Analyse for ${season}`}
          </button>
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 28,
              height: 28,
              border: `3px solid ${COLORS.border}`,
              borderTopColor: COLORS.primary,
              borderRadius: "50%",
              animation: "fosSpin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes fosSpin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ color: COLORS.textMuted }}>Finding gaps…</span>
        </div>
      )}

      {error && (
        <div style={{ padding: 14, borderRadius: 10, background: COLORS.primarySoft, marginBottom: 16, fontSize: "0.9rem" }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {parsedGapItems?.length ? (
            parsedGapItems.map((gap, idx) => (
              <div key={idx} style={mergeStyles(ui.panel, { padding: 20 })}>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontWeight: 600,
                    fontSize: "1.2rem",
                    marginBottom: 14,
                    color: COLORS.text,
                  }}
                >
                  {gap.name}
                </div>
                <div style={mergeStyles(ui.softPanel, { padding: "14px 16px", marginBottom: 10 })}>
                  <div style={{ ...type.meta, marginBottom: 8 }}>WHY this is needed</div>
                  <div style={{ fontSize: "0.9rem", lineHeight: 1.55, color: COLORS.text }}>{gap.reason || "—"}</div>
                </div>
                <div style={mergeStyles(ui.softPanel, { padding: "14px 16px" })}>
                  <div style={{ ...type.meta, marginBottom: 8 }}>WHAT problem it solves</div>
                  <div style={{ fontSize: "0.9rem", lineHeight: 1.55, color: COLORS.text }}>{gap.impact || "—"}</div>
                </div>
              </div>
            ))
          ) : (
            <div style={mergeStyles(ui.panel, { padding: 20, fontSize: "0.9rem", lineHeight: 1.65, whiteSpace: "pre-wrap" })}>
              {result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

