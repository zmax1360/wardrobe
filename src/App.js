import { COLORS } from "./constants/colors";
import { baseTransition } from "./constants/theme";
import {
  STORAGE_PROFILE,
  STORAGE_EVENTS,
  STORAGE_WISHLIST,
  GENDER_OPTIONS,
  BUDGET_OPTIONS,
  STYLE_PREFS,
  BRANDS,
  CATEGORIES,
  CATALOG_SYSTEM,
  DESIGNER_STYLE_DIRECTIONS,
  DESIGNER_MOODS,
} from "./constants";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Helmet } from "react-helmet-async";
import { useLocation, Navigate } from "react-router-dom";

import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

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
  mergeFrequentIssuesFromImprovements,
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
  parsePlannerResponse,
  normalizeEvaluatorResult,
} from "./services/parsers";
import {
  callShoppingAssistant,
  evaluateOutfitWithVision,
} from "./services/anthropicExtended";
import {
  searchShopifyCatalog,
  getShopifyProductDetails,
} from "./services/shopify";
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
import { useWardrobe, uploadWardrobeImage } from "./hooks/useWardrobe";
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
import LandingPage from "./components/LandingPage";
import {
  getTimesWorn,
  getPurchasePriceNum,
} from "./utils/wardrobeFinance";
// (kept minimal) apiBase still used elsewhere in the app
import { placeholderRemoveBackground } from "./services/backgroundRemoval";

const SEO_SITE_TITLE = "Fashion OS — Dress Smarter. Shop Less.";
const SEO_META_DESCRIPTION =
  "Fashion OS is your AI-powered personal stylist. Catalog your wardrobe, plan outfits with the weather, and shop only what you actually need.";
const SEO_LANDING_TITLE = "Fashion OS — Your AI Personal Stylist";

/** Per-UID profile in localStorage; legacy `fos_profile` could wrongly complete onboarding for a new Firebase user. */
const PROFILE_LEGACY_OWNER_KEY = "fos_profile_legacy_owner";
function profileStorageKeyForUid(uid) {
  return `${STORAGE_PROFILE}__${uid}`;
}

function FashionOSLogo({ dark = false, size = "md" }) {
  const sizes = {
    sm: { width: 140, height: 36, fontSize: 22, barHeight: 22, barY: 7, barX: 82, osX: 89 },
    md: { width: 180, height: 48, fontSize: 30, barHeight: 28, barY: 10, barX: 105, osX: 112 },
    lg: { width: 240, height: 64, fontSize: 40, barHeight: 38, barY: 13, barX: 140, osX: 148 },
  };
  const s = sizes[size] || sizes.md;
  const textColor = dark ? "#faf7f2" : "#1a1208";
  const accentColor = "#c4813a";

  return (
    <svg
      width={s.width}
      height={s.height}
      viewBox={`0 0 ${s.width} ${s.height}`}
      fill="none"
      aria-label="Fashion OS"
    >
      <text
        x="0"
        y={s.height * 0.75}
        fontFamily="'Cormorant Garamond', Georgia, serif"
        fontSize={s.fontSize}
        fontWeight="400"
        fill={textColor}
        letterSpacing="-0.5"
      >
        Fashion
      </text>
      <rect
        x={s.barX}
        y={s.barY}
        width={1.5}
        height={s.barHeight}
        fill={accentColor}
      />
      <text
        x={s.osX}
        y={s.height * 0.75}
        fontFamily="'Cormorant Garamond', Georgia, serif"
        fontSize={s.fontSize}
        fontWeight="400"
        fill={textColor}
        letterSpacing="-0.5"
      >
        OS
      </text>
    </svg>
  );
}

