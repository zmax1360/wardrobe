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

import { COLORS, baseTransition, radius } from "./styles/theme";
import { type } from "./styles/typography";
import { ui } from "./styles/ui";
import { mergeStyles, focusInputVisual, blurInputVisual } from "./utils/styleUtils";
import {
  ANTHROPIC_URL,
  CLAUDE_MODEL,
  OPENAI_VISION_URL,
  OPENAI_VISION_MODEL,
  agentTraceHooks,
  resolveVisionCredentials,
  parseCatalogJson,
  extractJsonObjectSlice,
} from "./services/aiService";
import { runAgent } from "./agents/agentOrchestrator";
import { useAgentActivity } from "./hooks/useAgentActivity";
import { useAgentInsights } from "./hooks/useAgentInsights";
import { useWardrobe } from "./hooks/useWardrobe";
import { AppLayout, AppLayoutSidebarDataProvider } from "./layout/AppLayout";
import { WardrobeScreen } from "./screens/WardrobeScreen";
import { PlannerScreen } from "./screens/PlannerScreen";
import { DesignerScreen } from "./screens/DesignerScreen";
import { EvaluatorScreen } from "./screens/EvaluatorScreen";
import { GapAnalysisScreen } from "./screens/GapAnalysisScreen";
import { WardrobeEquityScreen } from "./screens/WardrobeEquityScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { AgentPanel } from "./components/AgentPanel";
import {
  getTimesWorn,
  compareCleanItemsByPriorityCPW,
  getPurchasePriceNum,
} from "./utils/wardrobeFinance";
// (kept minimal) apiBase still used elsewhere in the app
import { placeholderRemoveBackground } from "./services/backgroundRemoval";

const STORAGE_PROFILE = "fos_profile";
const STORAGE_EVENTS = "fos_events";
const STORAGE_WISHLIST = "fos_wishlist";
const STORAGE_GAP_ANALYSIS_LAST = "fos_gap_analysis_last";

function dedupeStrings(ordered) {
  const seen = new Set();
  const out = [];
  for (const x of ordered) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

const BODY_TYPES_MALE = [
  "Athletic / V-shape",
  "Rectangle",
  "Oval / Round",
  "Triangle",
  "Tall & Slim",
  "Stocky / Broad",
];

const BODY_TYPES_FEMALE = [
  "Hourglass",
  "Pear",
  "Apple",
  "Rectangle",
  "Inverted Triangle",
  "Petite",
  "Tall",
  "Plus size",
];

const BODY_TYPES_NONBINARY = dedupeStrings([
  "Hourglass",
  "Pear",
  "Apple",
  "Rectangle",
  "Inverted Triangle",
  "Petite",
  "Tall",
  "Plus size",
  "Athletic / V-shape",
  "Oval / Round",
  "Triangle",
  "Tall & Slim",
  "Stocky / Broad",
]);

function bodyTypesForGender(g) {
  if (g === "male") return BODY_TYPES_MALE;
  if (g === "female") return BODY_TYPES_FEMALE;
  if (g === "nonbinary" || g === "undisclosed") return BODY_TYPES_NONBINARY;
  return [];
}

const TOP_SIZES_FEMALE = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
const TOP_SIZES_MALE = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];

function topSizesForGender(g) {
  if (g === "male") return TOP_SIZES_MALE;
  if (g === "female") return TOP_SIZES_FEMALE;
  return dedupeStrings([...TOP_SIZES_FEMALE, ...TOP_SIZES_MALE]);
}