export default function App() {
  const location = useLocation();
  const [hydrated, setHydrated] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(undefined);
  const [authMode, setAuthMode] = useState("signup");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authResetMessage, setAuthResetMessage] = useState("");
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
  const [wishlist, setWishlist] = useState(() => {
    const w = loadJson(STORAGE_WISHLIST, []);
    return Array.isArray(w) ? w : [];
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
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !firebaseUser) return;

    let cancelled = false;
    const uid = firebaseUser.uid;
    const perKey = profileStorageKeyForUid(uid);
    let pData = loadJson(perKey, null);

    const legacy = loadJson(STORAGE_PROFILE, null);
    const legacyNamed =
      legacy &&
      typeof legacy === "object" &&
      typeof legacy.name === "string" &&
      legacy.name.trim().length > 0;

    if (
      !(pData && typeof pData === "object" && String(pData.name || "").trim()) &&
      legacyNamed
    ) {
      const legacyOwner = localStorage.getItem(PROFILE_LEGACY_OWNER_KEY);
      if (!legacyOwner) {
        localStorage.setItem(PROFILE_LEGACY_OWNER_KEY, uid);
      }
      if (localStorage.getItem(PROFILE_LEGACY_OWNER_KEY) === uid) {
        localStorage.setItem(perKey, JSON.stringify(legacy));
        localStorage.removeItem(STORAGE_PROFILE);
        pData = legacy;
      }
    }

    if (pData && typeof pData === "object" && String(pData.name || "").trim()) {
      setProfile(pData);
      setDraft({ ...defaultProfile(), ...pData });
    } else {
      setProfile(null);
      setDraft(
        pData && typeof pData === "object"
          ? { ...defaultProfile(), ...pData }
          : defaultProfile()
      );
      setOnboardingStep(1);
    }

    getDoc(doc(db, "users", uid))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists) return;

        const data = snap.data() || {};

        if (data.profile && typeof data.profile === "object" && Object.keys(data.profile).length > 0) {
          const perKeyFs = profileStorageKeyForUid(uid);
          const localRaw = localStorage.getItem(perKeyFs);
          let local = null;
          try {
            local = localRaw ? JSON.parse(localRaw) : null;
          } catch {
            local = null;
          }
          if (!local || typeof local !== "object" || Object.keys(local).length === 0) {
            localStorage.setItem(perKeyFs, JSON.stringify(data.profile));
            localStorage.removeItem(STORAGE_PROFILE);
            setProfile(data.profile);
            setDraft({ ...defaultProfile(), ...data.profile });
          }
        }

        if (data.events && Array.isArray(data.events) && data.events.length > 0) {
          setEvents(data.events);
          localStorage.setItem(STORAGE_EVENTS, JSON.stringify(data.events));
        }

        if (data.wishlist && Array.isArray(data.wishlist) && data.wishlist.length > 0) {
          setWishlist(data.wishlist);
          localStorage.setItem(STORAGE_WISHLIST, JSON.stringify(data.wishlist));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, hydrated]);

  useEffect(() => {
    if (!hydrated || !firebaseUser) return undefined;
    const pull = () => {
      try {
        const raw = localStorage.getItem(STORAGE_WISHLIST);
        const parsed = raw ? JSON.parse(raw) : [];
        const arr = Array.isArray(parsed) ? parsed : [];
        setWishlist((prev) =>
          JSON.stringify(prev) === JSON.stringify(arr) ? prev : arr
        );
      } catch {
        /* ignore */
      }
    };
    pull();
    const id = window.setInterval(pull, 2000);
    return () => clearInterval(id);
  }, [hydrated, firebaseUser]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_WISHLIST, JSON.stringify(wishlist));
    if (firebaseUser) {
      setDoc(
        doc(db, "users", firebaseUser.uid),
        { wishlist: JSON.parse(JSON.stringify(wishlist)) },
        { merge: true }
      ).catch(() => {});
    }
  }, [wishlist, hydrated, firebaseUser]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_EVENTS, JSON.stringify(events));
    if (firebaseUser) {
      setDoc(
        doc(db, "users", firebaseUser.uid),
        { events: JSON.parse(JSON.stringify(events)) },
        { merge: true }
      ).catch(() => {});
    }
  }, [events, hydrated, firebaseUser]);

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setAuthResetMessage("");
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

  const handleForgotPassword = async () => {
    setAuthError("");
    setAuthResetMessage("");
    const email = authEmail.trim();
    if (!email) {
      setAuthError("Enter your email address, then tap Forgot password to receive a reset link.");
      return;
    }
    setAuthLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthResetMessage(`If an account exists for ${email}, we sent a reset link — check your inbox and spam folder.`);
    } catch (err) {
      const msgs = {
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/user-not-found": "No account found with this email. Try Sign Up or check the address.",
        "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
        "auth/network-request-failed": "Network error. Check your connection and try again.",
      };
      setAuthError(msgs[err?.code] || "Could not send reset email. Try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthResetMessage("");
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
    if (!firebaseUser) {
      localStorage.setItem(STORAGE_PROFILE, JSON.stringify(next));
      return;
    }
    const perKey = profileStorageKeyForUid(firebaseUser.uid);
    localStorage.setItem(perKey, JSON.stringify(next));
    localStorage.removeItem(STORAGE_PROFILE);
    setDoc(
      doc(db, "users", firebaseUser.uid),
      { profile: JSON.parse(JSON.stringify(next)) },
      { merge: true }
    ).catch(() => {});
  }, [firebaseUser]);

  const goNextOnboarding = () => {
    if (onboardingStep < 8) setOnboardingStep((s) => s + 1);
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
        return draft.styles.length > 0;
      case 5:
        return Boolean(draft.budget);
      case 6:
        return true;
      case 7:
        return true;
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
      return null;
    }
    setUploadError("");
    setAnalyzing(true);
    try {
      let fileToUse = file;
      if (options.removeBg) {
        fileToUse = await placeholderRemoveBackground(file);
      }

      const itemId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      let tempBlobUrl = null;

      const dataUrl = await compressImage(fileToUse, 800, 0.6);
      const b64 = String(dataUrl).includes(",") ? String(dataUrl).split(",")[1] : String(dataUrl);
      const parsed = await catalogImageWithVision(b64, "image/jpeg");
      const category = CATEGORIES.includes(parsed.category) ? parsed.category : "Accessories";
      const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 20) : [];

      const itemBase = {
        id: itemId,
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

      if (firebaseUser) {
        tempBlobUrl = URL.createObjectURL(fileToUse);
        const item = {
          ...itemBase,
          imagePreview: tempBlobUrl,
          imageFilename: null,
          imageUploading: true,
        };
        addItem(item);

        uploadWardrobeImage(firebaseUser, fileToUse, itemId)
          .then(({ downloadURL, path }) => {
            updateItem(itemId, {
              imagePreview: downloadURL,
              imageFilename: path,
              imageUploading: false,
            });
            if (tempBlobUrl) URL.revokeObjectURL(tempBlobUrl);
          })
          .catch((err) => {
            console.error("Image upload failed:", err);
            updateItem(itemId, { imageUploading: false });
          });

        return item;
      }

      const item = {
        ...itemBase,
        imagePreview: dataUrl,
        imageFilename: null,
      };
      addItem(item);
      return item;
    } catch (e) {
      setUploadError(e.message || "Could not analyze image.");
      return null;
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
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

      let imagePreview = null;
      let imageFilename = null;
      let tempBlobUrl = null;
      let hasUploadInFlight = false;

      const imageFile =
        payload.imageFile instanceof File && String(payload.imageFile.type || "").startsWith("image/")
          ? payload.imageFile
          : null;

      if (imageFile && firebaseUser) {
        tempBlobUrl = URL.createObjectURL(imageFile);
        imagePreview = tempBlobUrl;
        hasUploadInFlight = true;
      } else if (imageFile) {
        imagePreview = await compressImage(imageFile, 800, 0.6);
      }

      const raw = String(payload.purchasePrice ?? "").trim();
      const priceNum =
        raw === "" ? 0 : parseFloat(raw.replace(/[^0-9.-]/g, ""));
      const purchasePrice = Number.isFinite(priceNum) ? priceNum : 0;

      const tags = ["manual-entry"];
      if (payload.brand?.trim()) tags.push(payload.brand.trim());

      const newItem = {
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
        ...(hasUploadInFlight ? { imageUploading: true } : {}),
        sourceUrl: payload.sourceUrl?.trim() ?? "",
      };

      addItem(newItem);

      if (imageFile && firebaseUser && tempBlobUrl) {
        uploadWardrobeImage(firebaseUser, imageFile, id)
          .then(({ downloadURL, path }) => {
            updateItem(id, {
              imagePreview: downloadURL,
              imageFilename: path,
              imageUploading: false,
            });
            URL.revokeObjectURL(tempBlobUrl);
          })
          .catch((err) => {
            console.error("Image upload failed:", err);
            updateItem(id, { imageUploading: false });
          });
      }
    },
    [addItem, updateItem, firebaseUser]
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
      <>
        {/* SEO — update per route as app grows */}
        <Helmet>
          <title>{SEO_SITE_TITLE}</title>
          <meta name="description" content={SEO_META_DESCRIPTION} />
        </Helmet>
        <div
          style={{
            minHeight: "100vh",
            background: COLORS.bg,
            color: COLORS.text,
            fontFamily: "'DM Sans', sans-serif",
          }}
        />
      </>
    );
  }

  if (firebaseUser === undefined) {
    return (
      <>
        {/* SEO — update per route as app grows */}
        <Helmet>
          <title>{SEO_SITE_TITLE}</title>
          <meta name="description" content={SEO_META_DESCRIPTION} />
        </Helmet>
        <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", color: COLORS.textMuted, fontSize: "0.95rem" }}>Loading…</p>
        </div>
      </>
    );
  }

  if (!firebaseUser) {
    const isAppLoginPath = /^\/app\/?$/i.test(location.pathname);
    if (!isAppLoginPath) {
      return <LandingPage />;
    }
    return (
      <>
        {/* SEO — update per route as app grows */}
        <Helmet>
          <title>{SEO_LANDING_TITLE}</title>
          <meta name="description" content={SEO_META_DESCRIPTION} />
        </Helmet>
        <style>{`
          .authLandingRow {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
          }
          @media (min-width: 768px) {
            .authLandingRow {
              flex-direction: row;
              align-items: stretch;
            }
            .authLandingLeft {
              display: flex !important;
              flex: 0 0 60%;
              max-width: 60%;
            }
            .authLandingRight {
              flex: 0 0 40%;
              max-width: 40%;
            }
          }
          .authLandingLeft {
            display: none;
            box-sizing: border-box;
          }
          .authLandingRight {
            box-sizing: border-box;
            width: 100%;
          }
          .authLandingMobileCondensed {
            display: block;
            text-align: center;
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          @media (min-width: 768px) {
            .authLandingMobileCondensed {
              display: none !important;
            }
          }
          .authMobileFeatureLine {
            margin: 0;
            padding: 0;
            font-size: 0.84rem;
            line-height: 1.55;
            color: #867560;
            font-family: 'DM Sans', sans-serif;
          }
          .authMobileFeatureStack {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 14px;
            max-width: 320px;
            margin-left: auto;
            margin-right: auto;
          }
          .authLoginCard {
            box-sizing: border-box;
          }
          @media (max-width: 767px) {
            .authLandingRight {
              padding: 16px !important;
              align-items: stretch !important;
            }
            .authLoginCardDesktopBranding {
              display: none !important;
            }
            .authLoginCard {
              box-shadow: none !important;
              border: none !important;
              background: #faf7f2 !important;
              border-radius: 0 !important;
              padding: 0 !important;
              max-width: none !important;
              width: 100% !important;
            }
          }
        `}</style>
        <div style={{ minHeight: "100vh", background: "#faf7f2", fontFamily: "'DM Sans', sans-serif" }}>
          <div className="authLandingRow">
            <div
              className="authLandingLeft"
              style={{
                background: "#1a1208",
                flexDirection: "column",
                justifyContent: "center",
                padding: "96px 72px",
                gap: 24,
              }}
            >
              <div style={{ alignSelf: "flex-start" }}>
                <FashionOSLogo dark={true} size="md" />
                <p
                  style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontSize: "13px",
                    color: "#7a6a58",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginTop: "8px",
                    marginBottom: "12px",
                  }}
                >
                  Dress smarter. Shop less.
                </p>
              </div>
              <h1
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: 64,
                  fontWeight: 300,
                  color: "#faf7f2",
                  margin: 0,
                  lineHeight: 1.05,
                  letterSpacing: "-0.02em",
                  maxWidth: 520,
                }}
              >
                The wardrobe OS that thinks like a{" "}
                <span style={{ fontStyle: "italic", color: "#c4813a" }}>stylist</span>
              </h1>
              <p
                style={{
                  margin: 0,
                  fontSize: 16,
                  lineHeight: 1.6,
                  color: "#867560",
                  maxWidth: 480,
                }}
              >
                Knows every item you own, plans outfits around your life, and shops for exactly what you&apos;re
                missing — powered by AI.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 12 }}>
                {[
                  {
                    icon: "📷",
                    title: "AI wardrobe cataloging from photos",
                    desc: "Upload images and build a structured closet automatically.",
                  },
                  {
                    icon: "📅",
                    title: "Weather-aware outfit planning",
                    desc: "Recommendations that respect your week and the forecast.",
                  },
                  {
                    icon: "🛍",
                    title: "Smart shopping from millions of stores",
                    desc: "Discover pieces that complete what you already own.",
                  },
                  {
                    icon: "✨",
                    title: "Gap analysis and style scoring",
                    desc: "Spot wardrobe holes and refine looks with clear feedback.",
                  },
                ].map((row) => (
                  <div
                    key={row.title}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: "rgba(255, 255, 255, 0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.25rem",
                        flexShrink: 0,
                      }}
                      aria-hidden
                    >
                      {row.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#faf7f2", fontSize: "0.98rem", marginBottom: 4 }}>
                        {row.title}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.45, color: "#6a5c4e" }}>{row.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20, flexWrap: "wrap" }}>
                <div style={{ display: "flex", marginLeft: 4 }}>
                  {["#c4813a", "#a09078", "#7a6a58"].map((c, i) => (
                    <div
                      key={c}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: `linear-gradient(135deg, ${c}, #1a1208)`,
                        border: "2px solid #1a1208",
                        marginLeft: i === 0 ? 0 : -10,
                      }}
                    />
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: "0.84rem", color: "#a09078", lineHeight: 1.45 }}>
                  Beta users are already trying it · Free to start
                </p>
              </div>
            </div>
            <div
              className="authLandingRight"
              style={{
                background: "#faf7f2",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
              }}
            >
              <div className="authLandingMobileCondensed">
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <FashionOSLogo dark={false} size="md" />
                </div>
                <p
                  style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontSize: "13px",
                    color: "#7a6a58",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginTop: "10px",
                    marginBottom: "4px",
                  }}
                >
                  Dress smarter. Shop less.
                </p>
                <div className="authMobileFeatureStack">
                  <p className="authMobileFeatureLine">AI catalogs your wardrobe from photos</p>
                  <p className="authMobileFeatureLine">Daily outfits based on real weather</p>
                  <p className="authMobileFeatureLine">Shop millions of real products</p>
                </div>
              </div>
              <div
                className="authLoginCard"
                style={{
                  background: "#fff",
                  borderRadius: 20,
                  padding: 40,
                  width: "100%",
                  maxWidth: 400,
                  boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
                  border: "1px solid rgba(26, 18, 8, 0.08)",
                }}
              >
                <div className="authLoginCardDesktopBranding">
                  <div style={{ margin: "0 0 4px" }}>
                    <FashionOSLogo dark={false} size="md" />
                  </div>
                  <p style={{ color: "#7a6a58", fontSize: "0.95rem", margin: "0 0 32px", lineHeight: 1.45 }}>
                    Your personal AI stylist awaits.
                  </p>
                </div>
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
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -4 }}>
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={authLoading}
                      style={{
                        background: "none",
                        border: "none",
                        padding: "4px 0",
                        color: COLORS.primary,
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        cursor: authLoading ? "not-allowed" : "pointer",
                        opacity: authLoading ? 0.65 : 1,
                        textDecoration: "underline",
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  {authError && <p style={{ color: "#C0392B", fontSize: "0.85rem", margin: 0 }}>{authError}</p>}
                  {authResetMessage && (
                    <p style={{ color: COLORS.success, fontSize: "0.85rem", margin: 0, lineHeight: 1.45 }}>{authResetMessage}</p>
                  )}
                  <button
                    type="submit" disabled={authLoading}
                    style={{ padding: "13px", borderRadius: 10, border: "none", background: COLORS.primary, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.95rem", fontWeight: 600, cursor: authLoading ? "not-allowed" : "pointer", opacity: authLoading ? 0.7 : 1, marginTop: 4 }}
                  >
                    {authLoading
                      ? "Please wait…"
                      : authMode === "login"
                        ? "Sign In"
                        : "Get started free"}
                  </button>
                </form>
                <p style={{ textAlign: "center", marginTop: 24, fontSize: "0.88rem", color: COLORS.textMuted }}>
                  {authMode === "login"
                    ? "Don't have an account? "
                    : "Have an account? "}
                  <button
                    onClick={() => {
                      setAuthMode(authMode === "login" ? "signup" : "login");
                      setAuthError("");
                      setAuthResetMessage("");
                    }}
                    style={{ background: "none", border: "none", color: COLORS.primary, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "0.88rem", fontWeight: 600, padding: 0 }}
                  >
                    {authMode === "login" ? "Sign up" : "Sign in"}
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginTop: 22,
                    paddingTop: 20,
                    borderTop: "1px solid rgba(26, 18, 8, 0.08)",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M7 10V8a5 5 0 0110 0v2M6 10h12a1 1 0 011 1v8a2 2 0 01-2 2H7a2 2 0 01-2-2v-8a1 1 0 011-1z"
                      stroke="#7a6a58"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span style={{ fontSize: "0.8rem", color: "#7a6a58", fontWeight: 500 }}>
                    Free to try · No credit card required
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (firebaseUser && /^\/app\/?$/i.test(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  if (!onboardingDone) {
    return (
      <>
        {/* SEO — update per route as app grows */}
        <Helmet>
          <title>{SEO_SITE_TITLE}</title>
          <meta name="description" content={SEO_META_DESCRIPTION} />
        </Helmet>
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
          uploadWardrobeItem={addWardrobeFromFile}
          baseTransition={baseTransition}
          GENDER_OPTIONS={GENDER_OPTIONS}
          BUDGET_OPTIONS={BUDGET_OPTIONS}
          STYLE_PREFS={STYLE_PREFS}
          BRANDS={BRANDS}
        />
      </>
    );
  }

  return (
    <>
      {/* SEO — update per route as app grows */}
      <Helmet>
        <title>{SEO_SITE_TITLE}</title>
        <meta name="description" content={SEO_META_DESCRIPTION} />
      </Helmet>
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
              agentInsights={agentInsights}
              events={events}
              baseTransition={baseTransition}
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