const BOTTOM_SIZES_FEMALE = ["24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "36"];
const BOTTOM_SIZES_MALE = ["28", "29", "30", "31", "32", "33", "34", "36", "38", "40"];

function bottomSizesForGender(g) {
  if (g === "male") return BOTTOM_SIZES_MALE;
  if (g === "female") return BOTTOM_SIZES_FEMALE;
  return dedupeStrings([...BOTTOM_SIZES_FEMALE, ...BOTTOM_SIZES_MALE]);
}

const SHOE_SIZES_FEMALE = ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11"];
const SHOE_SIZES_MALE = ["7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13", "14", "15"];

function shoeSizesForGender(g) {
  if (g === "male") return SHOE_SIZES_MALE;
  if (g === "female") return SHOE_SIZES_FEMALE;
  return dedupeStrings([...SHOE_SIZES_FEMALE, ...SHOE_SIZES_MALE]);
}

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

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mediaTypeForFile(file) {
  const t = file.type;
  if (t === "image/jpeg" || t === "image/png" || t === "image/gif" || t === "image/webp")
    return t;
  return "image/jpeg";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = r.result;
      const comma = String(res).indexOf(",");
      resolve(comma >= 0 ? String(res).slice(comma + 1) : String(res));
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function compressImage(file, maxWidth = 800, quality = 0.6) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function defaultProfile() {
  return {
    name: "",
    gender: "",
    bodyType: [],
    budget: "",
    styles: [],
    brands: [],
    topSize: "",
    bottomSize: "",
    shoeSize: "",
  };
}

/** Cost per wear for wardrobe financials — mirrors `utils/calculateCPW.js`. */
function calculateCPW(price, wears) {
  const p = typeof price === "number" && Number.isFinite(price) ? price : parseFloat(String(price ?? 0).replace(/[^0-9.-]/g, "")) || 0;
  const w = typeof wears === "number" && Number.isFinite(wears) ? wears : parseInt(String(wears ?? 0), 10) || 0;
  return p / Math.max(w, 1);
}

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
        <div style={{ width: "100%", maxWidth: 520 }}>
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
            Tailor your style profile in seven steps.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <div
                key={n}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  background: n <= onboardingStep ? COLORS.primary : COLORS.surface2,
                  transition: baseTransition,
                }}
              />
            ))}
          </div>

          <div
            style={{
              background: COLORS.surface,
              borderRadius: 12,
              padding: 28,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {onboardingStep === 1 && (
              <>
                <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.8rem", marginBottom: 8 }}>
                  Your name
                </label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Alex"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "14px 16px",
                    borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.surface2,
                    color: COLORS.text,
                    fontSize: "1rem",
                    outline: "none",
                    transition: baseTransition,
                  }}
                />
              </>
            )}

            {onboardingStep === 2 && (
              <>
                <p style={{ margin: "0 0 16px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Gender</p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 12,
                  }}
                >
                  {GENDER_OPTIONS.map((opt) => {
                    const selected = draft.gender === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            gender: opt.value,
                            bodyType: d.gender !== opt.value ? [] : d.bodyType,
                          }))
                        }
                        style={{
                          minHeight: 88,
                          padding: "20px 16px",
                          borderRadius: 10,
                          border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                          background: selected ? COLORS.primarySoft : COLORS.surface2,
                          color: COLORS.text,
                          cursor: "pointer",
                          fontSize: "1rem",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          transition: baseTransition,
                        }}
                      >
                        <span style={{ fontSize: "1.75rem" }}>{opt.icon}</span>
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {onboardingStep === 3 && (
              <>
                <p style={{ margin: "0 0 16px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Body type</p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 10,
                  }}
                >
                  {onboardingBodyTypes.map((bt) => {
                    const selected = Array.isArray(draft.bodyType)
                      ? draft.bodyType.includes(bt)
                      : draft.bodyType === bt;
                    return (
                      <button
                        key={bt}
                        type="button"
                        onClick={() =>
                          setDraft((d) => {
                            const current = Array.isArray(d.bodyType)
                              ? d.bodyType
                              : d.bodyType
                                ? [d.bodyType]
                                : [];
                            const on = current.includes(bt);
                            return {
                              ...d,
                              bodyType: on ? current.filter((x) => x !== bt) : [...current, bt],
                            };
                          })
                        }
                        style={{
                          padding: "14px 12px",
                          borderRadius: 10,
                          border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                          background: selected ? COLORS.primarySoft : COLORS.surface2,
                          color: COLORS.text,
                          cursor: "pointer",
                          fontSize: "0.88rem",
                          textAlign: "left",
                          transition: baseTransition,
                        }}
                      >
                        {bt}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: "0.78rem", color: COLORS.textMuted, marginTop: 4 }}>
                  Select all that apply
                </p>
              </>
            )}

            {onboardingStep === 4 && (
              <>
                <p style={{ margin: "0 0 16px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Shopping budget</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {BUDGET_OPTIONS.map((b) => {
                    const selected = draft.budget === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, budget: b.id }))}
                        style={{
                          textAlign: "left",
                          padding: "14px 16px",
                          borderRadius: 10,
                          border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                          background: selected ? COLORS.primarySoft : COLORS.surface2,
                          color: COLORS.text,
                          cursor: "pointer",
                          transition: baseTransition,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.label}</div>
                        <div style={{ fontSize: "0.82rem", color: COLORS.textMuted }}>{b.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {onboardingStep === 5 && (
              <>
                <p style={{ margin: "0 0 16px", color: COLORS.textMuted, fontSize: "0.9rem" }}>
                  Style preferences (choose any)
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {STYLE_PREFS.map((s) => {
                    const on = draft.styles.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            styles: on ? d.styles.filter((x) => x !== s) : [...d.styles, s],
                          }))
                        }
                        style={{
                          padding: "8px 14px",
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
              </>
            )}

            {onboardingStep === 6 && (
              <>
                <p style={{ margin: "0 0 16px", color: COLORS.textMuted, fontSize: "0.9rem" }}>
                  Preferred brands (optional)
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {BRANDS.map((b) => {
                    const on = draft.brands.includes(b);
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            brands: on ? d.brands.filter((x) => x !== b) : [...d.brands, b],
                          }))
                        }
                        style={{
                          padding: "8px 14px",
                          borderRadius: 999,
                          border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                          background: on ? COLORS.primarySoft : COLORS.surface2,
                          color: on ? COLORS.text : COLORS.textMuted,
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          transition: baseTransition,
                        }}
                      >
                        {b}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {onboardingStep === 7 && (
              <>
                <p style={{ margin: "0 0 12px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Top size</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                  {onboardingTopSizes.map((sz) => {
                    const selected = draft.topSize === sz;
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, topSize: sz }))}
                        style={{
                          minWidth: 44,
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                          background: selected ? COLORS.primarySoft : COLORS.surface2,
                          color: COLORS.text,
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          transition: baseTransition,
                        }}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
                <p style={{ margin: "0 0 12px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Bottom size</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                  {onboardingBottomSizes.map((sz) => {
                    const selected = draft.bottomSize === sz;
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, bottomSize: sz }))}
                        style={{
                          minWidth: 44,
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                          background: selected ? COLORS.primarySoft : COLORS.surface2,
                          color: COLORS.text,
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          transition: baseTransition,
                        }}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
                <p style={{ margin: "0 0 12px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Shoe size (US)</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {onboardingShoeSizes.map((sz) => {
                    const selected = draft.shoeSize === sz;
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, shoeSize: sz }))}
                        style={{
                          minWidth: 44,
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                          background: selected ? COLORS.primarySoft : COLORS.surface2,
                          color: COLORS.text,
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          transition: baseTransition,
                        }}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28, gap: 12 }}>
              <button
                type="button"
                onClick={goBackOnboarding}
                disabled={onboardingStep === 1}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: "transparent",
                  color: onboardingStep === 1 ? COLORS.textMuted : COLORS.text,
                  cursor: onboardingStep === 1 ? "default" : "pointer",
                  transition: baseTransition,
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={goNextOnboarding}
                disabled={!canAdvance}
                style={{
                  padding: "12px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: canAdvance ? COLORS.primary : COLORS.surface2,
                  color: canAdvance ? "#FFFFFF" : COLORS.textMuted,
                  cursor: canAdvance ? "pointer" : "default",
                  fontWeight: 600,
                  transition: baseTransition,
                }}
              >
                {onboardingStep === 7 ? "Enter hub" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      </div>
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
            <CalendarAgent events={events} setEvents={setEvents} baseTransition={baseTransition} />
          )}
          {activeNav === "planner" && (
            <PlannerScreen
              profile={profile}
              wardrobe={wardrobe}
              agentActivity={agentActivity}
              agentInsights={agentInsights}
              handlers={{
                PlannerAgent,
                events,
                setEvents,
                setActiveNav,
                baseTransition,
              }}
            />
          )}
          {activeNav === "shopper" && (
            <ShopperAgent
              profile={profile}
              wardrobe={wardrobe}
              baseTransition={baseTransition}
            />
          )}
          {activeNav === "designer" && (
            <DesignerScreen
              profile={profile}
              wardrobe={wardrobe}
              agentActivity={agentActivity}
              agentInsights={agentInsights}
              handlers={{ DesignerAgent, baseTransition }}
            />
          )}
          {activeNav === "evaluator" && (
            <EvaluatorScreen
              profile={profile}
              wardrobe={wardrobe}
              agentActivity={agentActivity}
              agentInsights={agentInsights}
              handlers={{ EvaluatorAgent, baseTransition, setAgentInsights }}
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
            <ProfileEditor
              initial={profile}
              onSave={(next) => {
                setDraft(next);
                persistProfile(next);
              }}
              baseTransition={baseTransition}
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

const CAL_OCCASION_TYPES = [
  "Casual",
  "Work",
  "Wedding",
  "Gala",
  "Party",
  "Interview",
  "Travel",
  "Sport",
  "Other",
];

const CAL_DRESS_CODES = [
  "No dress code",
  "Smart casual",
  "Business casual",
  "Business formal",
  "Black tie",
  "Cocktail",
  "Themed",
  "Sporty",
];

function formatDisplayDate(ymd) {
  if (!ymd || typeof ymd !== "string") return "";
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function daysRelativeLabel(ymd) {
  if (!ymd || typeof ymd !== "string") return "";
  const today = new Date(`${todayYmdLocal()}T12:00:00`);
  const t = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(t.getTime())) return "";
  const diff = Math.round((t - today) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 1) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

function emptyEventForm() {
  return {
    title: "",
    date: "",
    occasionType: CAL_OCCASION_TYPES[0],
    dressCode: CAL_DRESS_CODES[0],
    location: "",
    notes: "",
  };
}

function CalendarAgent({ events, setEvents, baseTransition }) {
  const [form, setForm] = useState(emptyEventForm);
  const [editingId, setEditingId] = useState(null);
  const [pastOpen, setPastOpen] = useState(false);

  const today = todayYmdLocal();
  const sortedUpcoming = useMemo(() => {
    return [...events]
      .filter((e) => e && typeof e.date === "string" && e.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [events, today]);

  const sortedPast = useMemo(() => {
    return [...events]
      .filter((e) => e && typeof e.date === "string" && e.date < today)
      .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  }, [events, today]);

  const startNew = () => {
    setEditingId(null);
    setForm(emptyEventForm());
  };

  const startEdit = (ev) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title || "",
      date: ev.date || "",
      occasionType: ev.occasionType || CAL_OCCASION_TYPES[0],
      dressCode: ev.dressCode || CAL_DRESS_CODES[0],
      location: ev.location || "",
      notes: ev.notes || "",
    });
  };

  const saveEvent = () => {
    const title = form.title.trim();
    const date = form.date;
    if (!title || !date) return;
    const createdAt = new Date().toISOString();
    if (editingId) {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === editingId
            ? {
                ...e,
                title,
                date,
                occasionType: form.occasionType,
                dressCode: form.dressCode,
                location: form.location.trim(),
                notes: form.notes,
              }
            : e
        )
      );
    } else {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      setEvents((prev) => [
        ...prev,
        {
          id,
          title,
          date,
          occasionType: form.occasionType,
          dressCode: form.dressCode,
          location: form.location.trim(),
          notes: form.notes,
          createdAt,
        },
      ]);
    }
    startNew();
  };

  const deleteEvent = (id) => {
    if (!window.confirm("Delete this event?")) return;
    setEvents((prev) => prev.filter((e) => e.id !== id));
    if (editingId === id) startNew();
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.surface2,
    color: COLORS.text,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "0.9rem",
  };

  const labelStyle = { display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 6 };

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
        Calendar
      </h2>
      <p style={{ color: COLORS.textMuted, margin: "0 0 24px", fontSize: "0.9rem" }}>Plan outfits around your schedule.</p>

      <div
        style={{
          background: COLORS.surface,
          borderRadius: 12,
          padding: 24,
          border: `1px solid ${COLORS.border}`,
          marginBottom: 28,
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "1.2rem",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {editingId ? "Edit event" : "Add event"}
        </div>
        <label style={labelStyle}>Title *</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          style={{ ...inputStyle, marginBottom: 14 }}
        />
        <label style={labelStyle}>Date *</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          style={{ ...inputStyle, marginBottom: 14 }}
        />
        <label style={labelStyle}>Occasion type</label>
        <select
          value={form.occasionType}
          onChange={(e) => setForm((f) => ({ ...f, occasionType: e.target.value }))}
          style={{ ...inputStyle, marginBottom: 14, cursor: "pointer" }}
        >
          {CAL_OCCASION_TYPES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <label style={labelStyle}>Dress code</label>
        <select
          value={form.dressCode}
          onChange={(e) => setForm((f) => ({ ...f, dressCode: e.target.value }))}
          style={{ ...inputStyle, marginBottom: 14, cursor: "pointer" }}
        >
          {CAL_DRESS_CODES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <label style={labelStyle}>Location</label>
        <input
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          placeholder="Optional"
          style={{ ...inputStyle, marginBottom: 14 }}
        />
        <label style={labelStyle}>Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          style={{ ...inputStyle, marginBottom: 16, resize: "vertical", minHeight: 72 }}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={saveEvent}
            disabled={!form.title.trim() || !form.date}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: form.title.trim() && form.date ? COLORS.primary : COLORS.border,
              color: "#FFFFFF",
              fontWeight: 600,
              cursor: form.title.trim() && form.date ? "pointer" : "default",
              transition: baseTransition,
            }}
          >
            {editingId ? "Save changes" : "Add event"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={startNew}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: "transparent",
                color: COLORS.text,
                cursor: "pointer",
                transition: baseTransition,
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.25rem",
          fontWeight: 600,
          marginBottom: 16,
        }}
      >
        Upcoming
      </div>
      {sortedUpcoming.length === 0 ? (
        <p style={{ color: COLORS.textMuted }}>No upcoming events.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
          {sortedUpcoming.map((ev) => (
            <div
              key={ev.id}
              style={{
                background: COLORS.surface2,
                borderRadius: 12,
                padding: 16,
                border: `1px solid ${COLORS.border}`,
                transition: baseTransition,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "1.05rem", marginBottom: 6 }}>{ev.title}</div>
                  <div style={{ color: COLORS.textMuted, fontSize: "0.85rem", marginBottom: 8 }}>
                    {formatDisplayDate(ev.date)} · <span style={{ color: COLORS.text }}>{daysRelativeLabel(ev.date)}</span>
                  </div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: COLORS.primarySoft,
                      color: COLORS.primary,
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      marginRight: 8,
                      marginBottom: 6,
                    }}
                  >
                    {ev.occasionType}
                  </span>
                  <div style={{ fontSize: "0.82rem", color: COLORS.textMuted }}>{ev.dressCode}</div>
                  {ev.location ? (
                    <div style={{ fontSize: "0.82rem", color: COLORS.textMuted, marginTop: 6 }}>📍 {ev.location}</div>
                  ) : null}
                  {ev.notes ? (
                    <div style={{ fontSize: "0.8rem", color: COLORS.textMuted, marginTop: 8, lineHeight: 1.5 }}>{ev.notes}</div>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => startEdit(ev)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: `1px solid ${COLORS.border}`,
                      background: COLORS.surface,
                      color: COLORS.text,
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      transition: baseTransition,
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEvent(ev.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: `1px solid rgba(232,160,160,0.35)`,
                      background: "transparent",
                      color: "#e8a0a0",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      transition: baseTransition,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setPastOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "12px 16px",
          borderRadius: 10,
          border: `1px solid ${COLORS.border}`,
          background: COLORS.surface,
          color: COLORS.text,
          cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "0.85rem",
          marginBottom: 12,
          transition: baseTransition,
        }}
      >
        <span>{pastOpen ? "▼" : "▶"}</span>
        Past events {sortedPast.length > 0 ? `(${sortedPast.length})` : ""}
      </button>
      {pastOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sortedPast.length === 0 ? (
            <p style={{ color: COLORS.textMuted, fontSize: "0.9rem" }}>No past events.</p>
          ) : (
            sortedPast.map((ev) => (
              <div
                key={ev.id}
                style={{
                  background: COLORS.surface2,
                  borderRadius: 12,
                  padding: 16,
                  border: `1px solid ${COLORS.border}`,
                  opacity: 0.92,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{ev.title}</div>
                    <div style={{ color: COLORS.textMuted, fontSize: "0.85rem" }}>
                      {formatDisplayDate(ev.date)} · {daysRelativeLabel(ev.date)}
                    </div>
                    <div style={{ fontSize: "0.82rem", color: COLORS.textMuted, marginTop: 6 }}>
                      {ev.occasionType} · {ev.dressCode}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => startEdit(ev)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.surface,
                        color: COLORS.text,
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        transition: baseTransition,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEvent(ev.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid rgba(232,160,160,0.35)`,
                        background: "transparent",
                        color: "#e8a0a0",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        transition: baseTransition,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function buildProfileSummary(p) {
  if (!p) return "Not provided.";
  const lines = [
    `Name: ${p.name || "—"}`,
    `Gender: ${p.gender || "—"}`,
    `Body type: ${
      Array.isArray(p.bodyType)
        ? p.bodyType.length
          ? p.bodyType.join(", ")
          : "—"
        : p.bodyType || "—"
    }`,
    `Budget: ${p.budget || "—"}`,
    `Styles: ${Array.isArray(p.styles) && p.styles.length ? p.styles.join(", ") : "—"}`,
    `Brands: ${Array.isArray(p.brands) && p.brands.length ? p.brands.join(", ") : "—"}`,
    `Sizes: top ${p.topSize || "—"}, bottom ${p.bottomSize || "—"}, shoe ${p.shoeSize || "—"}`,
  ];
  return lines.join("\n");
}

function buildCleanWardrobeList(items) {
  const clean = [...items.filter((it) => it.laundryStatus === "clean")].sort(compareCleanItemsByPriorityCPW);
  if (clean.length === 0) return "";
  return clean
    .map((it, i) => {
      const pp = getPurchasePriceNum(it);
      const wc = getTimesWorn(it);
      const cpw = calculateCPW(pp, wc);
      const cpwHint = pp > 0 ? ` · CPW $${cpw.toFixed(2)} (priority ${i + 1})` : "";
      return `- ${it.name} (${it.category}): ${it.color}, style: ${it.style || "—"}, season: ${it.season || "—"}${cpwHint}`;
    })
    .join("\n");
}

function buildFullWardrobeList(items) {
  if (!items || items.length === 0) return "(empty)";
  return items
    .map((it) => {
      const laundry =
        it.laundryStatus === "dirty" ? "dirty" : it.laundryStatus === "wash" ? "in wash" : "clean";
      return `- ${it.name} (${it.category}): ${it.color}, style: ${it.style || "—"}, laundry: ${laundry}`;
    })
    .join("\n");
}

function extractJsonArraySlice(s) {
  const start = s.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let q = "";
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === q) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      q = c;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function parseDesignerOutfitsJson(text) {
  let s = (text || "").trim();
  if (!s) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i;
  const fm = s.match(fence);
  if (fm) s = fm[1].trim();
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }
  const slice = extractJsonArraySlice(s);
  if (slice) {
    try {
      const parsed = JSON.parse(slice);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function parseEvaluatorJson(text) {
  let s = (text || "").trim();
  if (!s) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i;
  const fm = s.match(fence);
  if (fm) s = fm[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }
  const slice = extractJsonObjectSlice(s);
  if (slice) {
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
  return null;
}

function parseGapAnalysisGaps(text) {
  const data = parseEvaluatorJson(text);
  if (!data || typeof data !== "object") return null;
  const gaps = Array.isArray(data.gaps) ? data.gaps : Array.isArray(data) ? data : null;
  if (!gaps) return null;
  const out = [];
  for (const g of gaps) {
    if (!g || typeof g !== "object") continue;
    const name = String(g.name ?? g.item_name ?? "").trim();
    const reason = String(g.reason ?? "").trim();
    const impact = String(g.impact ?? "").trim();
    if (!name) continue;
    out.push({ name, reason, impact });
  }
  return out.length ? out : null;
}

function parsePlannerResponse(text) {
  const data = parseEvaluatorJson(text);
  if (!data || typeof data !== "object") return null;
  const primary = data.primary_outfit || data.main_outfit || data.primary;
  if (!primary || typeof primary !== "object") return null;
  const name = String(primary.name || primary.title || "").trim();
  const items = Array.isArray(primary.items) ? primary.items.map((x) => String(x).trim()).filter(Boolean) : [];
  const why = String(primary.why || primary.rationale || "").trim();
  const altRaw = data.alternate_outfit ?? data.alternative_outfit ?? data.alternative ?? null;
  let alternate = null;
  if (altRaw && typeof altRaw === "object") {
    const an = String(altRaw.name || altRaw.title || "").trim();
    const ai = Array.isArray(altRaw.items) ? altRaw.items.map((x) => String(x).trim()).filter(Boolean) : [];
    const aw = String(altRaw.why || altRaw.rationale || "").trim();
    if (an || ai.length || aw) alternate = { name: an, items: ai, why: aw };
  }
  return { name: name || "Outfit", items, why, alternate };
}

function parseShopperRecommendations(text) {
  const data = parseEvaluatorJson(text);
  if (!data || typeof data !== "object") return null;
  const recs = Array.isArray(data.recommendations) ? data.recommendations : null;
  if (!recs) return null;
  const out = [];
  for (const r of recs) {
    if (!r || typeof r !== "object") continue;
    const item = String(r.item ?? r.name ?? "").trim();
    if (!item) continue;
    const n = r.outfits_unlocked;
    const outfits =
      typeof n === "number" && !Number.isNaN(n)
        ? n
        : Number.parseInt(String(n ?? ""), 10);
    out.push({
      item,
      price_range: String(r.price_range ?? r.price ?? "").trim(),
      why_it_matters: String(r.why_it_matters ?? r.why ?? "").trim(),
      outfits_unlocked: Number.isFinite(outfits) ? outfits : 0,
    });
  }
  return out.length ? out : null;
}

function normalizeEvaluatorResult(raw) {
  if (!raw || typeof raw !== "object") return null;
  const scoreObj = raw.score && typeof raw.score === "object" ? raw.score : {};
  const clip = (v) => {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isNaN(n)) return 0;
    return Math.min(10, Math.max(0, n));
  };
  const strengths = Array.isArray(raw.strengths) ? raw.strengths.map(String) : [];
  const improvements = Array.isArray(raw.improvements) ? raw.improvements.map(String) : [];
  let verdict = String(raw.verdict || "").trim();
  if (verdict === "NEEDS_WORK") verdict = "NEEDS WORK";
  if (!["APPROVED", "NEEDS WORK", "RECONSIDER"].includes(verdict)) verdict = "NEEDS WORK";
  const stylist_note =
    typeof raw.stylist_note === "string"
      ? raw.stylist_note
      : typeof raw.stylistNote === "string"
        ? raw.stylistNote
        : "";
  return {
    score: {
      fit: clip(scoreObj.fit),
      color: clip(scoreObj.color),
      style: clip(scoreObj.style),
      occasion: clip(scoreObj.occasion),
      overall: clip(scoreObj.overall),
    },
    verdict,
    strengths,
    improvements,
    stylist_note,
  };
}

function anthropicTextFromMessage(data) {
  const content = data?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
}

async function callAnthropicWithWebSearch(system, userText) {
  const agentRunStartedAt = agentTraceHooks.startAgentRun("Shopper Agent", "Search shopping recommendations");
  try {
    const creds = resolveVisionCredentials();
    if (!creds || creds.provider !== "anthropic") {
      throw new Error(
        "Shopping Agent requires an Anthropic API key (web search is not available when using OpenAI only)."
      );
    }
    const body = {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userText }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
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
    const out = anthropicTextFromMessage(data);
    agentTraceHooks.finishAgentRun("Shopper Agent", "Search shopping recommendations", agentRunStartedAt, {
      status: "success",
    });
    return out;
  } catch (error) {
    agentTraceHooks.failAgentRun("Shopper Agent", "Search shopping recommendations", agentRunStartedAt, error);
    throw error;
  }
}

async function callShoppingAssistant(system, userText) {
  const creds = resolveVisionCredentials();
  if (!creds) {
    throw new Error("This feature isn’t available right now. Please try again later.");
  }
  if (creds.provider === "anthropic") {
    return callAnthropicWithWebSearch(system, userText);
  }
  const systemOpenAI = `${system}

Note: Live web search is not available with your current API setup. Use general knowledge of retailers, styles, and typical price ranges. Mark prices as approximate and suggest the user verify on official store sites.`;
  return runAgent({
    agentName: "Shopper Agent",
    task: "Search shopping recommendations",
    systemPrompt: systemOpenAI,
    userPrompt: userText,
  });
}

async function evaluateOutfitWithVision(base64, mediaType, profile) {
  const agentRunStartedAt = agentTraceHooks.startAgentRun("Evaluator Agent", "Evaluate outfit");
  try {
  const profileSummary = buildProfileSummary(profile);
  const system = `You are a strict but constructive fashion evaluator.
User profile: ${profileSummary}.
Evaluate this outfit from the photo across five dimensions (each score 0-10): fit, color harmony, style cohesion, occasion appropriateness, and an overall impression.

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

  const creds = resolveVisionCredentials();
  if (!creds) {
    throw new Error(
      "No AI key: set REACT_APP_ANTHROPIC_API_KEY or REACT_APP_OPENAI_API_KEY (or OPENAI_API_KEY / OPEN_AI_KEY)."
    );
  }

  if (creds.provider === "anthropic") {
    const body = {
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system,
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
              text: "Evaluate this outfit from the photo. Reply with one raw JSON object only (same schema as the system prompt). No other text.",
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
    const text = anthropicTextFromMessage(data);
    const outAnthropic = String(text || "").trim();
    agentTraceHooks.finishAgentRun("Evaluator Agent", "Evaluate outfit", agentRunStartedAt, { status: "success" });
    return outAnthropic;
  }

  const dataUrl = `data:${mediaType};base64,${base64}`;
  const body = {
    model: OPENAI_VISION_MODEL,
    max_tokens: 2048,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: "Evaluate this outfit from the photo. Reply with one raw JSON object only." },
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
  const outOpenai = String(data?.choices?.[0]?.message?.content || "").trim();
  agentTraceHooks.finishAgentRun("Evaluator Agent", "Evaluate outfit", agentRunStartedAt, { status: "success" });
  return outOpenai;
  } catch (error) {
    agentTraceHooks.failAgentRun("Evaluator Agent", "Evaluate outfit", agentRunStartedAt, error);
    throw error;
  }
}

function PlannerAgent({ profile, wardrobe, events, setActiveNav, baseTransition, agentInsights }) {
  const [mode, setMode] = useState("everyday");
  const [occasion, setOccasion] = useState("");
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [plannerPlan, setPlannerPlan] = useState(null);
  const [error, setError] = useState("");
  const [matchedItems, setMatchedItems] = useState([]);

  const fetchWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError("");
    try {
      if (!navigator.geolocation) {
        setWeatherError("Geolocation is not supported in this browser.");
        setWeatherLoading(false);
        return;
      }

      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          timeout: 15000,
          maximumAge: 300000,
          enableHighAccuracy: false,
        })
      );
      const { latitude, longitude } = pos.coords;

      let city = "near you";
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
          {
            headers: {
              Accept: "application/json",
              "User-Agent": "FashionOS/1.0 (local wardrobe app)",
            },
          }
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          city =
            geoData.address?.city ||
            geoData.address?.town ||
            geoData.address?.village ||
            geoData.address?.suburb ||
            geoData.address?.municipality ||
            city;
        }
      } catch {
        /* Nominatim often blocks browser CORS; weather still works without a place name */
      }

      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,windspeed_10m&temperature_unit=celsius`
      );
      if (!weatherRes.ok) throw new Error("weather http");
      const weatherData = await weatherRes.json();
      const current = weatherData.current;
      if (!current || current.temperature_2m == null) throw new Error("no weather");

      const weatherCodes = {
        0: "clear sky",
        1: "mainly clear",
        2: "partly cloudy",
        3: "overcast",
        45: "foggy",
        48: "icy fog",
        51: "light drizzle",
        53: "drizzle",
        55: "heavy drizzle",
        61: "light rain",
        63: "rain",
        65: "heavy rain",
        71: "light snow",
        73: "snow",
        75: "heavy snow",
        80: "rain showers",
        81: "heavy showers",
        82: "violent showers",
        95: "thunderstorm",
      };

      const condition = weatherCodes[current.weathercode] || "mixed conditions";
      const temp = Math.round(current.temperature_2m);

      setWeather({
        city,
        temp,
        condition,
        summary: `${temp}°C, ${condition} in ${city}`,
      });
    } catch (e) {
      const code = e && typeof e.code === "number" ? e.code : null;
      if (code === 1) {
        setWeatherError(
          "Location access denied. In your browser, allow location for this site (lock icon in the address bar), then tap Refresh."
        );
      } else if (code === 2) {
        setWeatherError("Location unavailable. Turn on device location services and try Refresh.");
      } else if (code === 3) {
        setWeatherError("Location timed out. Tap Refresh or move to an area with a clearer signal.");
      } else {
        setWeatherError("Could not load weather. Check your connection and tap Refresh.");
      }
    }
    setWeatherLoading(false);
  }, []);

  useEffect(() => {
    void fetchWeather();
  }, [fetchWeather]);

  const today = todayYmdLocal();
  const upcomingSorted = useMemo(() => {
    return [...events]
      .filter((e) => e && typeof e.date === "string" && e.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [events, today]);

  const selectedEvent = useMemo(
    () => upcomingSorted.find((e) => e.id === selectedEventId) || null,
    [upcomingSorted, selectedEventId]
  );

  const cleanItems = useMemo(() => {
    const clean = wardrobe.filter((it) => it.laundryStatus === "clean");
    return [...clean].sort(compareCleanItemsByPriorityCPW);
  }, [wardrobe]);

  const plannerAgentInsightsBlock = useMemo(() => {
    const a = agentInsights || {};
    const fi = Array.isArray(a.frequentIssues) ? a.frequentIssues : [];
    const ps = Array.isArray(a.preferredStyles) ? a.preferredStyles : [];
    const av = Array.isArray(a.avoidedItems) ? a.avoidedItems : [];
    return [
      fi.length ? `Repeated issues:\n${fi.map((x, i) => `${i + 1}. ${x}`).join("\n")}` : "",
      ps.length ? `Preferred styles: ${ps.join(", ")}` : "",
      av.length ? `Avoid: ${av.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n") || "(none yet)";
  }, [agentInsights]);

  const resetPlan = () => {
    setResult("");
    setPlannerPlan(null);
    setError("");
    setMatchedItems([]);
  };

  const planOutfit = async () => {
    setError("");
    setResult("");
    if (wardrobe.length === 0) {
      setError("Add clothes to your wardrobe first");
      return;
    }
    if (wardrobe.length > 0 && cleanItems.length === 0) {
      setError("All your clothes are dirty or in the wash!");
      return;
    }
    if (mode === "everyday" && !occasion.trim()) {
      setError("Describe the occasion or context.");
      return;
    }
    if (mode === "event" && !selectedEvent) {
      setError("Select an upcoming event.");
      return;
    }

    const profileSummary = buildProfileSummary(profile);
    const wardrobeItems = buildCleanWardrobeList(cleanItems);
    const weatherBlock = weather ? weather.summary : "Unknown — assume mild, layer-friendly conditions.";
    const eventsBlock = upcomingSorted.length
      ? upcomingSorted
          .slice(0, 12)
          .map(
            (e) =>
              `- ${e.title} (${e.date}) · ${e.occasionType} · ${e.dressCode}${e.location ? ` · ${e.location}` : ""}`
          )
          .join("\n")
      : "(no upcoming events)";

    let occasionText = "";
    if (mode === "everyday") {
      occasionText = occasion.trim();
    } else if (selectedEvent) {
      occasionText = `Event "${selectedEvent.title}" on ${formatDisplayDate(selectedEvent.date)} (${daysRelativeLabel(selectedEvent.date)}). Occasion: ${selectedEvent.occasionType}. Dress code: ${selectedEvent.dressCode}.`;
      if (selectedEvent.location) occasionText += ` Location: ${selectedEvent.location}.`;
      if (selectedEvent.notes) occasionText += ` Notes: ${selectedEvent.notes}`;
      occasionText += " The outfit must respect the stated dress code.";
    }

    const system = `You are a personal fashion stylist.
Suggest ONE high-confidence outfit that avoids past mistakes.

Weather:
${weatherBlock}

Upcoming events:
${eventsBlock}

User profile:
${profileSummary}

Agent insights:
${plannerAgentInsightsBlock}

Wardrobe items (clean pieces only — use exact names from this list). Items are ordered by cost-per-wear priority (highest CPW first): prefer including these when they fit the occasion so the wearer gets more value from expensive, under-worn pieces.
${wardrobeItems}

Occasion / context:
${occasionText}

Respond with ONLY valid JSON (no markdown):
{
  "primary_outfit": {
    "name": "short title",
    "items": ["names exactly as in wardrobe list"],
    "why": "one line"
  },
  "alternate_outfit": null
}

Set alternate_outfit to a second option only if clearly useful; otherwise null.`;

    const user = "Return the JSON outfit plan now.";

    setLoading(true);
    try {
      const text = await runAgent({
        agentName: "Planner Agent",
        task: "Plan outfit",
        systemPrompt: system,
        userPrompt: user,
      });
      setResult(text);
      const parsed = parsePlannerResponse(text);
      setPlannerPlan(parsed);
      if (parsed) {
        const primaryText = [parsed.name, ...parsed.items, parsed.why].join(" ");
        const altText = parsed.alternate
          ? [parsed.alternate.name, ...parsed.alternate.items, parsed.alternate.why].join(" ")
          : "";
        setMatchedItems(matchOutfitItems(primaryText + altText, cleanItems));
      } else {
        setMatchedItems(matchOutfitItems(text, cleanItems));
      }
    } catch (e) {
      setError(e.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  function matchOutfitItems(responseText, wardrobe) {
    return wardrobe.filter((item) =>
      responseText.toLowerCase().includes(item.name.toLowerCase())
    );
  }

  const pill = (id, label) => {
    const on = mode === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          setMode(id);
          resetPlan();
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
    <div style={{ maxWidth: 640 }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.75rem",
          fontWeight: 600,
          margin: "0 0 8px",
        }}
      >
        Planner
      </h2>
      <p style={{ color: COLORS.textMuted, margin: "0 0 20px", fontSize: "0.9rem" }}>
        One main look, optional alternative — uses weather, events, wardrobe, and your insights.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {pill("everyday", "Everyday")}
        {pill("event", "For an Event")}
      </div>

      {wardrobe.length === 0 && (
        <p style={{ color: COLORS.textMuted, marginBottom: 16 }}>Add clothes to your wardrobe first</p>
      )}
      {wardrobe.length > 0 && cleanItems.length === 0 && (
        <p style={{ color: COLORS.textMuted, marginBottom: 16 }}>All your clothes are dirty or in the wash!</p>
      )}

      {mode === "everyday" && (
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 24,
            border: `1px solid ${COLORS.border}`,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              background: COLORS.surface2,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: COLORS.textMuted,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Current Weather
              </div>
              {weatherLoading && (
                <div style={{ color: COLORS.textMuted, fontSize: "0.85rem" }}>Detecting location...</div>
              )}
              {weather && !weatherLoading && (
                <div
                  style={{
                    color: COLORS.text,
                    fontSize: "0.95rem",
                    fontWeight: 500,
                  }}
                >
                  {weather.summary}
                </div>
              )}
              {weatherError && (
                <div style={{ color: "#e8a0a0", fontSize: "0.8rem" }}>{weatherError}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void fetchWeather()}
              disabled={weatherLoading}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: "6px 12px",
                cursor: weatherLoading ? "default" : "pointer",
                color: COLORS.textMuted,
                fontSize: "0.75rem",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              ↻ Refresh
            </button>
          </div>
          <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 6 }}>
            Occasion / context
          </label>
          <input
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            placeholder="e.g. casual Friday, grocery run, gym session"
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
          />
        </div>
      )}

      {mode === "event" && (
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 24,
            border: `1px solid ${COLORS.border}`,
            marginBottom: 20,
          }}
        >
          {upcomingSorted.length === 0 ? (
            <p style={{ color: COLORS.textMuted, margin: 0, lineHeight: 1.6 }}>
              No upcoming events. Add one in the Calendar first.{" "}
              <button
                type="button"
                onClick={() => setActiveNav("calendar")}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: COLORS.primary,
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "inherit",
                }}
              >
                Open Calendar
              </button>
            </p>
          ) : (
            <>
              <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 6 }}>
                Upcoming event
              </label>
              <select
                value={selectedEventId}
                onChange={(e) => {
                  setSelectedEventId(e.target.value);
                  resetPlan();
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface2,
                  color: COLORS.text,
                  marginBottom: 16,
                  cursor: "pointer",
                }}
              >
                <option value="">Select an event…</option>
                {upcomingSorted.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} — {ev.date}
                  </option>
                ))}
              </select>
              {selectedEvent && (
                <div
                  style={{
                    background: COLORS.surface2,
                    borderRadius: 10,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: "0.88rem",
                    color: COLORS.textMuted,
                    lineHeight: 1.6,
                  }}
                >
                  <div style={{ color: COLORS.text, fontWeight: 600, marginBottom: 8 }}>{selectedEvent.title}</div>
                  <div>
                    {formatDisplayDate(selectedEvent.date)} · {daysRelativeLabel(selectedEvent.date)}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {selectedEvent.occasionType} · {selectedEvent.dressCode}
                  </div>
                  {selectedEvent.location ? <div style={{ marginTop: 6 }}>📍 {selectedEvent.location}</div> : null}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!result && (
        <button
          type="button"
          onClick={planOutfit}
          disabled={
            loading ||
            wardrobe.length === 0 ||
            cleanItems.length === 0 ||
            (mode === "everyday" && !occasion.trim()) ||
            (mode === "event" && (upcomingSorted.length === 0 || !selectedEventId))
          }
          style={{
            padding: "12px 24px",
            borderRadius: 8,
            border: "none",
            background:
              loading ||
              wardrobe.length === 0 ||
              cleanItems.length === 0 ||
              (mode === "everyday" && !occasion.trim()) ||
              (mode === "event" && (upcomingSorted.length === 0 || !selectedEventId))
                ? COLORS.border
                : COLORS.primary,
            color: "#FFFFFF",
            fontWeight: 600,
            cursor:
              loading ||
              wardrobe.length === 0 ||
              cleanItems.length === 0 ||
              (mode === "everyday" && !occasion.trim()) ||
              (mode === "event" && (upcomingSorted.length === 0 || !selectedEventId))
                ? "default"
                : "pointer",
            marginBottom: 20,
            transition: baseTransition,
          }}
        >
          {loading ? "Planning…" : "Plan my outfit"}
        </button>
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
          <span style={{ color: COLORS.textMuted }}>Stylist is thinking…</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: COLORS.primarySoft,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
            marginBottom: 16,
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 8 }}>
          {plannerPlan ? (
            <>
              <div style={mergeStyles(ui.panel, { padding: "20px 22px", marginBottom: plannerPlan.alternate ? 14 : 16 })}>
                <div style={type.meta}>Main outfit</div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: "1.35rem",
                    fontWeight: 600,
                    marginTop: 6,
                    marginBottom: 12,
                    color: COLORS.text,
                  }}
                >
                  {plannerPlan.name}
                </div>
                {plannerPlan.items.length > 0 ? (
                  <ul style={{ margin: "0 0 12px", paddingLeft: 18, color: COLORS.text, fontSize: "0.9rem", lineHeight: 1.5 }}>
                    {plannerPlan.items.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {plannerPlan.why ? (
                  <div style={{ fontSize: "0.88rem", color: COLORS.textMuted, lineHeight: 1.55 }}>{plannerPlan.why}</div>
                ) : null}
                {matchedItems.filter((it) =>
                  plannerPlan.items.some((label) => String(label).toLowerCase().includes(it.name.toLowerCase()))
                ).length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                    {matchedItems
                      .filter((it) =>
                        plannerPlan.items.some((label) =>
                          String(label).toLowerCase().includes(it.name.toLowerCase())
                        )
                      )
                      .map((item) => (
                        <div
                          key={item.id}
                          style={{
                            width: 56,
                            height: 68,
                            borderRadius: 8,
                            overflow: "hidden",
                            border: `1px solid ${COLORS.border}`,
                            background: COLORS.surface2,
                          }}
                        >
                          {item.imagePreview ? (
                            <img src={item.imagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                              👗
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
              {plannerPlan.alternate ? (
                <div style={mergeStyles(ui.panel, { padding: "18px 20px", marginBottom: 16, opacity: 0.95 })}>
                  <div style={type.meta}>Alternative</div>
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: "1.15rem",
                      fontWeight: 600,
                      marginTop: 6,
                      marginBottom: 10,
                      color: COLORS.text,
                    }}
                  >
                    {plannerPlan.alternate.name || "Option B"}
                  </div>
                  {plannerPlan.alternate.items.length > 0 ? (
                    <ul style={{ margin: "0 0 10px", paddingLeft: 18, color: COLORS.text, fontSize: "0.88rem", lineHeight: 1.45 }}>
                      {plannerPlan.alternate.items.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  {plannerPlan.alternate.why ? (
                    <div style={{ fontSize: "0.85rem", color: COLORS.textMuted, lineHeight: 1.5 }}>{plannerPlan.alternate.why}</div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div
              style={{
                background: COLORS.surface2,
                borderRadius: 12,
                padding: 20,
                border: `1px solid ${COLORS.border}`,
                whiteSpace: "pre-wrap",
                fontSize: "0.9rem",
                lineHeight: 1.6,
                color: COLORS.text,
                marginBottom: 16,
              }}
            >
              {result}
            </div>
          )}
          <button
            type="button"
            onClick={resetPlan}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surface,
              color: COLORS.text,
              cursor: "pointer",
              fontWeight: 600,
              transition: baseTransition,
            }}
          >
            Plan another
          </button>
        </div>
      )}
    </div>
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

function DesignerAgent({ profile, wardrobe, baseTransition }) {
  const [styleDirection, setStyleDirection] = useState(DESIGNER_STYLE_DIRECTIONS[0]);
  const [mood, setMood] = useState(DESIGNER_MOODS[0]);
  const [loading, setLoading] = useState(false);
  const [outfits, setOutfits] = useState(null);
  const [rawFallback, setRawFallback] = useState("");
  const [error, setError] = useState("");

  const run = async () => {
    setError("");
    setOutfits(null);
    setRawFallback("");
    const profileSummary = buildProfileSummary(profile);
    const wardrobeList = buildFullWardrobeList(wardrobe);
    const system =
      "You are a visionary fashion designer AI with a sharp editorial eye. " +
      `The user's profile: ${profileSummary}.\n` +
      `Their wardrobe: ${wardrobeList}\n` +
      `Create 3 complete outfit combinations in the '${styleDirection}' style with a '${mood}' mood.\n` +
      "For each outfit provide:\n" +
      "1. Creative outfit name\n" +
      "2. Exact items to wear (only from their wardrobe)\n" +
      "3. Styling logic (color theory, silhouette, proportions)\n" +
      "4. Color harmony note\n" +
      "5. A celebrity or style icon who would wear this\n" +
      "Be bold, specific, and inspiring.";
    const user =
      "Respond with ONLY a JSON array (no markdown) of exactly 3 objects. Each object must have: outfitName (string), items (array of strings), stylingLogic (string), colorHarmony (string), styleIcon (string). No other text.";
    setLoading(true);
    try {
      const text = await runAgent({
        agentName: "Designer Agent",
        task: "Generate outfit combinations",
        systemPrompt: system,
        userPrompt: user,
      });
      const parsed = parseDesignerOutfitsJson(text);
      if (parsed && parsed.length) setOutfits(parsed.slice(0, 3));
      else {
        setRawFallback(text);
      }
    } catch (e) {
      setError(e.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.75rem",
          fontWeight: 600,
          margin: "0 0 8px",
        }}
      >
        Style Designer
      </h2>
      <p style={{ color: COLORS.textMuted, margin: "0 0 20px", fontSize: "0.9rem" }}>
        Three editorial looks from your closet — direction and mood, then generate.
      </p>

      {wardrobe.length === 0 && (
        <p style={{ color: COLORS.textMuted, marginBottom: 20 }}>
          Your wardrobe is empty. Add pieces in Wardrobe before generating looks.
        </p>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 20,
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: COLORS.textMuted,
              marginBottom: 8,
            }}
          >
            Style direction
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DESIGNER_STYLE_DIRECTIONS.map((d) => {
              const on = styleDirection === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setStyleDirection(d)}
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
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: COLORS.textMuted,
              marginBottom: 8,
            }}
          >
            Mood
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DESIGNER_MOODS.map((m) => {
              const on = mood === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMood(m)}
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
                  {m}
                </button>
              );
            })}
          </div>
        </div>
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
          marginBottom: 20,
          transition: baseTransition,
        }}
      >
        {loading ? "Generating…" : "Generate Looks"}
      </button>

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
          <span style={{ color: COLORS.textMuted }}>Designing looks…</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: COLORS.primarySoft,
            border: `1px solid ${COLORS.border}`,
            marginBottom: 16,
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      {outfits && outfits.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {outfits.map((o, idx) => (
            <div
              key={idx}
              style={{
                background: COLORS.surface2,
                borderRadius: 12,
                padding: 20,
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: "0.72rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: COLORS.primary,
                }}
              >
                Look {idx + 1}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 600 }}>
                {o.outfitName || "Untitled look"}
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 4 }}>Items to wear</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.88rem", lineHeight: 1.5 }}>
                  {(Array.isArray(o.items) ? o.items : []).map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 4 }}>Styling logic</div>
                <div style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>{o.stylingLogic || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 4 }}>Color harmony</div>
                <div style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>{o.colorHarmony || "—"}</div>
              </div>
              <div
                style={{
                  marginTop: "auto",
                  paddingTop: 8,
                  borderTop: `1px solid ${COLORS.border}`,
                  fontSize: "0.85rem",
                  fontStyle: "italic",
                  color: COLORS.textMuted,
                }}
              >
                Style icon: {o.styleIcon || "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {rawFallback && (
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 20,
            border: `1px solid ${COLORS.border}`,
            whiteSpace: "pre-wrap",
            fontSize: "0.9rem",
            lineHeight: 1.6,
          }}
        >
          {rawFallback}
        </div>
      )}
    </div>
  );
}

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

function EvaluatorAgent({ profile, wardrobe, baseTransition, setAgentInsights }) {
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
    query,
    limit: filters.limit || 10,
    ...(filters.max_price && { max_price: filters.max_price }),
    ...(filters.min_price && { min_price: filters.min_price }),
    ...(filters.ships_to && { ships_to: filters.ships_to }),
  });
  const res = await fetch(`http://localhost:3001/api/shopify/search?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

async function getShopifyProductDetails(upid) {
  const res = await fetch(`http://localhost:3001/api/shopify/product/${upid}`);
  if (!res.ok) throw new Error(`Product lookup failed: ${res.status}`);
  return res.json();
}

function ShopperAgent({ profile, wardrobe, baseTransition }) {
  const [view, setView] = useState("chat"); // "chat" | "wishlist"
  const [messages, setMessages] = useState([]); // { id, role, content, products }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [wishlist, setWishlist] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [error, setError] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [addedId, setAddedId] = useState(null);
  const [showShopLookModal, setShowShopLookModal] = useState(false);
  const [shopLookItems, setShopLookItems] = useState([]);
  const [shoppingMode, setShoppingMode] = useState(() => {
    try {
      return localStorage.getItem("fos_shopping_mode") || "both";
    } catch {
      return "both";
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_WISHLIST);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setWishlist(parsed);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_WISHLIST, JSON.stringify(wishlist));
    } catch {
      // ignore
    }
  }, [wishlist]);

  useEffect(() => {
    try {
      localStorage.setItem("fos_shopping_mode", shoppingMode);
    } catch {
      // ignore
    }
  }, [shoppingMode]);

  const quickPrompts = [
    "White sneakers under $100",
    "Casual summer shirt",
    "Black cargo pants",
    "Minimalist blazer",
    "Running shoes",
  ];

  const normalizeProducts = (json) => {
    const root = json && typeof json === "object" ? json : {};
    const list = Array.isArray(json)
      ? json
      : Array.isArray(root.products)
        ? root.products
        : Array.isArray(root.results)
          ? root.results
          : Array.isArray(root.items)
            ? root.items
            : Array.isArray(root.hits)
              ? root.hits
              : [];
    return list
      .filter(filterQualityProducts)
      .map((p) => {
        const obj = p && typeof p === "object" ? p : {};
        const product = obj.product && typeof obj.product === "object" ? obj.product : obj;
        const upid = product.upid || product.id || obj.upid || obj.id || "";
        const title = product.title || product.name || obj.title || "";
        const productUrl =
          product.url ||
          product.product_url ||
          product.productUrl ||
          product.onlineStoreUrl ||
          product.online_store_url ||
          product.variants?.[0]?.variantUrl ||
          product.variants?.[0]?.checkoutUrl ||
          product.variants?.[0]?.checkout_url ||
          product.variants?.[0]?.shop?.onlineStoreUrl ||
          obj.url ||
          "";
        const storeName =
          product.store?.name ||
          product.store_name ||
          product.merchant?.name ||
          product.shop?.name ||
          product.shopName ||
          product.vendor ||
          obj.store?.name ||
          obj.store_name ||
          "";
        const media = Array.isArray(product.media) ? product.media : Array.isArray(product.images) ? product.images : [];
        const first = media[0] || null;
        const imageUrl =
          (first && (first.url || first.src || first.image_url)) ||
          product.featuredImage?.url ||
          product.image?.url ||
          product.image_url ||
          product.imageUrl ||
          "";
        const minPrice =
          product.price_min ??
          product.min_price ??
          product.priceMin ??
          product.price_range?.min ??
          product.priceRange?.min ??
          product.priceRange?.minVariantPrice?.amount ??
          null;
        const maxPrice =
          product.price_max ??
          product.max_price ??
          product.priceMax ??
          product.price_range?.max ??
          product.priceRange?.max ??
          product.priceRange?.maxVariantPrice?.amount ??
          null;
        const options = Array.isArray(product.options)
          ? product.options
          : Array.isArray(product.attributes)
            ? product.attributes
            : [];
        return { upid, title, productUrl, storeName, imageUrl, minPrice, maxPrice, options, raw: product };
      })
      .filter((p) => p.upid || p.title);
  };

  function filterQualityProducts(product) {
    const allowedCurrencies = ["USD", "CAD", "usd", "cad"];

    if (!product.title || product.title.length < 5) return false;

    const minPrice =
      product.price_range?.min?.amount ??
      product.priceRange?.min?.amount ??
      product.offers?.[0]?.price?.amount ??
      product.variants?.[0]?.price?.amount ??
      null;
    if (minPrice && parseFloat(minPrice) < 5) return false;

    const hasImage =
      product.media?.[0]?.url ||
      product.images?.[0]?.url ||
      product.image?.url;
    if (!hasImage) return false;

    // Filter out non USD/CAD currencies
    const currency =
      product.price_range?.min?.currency ||
      product.price_range?.max?.currency ||
      product.priceRange?.min?.currency ||
      product.priceRange?.max?.currency ||
      product.offers?.[0]?.price?.currency ||
      product.variants?.[0]?.price?.currency ||
      null;

    if (currency && !allowedCurrencies.includes(currency)) {
      return false;
    }

    return true;
  }

  function formatShopifyPrice(priceObj) {
    if (!priceObj) return "";
    if (typeof priceObj === "string") return priceObj;
    if (typeof priceObj === "number") return `$${priceObj.toFixed(2)}`;
    if (typeof priceObj === "object" && priceObj.amount != null) {
      const amount = parseFloat(priceObj.amount);
      const formatted = amount.toFixed(2);
      const currency = priceObj.currency || "USD";
      return `${currency === "USD" ? "$" : currency + " "}${formatted}`;
    }
    return "";
  }

  const formatPriceRange = (p) => {
    if (!p) return "—";
    const min = formatShopifyPrice(p.minPrice);
    const max = formatShopifyPrice(p.maxPrice);
    if (min && max) return `${min}–${max}`;
    if (min) return min;
    if (max) return max;
    return "—";
  };

  const productUrlFromShopify = (product) =>
    product?.url ||
    product?.offers?.[0]?.url ||
    product?.variants?.[0]?.variantUrl ||
    product?.variants?.[0]?.checkoutUrl ||
    product?.variants?.[0]?.checkout_url ||
    product?.variants?.[0]?.shop?.onlineStoreUrl ||
    product?.shops?.[0]?.url ||
    null;

  const shoppingModeKeywords = () => {
    if (shoppingMode === "secondhand") return "secondhand used resale";
    return "";
  };

  const productPriceCents = (p) => {
    const price = p?.minPrice ?? p?.raw?.priceRange?.min ?? p?.raw?.price_range?.min ?? p?.raw?.variants?.[0]?.price;
    if (typeof price === "number") return price;
    if (typeof price === "object" && price?.amount != null) return parseFloat(price.amount);
    return null;
  };

  const isSecondhandProduct = (p) => {
    const product = p?.raw || p;
    if (product?.secondhand === true) return true;
    if (Array.isArray(product?.variants) && product.variants.some((v) => v?.secondhand === true)) return true;
    const cents = productPriceCents(p);
    return cents != null && cents < 500;
  };

  const shoppingBadgeText = (p) => {
    if (shoppingMode === "secondhand") return "♻️ Secondhand";
    if (shoppingMode === "both") return isSecondhandProduct(p) ? "♻️ Secondhand" : "✨ New";
    return "";
  };

  const optionSummary = (p) => {
    const opts = Array.isArray(p?.options) ? p.options : [];
    if (!opts.length) return "";
    const pick = (needle) => opts.find((o) => String(o?.name || "").toLowerCase().includes(needle)) || null;
    const sizeOpt = pick("size");
    const colorOpt = pick("color");
    const parts = [];
    const fmt = (o) => {
      const name = String(o?.name || "").trim();
      const vals = Array.isArray(o?.values) ? o.values : Array.isArray(o?.options) ? o.options : [];
      const preview = vals
        .slice(0, 3)
        .map((v) => (typeof v === "string" ? v : v?.value || v?.name || ""))
        .filter(Boolean)
        .join(", ");
      if (!preview) return "";
      return name ? `${name}: ${preview}` : preview;
    };
    if (sizeOpt) parts.push(fmt(sizeOpt));
    if (colorOpt) parts.push(fmt(colorOpt));
    if (!parts.filter(Boolean).length) {
      parts.push(fmt(opts[0]));
      if (opts[1]) parts.push(fmt(opts[1]));
    }
    return parts.filter(Boolean).slice(0, 2).join(" • ");
  };

  const addToWishlist = (p) => {
    if (!p) return;
    const item = {
      id: p.upid || Date.now(),
      title: String(p.title || "").trim(),
      price: formatPriceRange(p),
      store: p.storeName || "—",
      imageUrl: p.imageUrl || "",
      productUrl: p.productUrl || "",
      addedAt: new Date().toISOString(),
    };
    setWishlist((w) => {
      const exists = w.some((x) => x.productUrl && item.productUrl && x.productUrl === item.productUrl);
      if (exists) return w;
      return [item, ...w];
    });
  };

  const removeFromWishlist = (id) => {
    setWishlist((w) => w.filter((x) => x.id !== id));
  };

  const top3Line = (products) =>
    (Array.isArray(products) ? products.slice(0, 3) : [])
      .map((p) => `${p.title}${formatPriceRange(p) !== "—" ? ` (${formatPriceRange(p)})` : ""}`)
      .filter(Boolean)
      .join("; ");

  const budgetMaxPrice = () => {
    const budgetFilters = {
      budget: { min_price: 5, max_price: 50 },
      "mid-range": { min_price: 10, max_price: 150 },
      premium: { min_price: 50, max_price: 400 },
      luxury: { min_price: 100, max_price: null },
      mixed: { min_price: 5, max_price: null },
    };
    const b = String(profile?.budget || "").toLowerCase();
    if (b === "midrange") return budgetFilters["mid-range"].max_price;
    if (budgetFilters[b]) return budgetFilters[b].max_price || undefined;
    return undefined;
  };

  const budgetMinPrice = () => {
    const budgetFilters = {
      budget: { min_price: 5, max_price: 50 },
      "mid-range": { min_price: 10, max_price: 150 },
      premium: { min_price: 50, max_price: 400 },
      luxury: { min_price: 100, max_price: null },
      mixed: { min_price: 5, max_price: null },
    };
    const b = String(profile?.budget || "").toLowerCase();
    if (b === "midrange") return budgetFilters["mid-range"].min_price;
    if (budgetFilters[b]) return budgetFilters[b].min_price;
    return undefined;
  };

  function detectOutfitIntent(query) {
    const outfitKeywords = [
      "outfit", "set", "look", "combination", "complete",
      "full", "head to toe", "head-to-toe", "put together",
    ];
    const multiItemPatterns = [
      /pants?.+shirt/i, /shirt.+pants/i,
      /shoes?.+shirt/i, /shirt.+shoes/i,
      /pants?.+shoes/i, /shoes?.+pants/i,
      /top.+bottom/i, /jacket.+shirt/i,
      /outfit/i, /set of cloth/i, /set of clothes/i,
    ];
    const lowerQuery = query.toLowerCase();
    return (
      outfitKeywords.some((k) => lowerQuery.includes(k)) ||
      multiItemPatterns.some((p) => p.test(query))
    );
  }

  function getStyleKeywords(profileForSearch) {
    const styleMap = {
      Minimalist: ["minimalist", "clean", "simple", "slim fit"],
      "Casual chic": ["casual", "smart casual", "everyday", "relaxed"],
      Streetwear: ["streetwear", "urban", "graphic", "oversized"],
      "Business formal": ["formal", "business", "dress", "tailored", "slim fit"],
      Bohemian: ["boho", "bohemian", "flowy", "relaxed"],
      Sporty: ["athletic", "sport", "activewear", "performance"],
      Romantic: ["soft", "floral", "feminine", "elegant"],
      Edgy: ["edgy", "bold", "moto", "leather", "dark"],
      Classic: ["classic", "timeless", "traditional", "polo"],
      Eclectic: ["unique", "colorful", "pattern", "mixed"],
    };

    const keywords = [];
    (profileForSearch?.styles || []).forEach((style) => {
      const mapped = styleMap[style];
      if (mapped) keywords.push(mapped[0]); // take primary keyword
    });
    return keywords.slice(0, 2).join(" "); // max 2 style keywords
  }

  function getBrandKeywords(profileForSearch) {
    const preferred = profileForSearch?.brands || [];

    // Return first preferred brand if set
    if (preferred.length > 0) return preferred[0];

    // Otherwise infer from style
    const styles = profileForSearch?.styles || [];
    if (styles.includes("Sporty")) return "Nike OR Adidas OR Uniqlo";
    if (styles.includes("Minimalist")) return "Uniqlo OR COS OR Zara";
    if (styles.includes("Streetwear")) return "Nike OR ASOS";
    if (styles.includes("Business formal")) return "Zara OR Mango OR COS";
    return "";
  }

  function extractOutfitItems(query, profileForSearch) {
    const gender = profileForSearch?.gender === "female" ? "womens" : "mens";
    const styleKw = getStyleKeywords(profileForSearch);
    const brandKw = getBrandKeywords(profileForSearch);
    const modeKw = shoppingModeKeywords();
    const q = query.toLowerCase();
    const items = [];

    if (q.includes("shirt") || q.includes("top") ||
        q.includes("blouse") || q.includes("tee")) {
      items.push({
        category: "Tops", label: "👕 Shirt / Top",
        query: `${gender} ${styleKw} ${modeKw} shirt top size ${profileForSearch?.topSize || ""}
              ${brandKw}`.trim(),
      });
    }
    if (q.includes("pant") || q.includes("trouser") ||
        q.includes("jean") || q.includes("bottom")) {
      items.push({
        category: "Bottoms", label: "👖 Pants / Bottoms",
        query: `${gender} ${styleKw} ${modeKw} pants size ${profileForSearch?.bottomSize || ""}
              ${brandKw}`.trim(),
      });
    }
    if (q.includes("shoe") || q.includes("sneaker") ||
        q.includes("boot") || q.includes("footwear")) {
      items.push({
        category: "Shoes", label: "👟 Shoes",
        query: `${gender} ${styleKw} ${modeKw} shoes sneakers size ${profileForSearch?.shoeSize || ""}
              ${brandKw}`.trim(),
      });
    }
    if (q.includes("jacket") || q.includes("coat") ||
        q.includes("outerwear") || q.includes("blazer")) {
      items.push({
        category: "Outerwear", label: "🧥 Jacket",
        query: `${gender} ${styleKw} ${modeKw} jacket blazer
              ${brandKw}`.trim(),
      });
    }

    // Default: shirt + pants + shoes if no specific items detected
    if (items.length === 0) {
      items.push(
        {
          category: "Tops", label: "👕 Shirt / Top",
          query: `${gender} ${styleKw} ${modeKw} shirt top size ${profileForSearch?.topSize || ""}
                ${brandKw}`.trim(),
        },
        {
          category: "Bottoms", label: "👖 Pants / Bottoms",
          query: `${gender} ${styleKw} ${modeKw} pants size ${profileForSearch?.bottomSize || ""}
                ${brandKw}`.trim(),
        },
        {
          category: "Shoes", label: "👟 Shoes",
          query: `${gender} ${styleKw} ${modeKw} shoes size ${profileForSearch?.shoeSize || ""}
                ${brandKw}`.trim(),
        }
      );
    }
    return items;
  }

  async function pickBestOutfit(outfitGroups, profileForPick) {
    // Build a description of available items per category
    const itemDescriptions = outfitGroups.map((group) => {
      const items = group.products.slice(0, 4).map((p, i) =>
        `${i + 1}. ${p.title} - ${formatShopifyPrice(p.minPrice || p.raw?.priceRange?.min || p.raw?.price_range?.min)}`
      ).join("\n");
      return `${group.label}:\n${items}`;
    }).join("\n\n");

    const profileSummary = buildProfileSummary(profileForPick);

    const system = `You are a fashion stylist AI. 
Given a list of clothing items per category, 
pick ONE item from each category that best 
matches together as a cohesive outfit.
Consider color harmony, style consistency, 
and occasion appropriateness.
User profile: ${profileSummary}

Return ONLY valid JSON (no markdown):
{
  "picks": [
    { "category": "Tops", "index": 0, "reason": "why this works" },
    { "category": "Bottoms", "index": 1, "reason": "why this works" },
    { "category": "Shoes", "index": 0, "reason": "why this works" }
  ],
  "outfitName": "Creative outfit name",
  "styleNote": "One sentence on why these work together"
}
index is 0-based position in the category list.`;

    const user = `Pick the best matching outfit from these options:\n\n${itemDescriptions}`;

    try {
      const response = await callShoppingAssistant(system, user);
      const clean = response.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    } catch {
      return null;
    }
  }

  const sendMessage = async (text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed || loading) return;

    setError("");
    setSelectedProduct(null);
    setLastQuery(trimmed);

    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    setMessages((m) => [...m, { id, role: "user", content: trimmed, products: [] }]);
    setInput("");
    setLoading(true);

    const userQuery = trimmed;
    const styleKw = getStyleKeywords(profile);
    const brandKw = getBrandKeywords(profile);
    const modeKw = shoppingModeKeywords();
    const min_price = shoppingMode === "new" ? 5 : budgetMinPrice();
    const enrichedQuery = [
      userQuery,
      styleKw,
      brandKw,
      modeKw,
      profile?.gender === "female" ? "womens" : "mens",
      profile?.shoeSize ? `size ${profile.shoeSize}` : "",
    ].filter(Boolean).join(" ").trim();
    const max_price = budgetMaxPrice();

    try {
      const isOutfit = detectOutfitIntent(userQuery);

      if (isOutfit) {
        const outfitItems = extractOutfitItems(userQuery, profile);
        const budgetMap = {
          budget: 50,
          "mid-range": 150,
          premium: 400,
          luxury: null,
          mixed: null,
        };
        const maxPrice = budgetMap[profile?.budget] || null;

        const results = await Promise.all(
          outfitItems.map((item) =>
            searchShopifyCatalog(item.query, {
              max_price: maxPrice,
              min_price,
              ships_to: "CA",
              limit: 4,
            })
              .then((data) => ({
                ...item,
                products: normalizeProducts(data),
              }))
              .catch(() => ({ ...item, products: [] }))
          )
        );

        // Ask Claude to pick the best matching combination
        const aiPick = await pickBestOutfit(results, profile);

        // Attach picked item to each group
        const resultsWithPick = results.map((group) => {
          if (!aiPick) return group;
          const pick = aiPick.picks?.find((p) => p.category === group.category);
          return {
            ...group,
            pickedIndex: pick?.index ?? 0,
            pickReason: pick?.reason ?? "",
          };
        });

        const outfitMessage = {
          id: Date.now(),
          role: "assistant",
          content: aiPick?.styleNote ||
            `Here's a complete outfit matched to your profile!`,
          outfitGroups: resultsWithPick,
          outfitName: aiPick?.outfitName || "Your Complete Look",
          products: [],
        };

        setMessages((prev) => [...prev, outfitMessage]);
        return;
      }

      const json = await searchShopifyCatalog(enrichedQuery, {
        max_price,
        min_price,
        ships_to: "CA",
        limit: 10,
      });
      const products = normalizeProducts(json);

      if (!products.length) {
        const aid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "a";
        setMessages((m) => [
          ...m,
          { id: aid, role: "assistant", content: "No products found. Try a different search term.", products: [] },
        ]);
        return;
      }

      const profileSummary = buildProfileSummary(profile);
      const system = `You are ARLO, a personal fashion shopping assistant.
User profile: ${profileSummary}.
Shoe size: ${profile?.shoeSize || "not set"}, 
Gender: ${profile?.gender || "not set"},
Style: ${Array.isArray(profile?.styles) ? profile.styles.join(", ") : "not set"},
Budget: ${profile?.budget || "not set"}.
Budget price filters use Shopify Catalog dollar-based price filters.
The user searched for: ${userQuery}
Shopify Catalog returned ${products.length} products matching their
profile (size, gender, style already filtered).
Top results: ${top3Line(products)}.
Write a helpful 2-3 sentence response. 
Mention the size and style match. Be concise.`;

      let assistantText = "";
      try {
        assistantText = await callShoppingAssistant(system, userQuery);
      } catch {
        assistantText = "Here are a few great matches from the Shopify Catalog.";
      }

      const aid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "a";
      setMessages((m) => [...m, { id: aid, role: "assistant", content: assistantText, products }]);
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (msg.includes("credentials missing")) {
        setError(
          "Shopify Catalog not configured. Add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET to your server .env file."
        );
      } else {
        setError(msg || "Something went wrong.");
      }
      const eid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "e";
      setMessages((m) => [...m, { id: eid, role: "assistant", content: "I hit an error fetching products.", products: [] }]);
    } finally {
      setLoading(false);
    }
  };

  const openDetails = async (p) => {
    if (!p?.upid) return;
    setSelectedProduct({ ...p, loading: true });
    try {
      const details = await getShopifyProductDetails(p.upid);
      setSelectedProduct({ ...p, details, loading: false });
    } catch (e) {
      setSelectedProduct({ ...p, loading: false, error: e?.message || "Product lookup failed." });
    }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.75rem", fontWeight: 600, margin: "0 0 6px" }}>
          Shopping Agent
        </div>
        <div style={{ color: COLORS.textMuted, fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif" }}>
          Real products from millions of Shopify stores
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setView("chat")}
          style={{
            padding: "8px 16px",
            borderRadius: 999,
            border: `1px solid ${view === "chat" ? COLORS.primary : COLORS.border}`,
            background: view === "chat" ? COLORS.primarySoft : COLORS.surface2,
            color: view === "chat" ? COLORS.text : COLORS.textMuted,
            cursor: "pointer",
            fontSize: "0.85rem",
            transition: baseTransition,
          }}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => setView("wishlist")}
          style={{
            padding: "8px 16px",
            borderRadius: 999,
            border: `1px solid ${view === "wishlist" ? COLORS.primary : COLORS.border}`,
            background: view === "wishlist" ? COLORS.primarySoft : COLORS.surface2,
            color: view === "wishlist" ? COLORS.text : COLORS.textMuted,
            cursor: "pointer",
            fontSize: "0.85rem",
            transition: baseTransition,
          }}
        >
          Wishlist
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
        {[
          { id: "new", label: "New only" },
          { id: "secondhand", label: "Secondhand / Resale" },
          { id: "both", label: "Both" },
        ].map((mode) => {
          const active = shoppingMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setShoppingMode(mode.id)}
              style={{
                padding: "7px 12px",
                borderRadius: 999,
                border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
                background: active ? COLORS.primarySoft : COLORS.surface2,
                color: active ? COLORS.text : COLORS.textMuted,
                cursor: "pointer",
                fontSize: "0.78rem",
                transition: baseTransition,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div style={mergeStyles(ui.softPanel, { padding: "14px 16px", marginBottom: 14, border: `1px solid ${COLORS.border}` })}>
          <div style={{ fontWeight: 800, marginBottom: 6, color: COLORS.text }}>Error</div>
          <div style={{ color: COLORS.textMuted, fontSize: "0.9rem", lineHeight: 1.5, marginBottom: 12 }}>{error}</div>
          <button
            type="button"
            disabled={!lastQuery || loading}
            onClick={() => {
              if (lastQuery) void sendMessage(lastQuery);
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surface2,
              color: COLORS.text,
              cursor: !lastQuery || loading ? "default" : "pointer",
              transition: baseTransition,
              fontWeight: 800,
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {view === "chat" ? (
        <>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 14 }}>
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
                  whiteSpace: "nowrap",
                  flexShrink: 0,
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
              minHeight: 320,
              maxHeight: 520,
              overflowY: "auto",
              marginBottom: 12,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages.length === 0 ? (
              <p style={{ color: COLORS.textMuted, margin: 0, fontSize: "0.9rem" }}>
                Ask for an item and I’ll fetch real products from the Shopify Catalog.
              </p>
            ) : null}

            {messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 10 }}>
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
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {msg.content}
                  </div>

                  {!isUser && Array.isArray(msg.outfitGroups) && msg.outfitGroups.length ? (
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
                      {(() => {
                        // Get the AI-picked item from each group
                        const pickedItems = msg.outfitGroups.map((group) => ({
                          ...group,
                          picked: group.products[group.pickedIndex ?? 0],
                        })).filter((g) => g.picked);
                        const accent = COLORS.accent || COLORS.primary;
                        const muted = COLORS.muted || COLORS.textMuted;

                        return (
                          <div style={{
                            background: COLORS.surface,
                            border: `2px solid ${accent}`,
                            borderRadius: 16,
                            padding: 20,
                            marginBottom: 24,
                          }}>
                            {/* Header */}
                            <div style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 16,
                            }}>
                              <div>
                                <div style={{
                                  fontSize: "0.7rem",
                                  letterSpacing: "0.15em",
                                  color: accent,
                                  textTransform: "uppercase",
                                  fontFamily: "'DM Sans', sans-serif",
                                  marginBottom: 4,
                                }}>✦ Complete This Look</div>
                                <div style={{
                                  fontFamily: "'Cormorant Garamond', serif",
                                  fontSize: "1.2rem",
                                  fontWeight: 600,
                                  color: COLORS.text,
                                }}>{msg.outfitName}</div>
                              </div>
                            </div>

                            {/* Picked items side by side */}
                            <div style={{
                              display: "flex",
                              gap: 12,
                              marginBottom: 16,
                              flexWrap: "wrap",
                            }}>
                              {pickedItems.map((group) => {
                                const product = group.picked.raw || group.picked;
                                const imgUrl =
                                  group.picked.imageUrl ||
                                  product.media?.[0]?.url ||
                                  product.images?.[0]?.url ||
                                  product.image?.url;
                                return (
                                  <div key={group.category} style={{
                                    flex: 1,
                                    minWidth: 100,
                                    maxWidth: 140,
                                  }}>
                                    {/* Image */}
                                    <div style={{
                                      width: "100%",
                                      aspectRatio: "3/4",
                                      borderRadius: 10,
                                      overflow: "hidden",
                                      background: COLORS.card,
                                      border: `1px solid ${COLORS.border}`,
                                      marginBottom: 8,
                                    }}>
                                      {imgUrl ? (
                                        <img
                                          src={imgUrl}
                                          alt={group.picked.title}
                                          style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover",
                                          }}
                                        />
                                      ) : (
                                        <div style={{
                                          width: "100%",
                                          height: "100%",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontSize: "1.5rem",
                                        }}>
                                          {group.label.split(" ")[0]}
                                        </div>
                                      )}
                                    </div>
                                    {/* Label */}
                                    <div style={{
                                      fontSize: "0.7rem",
                                      color: accent,
                                      letterSpacing: "0.1em",
                                      textTransform: "uppercase",
                                      marginBottom: 2,
                                      fontFamily: "'DM Sans', sans-serif",
                                    }}>{group.label}</div>
                                    {/* Name */}
                                    <div style={{
                                      fontSize: "0.78rem",
                                      color: COLORS.text,
                                      lineHeight: 1.3,
                                      marginBottom: 4,
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical",
                                      overflow: "hidden",
                                    }}>{group.picked.title}</div>
                                    {/* Price */}
                                    <div style={{
                                      fontSize: "0.78rem",
                                      color: accent,
                                      fontWeight: 600,
                                    }}>
                                      {formatShopifyPrice(group.picked.minPrice || product.priceRange?.min || product.price_range?.min)}
                                    </div>
                                    {/* Pick reason */}
                                    {group.pickReason && (
                                      <div style={{
                                        fontSize: "0.68rem",
                                        color: muted,
                                        fontStyle: "italic",
                                        marginTop: 4,
                                        lineHeight: 1.4,
                                      }}>{group.pickReason}</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Total estimate */}
                            {(() => {
                              const total = pickedItems.reduce((sum, group) => {
                                const product = group.picked.raw || group.picked;
                                const priceObj =
                                  product.price_range?.min ||
                                  product.priceRange?.min ||
                                  group.picked.minPrice;
                                if (!priceObj) return sum;

                                // Skip non USD/CAD currencies
                                const currency = priceObj.currency || "";
                                if (currency && !["USD", "CAD", "usd", "cad"].includes(currency)) {
                                  return sum;
                                }

                                const amount = parseFloat(priceObj.amount || priceObj || 0);
                                return sum + amount;
                              }, 0);
                              return total > 0 ? (
                                <div style={{
                                  fontSize: "0.82rem",
                                  color: muted,
                                  marginBottom: 16,
                                }}>
                                  Estimated total:
                                  <strong style={{ color: COLORS.text, marginLeft: 6 }}>
                                    ~${total.toFixed(2)}
                                  </strong>
                                  <span style={{
                                    color: muted,
                                    fontSize: "0.72rem",
                                    marginLeft: 4,
                                  }}>
                                    CAD/USD
                                  </span>
                                </div>
                              ) : null;
                            })()}

                            {/* Action buttons */}
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {/* Add full outfit to wishlist */}
                              <button
                                onClick={() => {
                                  pickedItems.forEach((group) => {
                                    const product = group.picked.raw || group.picked;
                                    const url = productUrlFromShopify(product);
                                    const imageUrl =
                                      group.picked.imageUrl ||
                                      product.media?.[0]?.url ||
                                      product.images?.[0]?.url ||
                                      product.image?.url ||
                                      null;
                                    const price = formatShopifyPrice(group.picked.minPrice || product.priceRange?.min || product.price_range?.min);
                                    const store =
                                      group.picked.storeName ||
                                      product.offers?.[0]?.store_name ||
                                      product.shops?.[0]?.name ||
                                      product.vendor || "Shopify Store";
                                    const newItem = {
                                      id: product.id || product.upid || String(Date.now() + Math.random()),
                                      title: product.title || "Unknown product",
                                      price,
                                      store,
                                      imageUrl,
                                      productUrl: url,
                                      addedAt: new Date().toISOString(),
                                      outfitName: msg.outfitName,
                                    };
                                    setWishlist((prev) => {
                                      const exists = prev.some((i) => i.id === newItem.id);
                                      if (exists) return prev;
                                      const updated = [...prev, newItem];
                                      localStorage.setItem(
                                        STORAGE_WISHLIST,
                                        JSON.stringify(updated)
                                      );
                                      return updated;
                                    });
                                  });
                                }}
                                style={{
                                  flex: 1,
                                  padding: "11px 16px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: accent,
                                  color: "#FAF7F4",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  fontSize: "0.85rem",
                                  fontFamily: "'DM Sans', sans-serif",
                                }}
                              >
                                + Add Full Outfit to Wishlist
                              </button>

                              {/* Shop this look — opens modal */}
                              <button
                                onClick={() => {
                                  // Build a simple modal with all product links
                                  const links = pickedItems.map((group) => {
                                    const product = group.picked.raw || group.picked;
                                    return {
                                      label: group.label,
                                      title: group.picked.title,
                                      price: formatShopifyPrice(group.picked.minPrice || product.priceRange?.min || product.price_range?.min),
                                      url: productUrlFromShopify(product),
                                    };
                                  });
                                  setShopLookItems(links);
                                  setShowShopLookModal(true);
                                }}
                                style={{
                                  flex: 1,
                                  padding: "11px 16px",
                                  borderRadius: 8,
                                  border: `1px solid ${accent}`,
                                  background: "transparent",
                                  color: accent,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  fontSize: "0.85rem",
                                  fontFamily: "'DM Sans', sans-serif",
                                }}
                              >
                                Shop This Look →
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      {msg.outfitGroups.map((group) => (
                        <div key={`${msg.id}-${group.category}`} style={{ width: "100%" }}>
                          <div
                            style={{
                              fontFamily: "'Cormorant Garamond', serif",
                              fontSize: "1.1rem",
                              fontWeight: 700,
                              color: COLORS.text,
                              marginBottom: 8,
                            }}
                          >
                            {group.label}
                          </div>
                          {group.products.length ? (
                            <div style={{ width: "100%", overflowX: "auto", paddingBottom: 4 }}>
                              <div style={{ display: "flex", gap: 10, width: "max-content" }}>
                                {group.products.map((p, productIndex) => (
                                  <div
                                    key={p.upid || `${group.category}-${p.title}`}
                                    style={{
                                      position: "relative",
                                      width: 140,
                                      background: COLORS.card,
                                      border: `1px solid ${COLORS.border}`,
                                      borderRadius: 12,
                                      padding: 10,
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 8,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {group.pickedIndex === productIndex && (
                                      <div style={{
                                        position: "absolute",
                                        top: 6,
                                        left: 6,
                                        background: COLORS.accent || COLORS.primary,
                                        color: "#FAF7F4",
                                        fontSize: "0.65rem",
                                        fontWeight: 700,
                                        padding: "3px 7px",
                                        borderRadius: 6,
                                        letterSpacing: "0.05em",
                                        zIndex: 1,
                                      }}>✓ PICK</div>
                                    )}
                                    <div
                                      style={{
                                        width: 140,
                                        height: 160,
                                        borderRadius: 8,
                                        overflow: "hidden",
                                        background: COLORS.surface2,
                                        border: `1px solid ${COLORS.border}`,
                                        alignSelf: "center",
                                      }}
                                    >
                                      {p.imageUrl ? (
                                        <img
                                          src={p.imageUrl}
                                          alt={p.title || "Product image"}
                                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                        />
                                      ) : null}
                                    </div>
                                    <div
                                      style={{
                                        fontWeight: 700,
                                        fontSize: "0.85rem",
                                        color: COLORS.text,
                                        lineHeight: 1.25,
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                        minHeight: 36,
                                      }}
                                      title={p.title}
                                    >
                                      {p.title || "Untitled"}
                                    </div>
                                    <div style={{ color: COLORS.primary, fontWeight: 800, fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif" }}>
                                      {formatPriceRange(p)}
                                    </div>
                                    {shoppingBadgeText(p) ? (
                                      <div
                                        style={{
                                          alignSelf: "flex-start",
                                          padding: "3px 7px",
                                          borderRadius: 999,
                                          background: COLORS.surface2,
                                          color: COLORS.textMuted,
                                          fontSize: "0.7rem",
                                          fontWeight: 800,
                                        }}
                                      >
                                        {shoppingBadgeText(p)}
                                      </div>
                                    ) : null}
                                    {p.storeName && p.storeName !== "—" && p.storeName !== "" && (
                                      <div style={{ color: COLORS.muted, fontSize: "0.78rem" }}>
                                        {p.storeName}
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const product = p.raw || p;
                                        const url = productUrlFromShopify(product);
                                        if (url) window.open(url, "_blank", "noopener,noreferrer");
                                        else alert("Product URL not available");
                                      }}
                                      style={{
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        border: `1px solid ${COLORS.border}`,
                                        background: COLORS.surface2,
                                        color: COLORS.text,
                                        cursor: "pointer",
                                        transition: baseTransition,
                                        fontWeight: 700,
                                        fontSize: "0.82rem",
                                      }}
                                    >
                                      View product
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => addToWishlist(p)}
                                      style={{
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        border: `1px solid ${COLORS.border}`,
                                        background: COLORS.card,
                                        color: COLORS.text,
                                        cursor: "pointer",
                                        transition: baseTransition,
                                        fontWeight: 800,
                                        fontSize: "0.82rem",
                                      }}
                                    >
                                      Add to wishlist
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div style={mergeStyles(ui.softPanel, { padding: 12, color: COLORS.textMuted, fontSize: "0.85rem" })}>
                              No products found for this category.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {!isUser && Array.isArray(msg.products) && msg.products.length ? (
                    <div style={{ width: "100%", overflowX: "auto", paddingBottom: 4 }}>
                      <div style={{ display: "flex", gap: 10, width: "max-content" }}>
                        {msg.products.map((p) => (
                          <div
                            key={p.upid || `${msg.id}-${p.title}`}
                            style={{
                              width: 140,
                              background: COLORS.card,
                              border: `1px solid ${COLORS.border}`,
                              borderRadius: 12,
                              padding: 10,
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                width: 140,
                                height: 160,
                                borderRadius: 8,
                                overflow: "hidden",
                                background: COLORS.surface2,
                                border: `1px solid ${COLORS.border}`,
                                alignSelf: "center",
                              }}
                            >
                              {p.imageUrl ? (
                                <img
                                  src={p.imageUrl}
                                  alt={p.title || "Product image"}
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />
                              ) : null}
                            </div>

                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                color: COLORS.text,
                                lineHeight: 1.25,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                minHeight: 36,
                              }}
                              title={p.title}
                            >
                              {p.title || "Untitled"}
                            </div>

                            <div style={{ color: COLORS.primary, fontWeight: 800, fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif" }}>
                              {formatPriceRange(p)}
                            </div>

                            {shoppingBadgeText(p) ? (
                              <div
                                style={{
                                  alignSelf: "flex-start",
                                  padding: "3px 7px",
                                  borderRadius: 999,
                                  background: COLORS.surface2,
                                  color: COLORS.textMuted,
                                  fontSize: "0.7rem",
                                  fontWeight: 800,
                                }}
                              >
                                {shoppingBadgeText(p)}
                              </div>
                            ) : null}

                            {p.storeName && p.storeName !== "—" && p.storeName !== "" && (
                              <div style={{ color: COLORS.muted, fontSize: "0.78rem" }}>
                                {p.storeName}
                              </div>
                            )}

                            {optionSummary(p) ? (
                              <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, lineHeight: 1.35 }}>
                                {optionSummary(p)}
                              </div>
                            ) : null}

                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  const product = p.raw || p;
                                  const url = productUrlFromShopify(product);
                                  if (url) {
                                    window.open(url, "_blank", "noopener,noreferrer");
                                  } else {
                                    alert("Product URL not available");
                                  }
                                }}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: `1px solid ${COLORS.border}`,
                                  background: COLORS.surface2,
                                  color: COLORS.text,
                                  cursor: "pointer",
                                  transition: baseTransition,
                                  fontWeight: 700,
                                  fontSize: "0.82rem",
                                }}
                              >
                                View product
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const product = p.raw || p;
                                  const url = productUrlFromShopify(product);

                                  const imageUrl =
                                    product.media?.[0]?.url ||
                                    product.images?.[0]?.url ||
                                    product.image?.url ||
                                    null;

                                  const priceMin = formatShopifyPrice(product.price_range?.min);
                                  const priceMax = formatShopifyPrice(product.price_range?.max);
                                  const priceDisplay = priceMin === priceMax
                                    ? priceMin
                                    : `${priceMin}–${priceMax}`;

                                  const store =
                                    product.offers?.[0]?.store_name ||
                                    product.shops?.[0]?.name ||
                                    product.vendor ||
                                    "Shopify Store";

                                  const newItem = {
                                    id: product.id || product.upid || String(Date.now()),
                                    title: product.title || "Unknown product",
                                    price: priceDisplay,
                                    store,
                                    imageUrl,
                                    productUrl: url,
                                    addedAt: new Date().toISOString(),
                                  };

                                  setWishlist((prev) => {
                                    // Avoid duplicates
                                    const exists = prev.some((i) => i.id === newItem.id);
                                    if (exists) return prev;
                                    const updated = [...prev, newItem];
                                    localStorage.setItem(STORAGE_WISHLIST, JSON.stringify(updated));
                                    return updated;
                                  });
                                  setAddedId(newItem.id);
                                  setTimeout(() => setAddedId(null), 2000);
                                }}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: `1px solid ${COLORS.border}`,
                                  background:
                                    addedId === ((p.raw || p).id || (p.raw || p).upid || p.upid)
                                      ? COLORS.green || "#27ae60"
                                      : COLORS.card,
                                  color: COLORS.text,
                                  cursor: "pointer",
                                  transition: baseTransition,
                                  fontWeight: 800,
                                  fontSize: "0.82rem",
                                }}
                              >
                                {addedId === ((p.raw || p).id || (p.raw || p).upid || p.upid) ? "✓ Added!" : "Add to wishlist"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {loading ? <span style={{ color: COLORS.textMuted, fontSize: "0.85rem" }}>Searching…</span> : null}
          </div>

          {selectedProduct ? (
            <div style={mergeStyles(ui.panel, { padding: 16, marginBottom: 12 })}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 600 }}>
                  {selectedProduct.title || "Product details"}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.surface2,
                    color: COLORS.text,
                    cursor: "pointer",
                    transition: baseTransition,
                    fontWeight: 700,
                  }}
                >
                  Close
                </button>
              </div>
              <div style={{ marginTop: 10, color: COLORS.textMuted, fontSize: "0.9rem", lineHeight: 1.5 }}>
                {selectedProduct.loading
                  ? "Loading…"
                  : selectedProduct.error
                    ? selectedProduct.error
                    : selectedProduct.details
                      ? "Loaded."
                      : "—"}
              </div>
            </div>
          ) : null}

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
              placeholder="Search for an item…"
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface,
                color: COLORS.text,
                outline: "none",
                fontFamily: "'DM Sans', sans-serif",
                transition: baseTransition,
              }}
            />
            <button
              type="button"
              onClick={() => void sendMessage(input)}
              disabled={loading || !input.trim()}
              style={mergeStyles(ui.primaryButton, { padding: "12px 16px", minWidth: 110 })}
            >
              Send
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
              My Wishlist
            </div>
            <div style={{ color: COLORS.textMuted, fontSize: "0.85rem" }}>{wishlist.length} item(s)</div>
          </div>

          {wishlist.length === 0 ? (
            <div style={mergeStyles(ui.softPanel, { padding: 16, color: COLORS.textMuted })}>
              Your wishlist is empty. Start chatting to discover products.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {wishlist.map((it) => (
                <div
                  key={it.id}
                  style={mergeStyles(ui.panel, {
                    padding: "12px 12px",
                    display: "grid",
                    gridTemplateColumns: "56px 1fr auto",
                    gap: 12,
                    alignItems: "center",
                  })}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      overflow: "hidden",
                      background: COLORS.surface2,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    {it.imageUrl ? (
                      <img
                        src={it.imageUrl}
                        alt={it.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <div style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.5rem",
                      }}>
                        👟
                      </div>
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, marginBottom: 4, color: COLORS.text }}>{it.title || "Untitled"}</div>
                    <div style={{ fontSize: "0.85rem", color: COLORS.textMuted }}>
                      {it.price || "—"} {it.store ? ` • ${it.store}` : ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (it.productUrl) window.open(it.productUrl, "_blank", "noopener,noreferrer");
                      }}
                      disabled={!it.productUrl}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.surface2,
                        color: COLORS.text,
                        cursor: it.productUrl ? "pointer" : "default",
                        transition: baseTransition,
                        whiteSpace: "nowrap",
                        fontWeight: 700,
                      }}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromWishlist(it.id)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: `1px solid ${COLORS.border}`,
                        background: "transparent",
                        color: COLORS.textMuted,
                        cursor: "pointer",
                        transition: baseTransition,
                        whiteSpace: "nowrap",
                        fontWeight: 700,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showShopLookModal && (
        <div
          onClick={() => setShowShopLookModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 400,
            }}
          >
            <div style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "1.4rem",
              fontWeight: 600,
              marginBottom: 6,
              color: COLORS.text,
            }}>Shop This Look</div>
            <div style={{
              color: COLORS.muted || COLORS.textMuted,
              fontSize: "0.85rem",
              marginBottom: 20,
            }}>
              Click each item to open in the store
            </div>

            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 24,
            }}>
              {shopLookItems.map((item, i) => (
                <div key={i} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: COLORS.card,
                  borderRadius: 10,
                  padding: "12px 14px",
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div>
                    <div style={{
                      fontSize: "0.7rem",
                      color: COLORS.accent || COLORS.primary,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 2,
                    }}>{item.label}</div>
                    <div style={{
                      fontSize: "0.82rem",
                      color: COLORS.text,
                      marginBottom: 2,
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>{item.title}</div>
                    <div style={{
                      fontSize: "0.78rem",
                      color: COLORS.accent || COLORS.primary,
                      fontWeight: 600,
                    }}>{item.price}</div>
                  </div>
                  <button
                    onClick={() => item.url &&
                      window.open(item.url, "_blank", "noopener,noreferrer")}
                    disabled={!item.url}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: `1px solid ${COLORS.accent || COLORS.primary}`,
                      background: "transparent",
                      color: COLORS.accent || COLORS.primary,
                      cursor: item.url ? "pointer" : "not-allowed",
                      fontSize: "0.78rem",
                      fontFamily: "'DM Sans', sans-serif",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Open →
                  </button>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "12px 0",
              borderTop: `1px solid ${COLORS.border}`,
              marginBottom: 16,
            }}>
              <span style={{ color: COLORS.muted || COLORS.textMuted, fontSize: "0.85rem" }}>
                Estimated total
              </span>
              <strong style={{ color: COLORS.text, fontSize: "0.85rem" }}>
                {shopLookItems.reduce((sum, item) => {
                  const n = parseFloat(
                    String(item.price).replace(/[^0-9.]/g, "")
                  );
                  return sum + (isNaN(n) ? 0 : n);
                }, 0).toFixed(2)} {shopLookItems[0]?.price?.match(/[A-Z]{3}/)?.[0] || ""}
              </strong>
            </div>

            <button
              onClick={() => setShowShopLookModal(false)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: "transparent",
                color: COLORS.muted || COLORS.textMuted,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
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

function ProfileEditor({ initial, onSave, baseTransition }) {
  const [form, setForm] = useState(() => ({ ...defaultProfile(), ...initial }));
  const [step, setStep] = useState(1);

  useEffect(() => {
    setForm({ ...defaultProfile(), ...initial });
  }, [initial]);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 1:
        return Boolean(form.name && form.name.trim());
      case 2:
        return form.gender !== "";
      case 3:
        return Boolean(form.bodyType);
      case 4:
        return Boolean(form.budget);
      case 5:
        return form.styles.length > 0;
      case 6:
        return true;
      case 7:
        return Boolean(form.topSize && form.bottomSize && form.shoeSize);
      default:
        return false;
    }
  }, [step, form]);

  const editorBodyTypes = useMemo(() => bodyTypesForGender(form.gender), [form.gender]);
  const editorTopSizes = useMemo(() => topSizesForGender(form.gender), [form.gender]);
  const editorBottomSizes = useMemo(() => bottomSizesForGender(form.gender), [form.gender]);
  const editorShoeSizes = useMemo(() => shoeSizesForGender(form.gender), [form.gender]);

  const save = () => {
    onSave({ ...form });
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStep(n)}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              border: "none",
              padding: 0,
              cursor: "pointer",
              background: n === step ? COLORS.primary : COLORS.surface2,
              transition: baseTransition,
            }}
            aria-label={`Section ${n}`}
          />
        ))}
      </div>

      <div
        style={{
          background: COLORS.surface,
          borderRadius: 12,
          padding: 24,
          border: `1px solid ${COLORS.border}`,
          marginBottom: 20,
        }}
      >
        {step === 1 && (
          <>
            <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.8rem", marginBottom: 8 }}>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface2,
                color: COLORS.text,
              }}
            />
          </>
        )}
        {step === 2 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {GENDER_OPTIONS.map((opt) => {
              const selected = form.gender === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      gender: opt.value,
                      bodyType: f.gender !== opt.value ? "" : f.bodyType,
                    }))
                  }
                  style={{
                    minHeight: 88,
                    padding: "20px 16px",
                    borderRadius: 10,
                    border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                    background: selected ? COLORS.primarySoft : COLORS.surface2,
                    color: COLORS.text,
                    cursor: "pointer",
                    fontSize: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: baseTransition,
                  }}
                >
                  <span style={{ fontSize: "1.75rem" }}>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}
        {step === 3 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {editorBodyTypes.map((bt) => {
              const selected = form.bodyType === bt;
              return (
                <button
                  key={bt}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, bodyType: bt }))}
                  style={{
                    padding: "12px",
                    borderRadius: 10,
                    border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                    background: selected ? COLORS.primarySoft : COLORS.surface2,
                    color: COLORS.text,
                    cursor: "pointer",
                    fontSize: "0.88rem",
                    transition: baseTransition,
                  }}
                >
                  {bt}
                </button>
              );
            })}
          </div>
        )}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {BUDGET_OPTIONS.map((b) => {
              const selected = form.budget === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, budget: b.id }))}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                    background: selected ? COLORS.primarySoft : COLORS.surface2,
                    color: COLORS.text,
                    cursor: "pointer",
                    transition: baseTransition,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{b.label}</div>
                  <div style={{ fontSize: "0.82rem", color: COLORS.textMuted }}>{b.sub}</div>
                </button>
              );
            })}
          </div>
        )}
        {step === 5 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {STYLE_PREFS.map((s) => {
              const on = form.styles.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      styles: on ? f.styles.filter((x) => x !== s) : [...f.styles, s],
                    }))
                  }
                  style={{
                    padding: "8px 14px",
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
        )}
        {step === 6 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {BRANDS.map((b) => {
              const on = form.brands.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      brands: on ? f.brands.filter((x) => x !== b) : [...f.brands, b],
                    }))
                  }
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                    background: on ? COLORS.primarySoft : COLORS.surface2,
                    color: on ? COLORS.text : COLORS.textMuted,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    transition: baseTransition,
                  }}
                >
                  {b}
                </button>
              );
            })}
          </div>
        )}
        {step === 7 && (
          <>
            <p style={{ margin: "0 0 10px", color: COLORS.textMuted, fontSize: "0.85rem" }}>Top</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {editorTopSizes.map((sz) => {
                const selected = form.topSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, topSize: sz }))}
                    style={{
                      minWidth: 42,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                      background: selected ? COLORS.primarySoft : COLORS.surface2,
                      color: COLORS.text,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      transition: baseTransition,
                    }}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: "0 0 10px", color: COLORS.textMuted, fontSize: "0.85rem" }}>Bottom</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {editorBottomSizes.map((sz) => {
                const selected = form.bottomSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, bottomSize: sz }))}
                    style={{
                      minWidth: 42,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                      background: selected ? COLORS.primarySoft : COLORS.surface2,
                      color: COLORS.text,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      transition: baseTransition,
                    }}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: "0 0 10px", color: COLORS.textMuted, fontSize: "0.85rem" }}>Shoe (US)</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {editorShoeSizes.map((sz) => {
                const selected = form.shoeSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, shoeSize: sz }))}
                    style={{
                      minWidth: 42,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                      background: selected ? COLORS.primarySoft : COLORS.surface2,
                      color: COLORS.text,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      transition: baseTransition,
                    }}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: "transparent",
              color: step === 1 ? COLORS.textMuted : COLORS.text,
              cursor: step === 1 ? "default" : "pointer",
              transition: baseTransition,
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(7, s + 1))}
            disabled={!canAdvance || step === 7}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surface2,
              color: !canAdvance || step === 7 ? COLORS.textMuted : COLORS.text,
              cursor: !canAdvance || step === 7 ? "default" : "pointer",
              transition: baseTransition,
            }}
          >
            Next
          </button>
        </div>
        <button
          type="button"
          onClick={save}
          style={{
            padding: "12px 28px",
            borderRadius: 8,
            border: "none",
            background: COLORS.primary,
            color: "#FFFFFF",
            fontWeight: 600,
            cursor: "pointer",
            transition: baseTransition,
          }}
        >
          Save profile
        </button>
      </div>
    </div>
  );
}
