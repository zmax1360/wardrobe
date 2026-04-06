import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";

const STORAGE_PROFILE = "fos_profile";
const STORAGE_WARDROBE = "fos_wardrobe";
const STORAGE_EVENTS = "fos_events";

const COLORS = {
  bg: "#FAF7F4",
  surface: "#F2EDE8",
  card: "#EDE6DF",
  border: "#DDD4C8",
  accent: "#C4622D",
  accentLight: "rgba(196, 98, 45, 0.1)",
  accentMid: "rgba(196, 98, 45, 0.2)",
  text: "#1C1917",
  muted: "#78716C",
  subtle: "#A8A29E",
};

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
  "Dresses",
  "Outerwear",
  "Shoes",
  "Accessories",
  "Bags",
];

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const OPENAI_VISION_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_VISION_MODEL = "gpt-4o";

const CATALOG_SYSTEM =
  "You are a fashion cataloger for a personal wardrobe app. Analyze the clothing/accessories in the image and return a single JSON object with keys: " +
  "name, category (one of: Tops, Bottoms, Dresses, Outerwear, Shoes, Accessories, Bags), color, style, season, tags (array of strings), material, description. " +
  "Output rules: respond with ONLY raw JSON — no markdown fences, no code blocks, no explanation, apology, or other prose. Start with { and end with }. " +
  "If the image shows wearable items or bags, always produce your best-effort JSON; do not refuse or say you cannot.";

/** Prefer Anthropic if present; else first OpenAI key found (CRA: use REACT_APP_*). */
function resolveVisionCredentials() {
  const anthropic =
    trimEnv(process.env.REACT_APP_ANTHROPIC_API_KEY) ||
    trimEnv(process.env.ANTHROPIC_API_KEY) ||
    trimEnv(process.env.ANTHROPIC_API_KEK);
  if (anthropic) return { provider: "anthropic", key: anthropic };
  const openai =
    trimEnv(process.env.REACT_APP_OPENAI_API_KEY) ||
    trimEnv(process.env.OPENAI_API_KEY) ||
    trimEnv(process.env.OPEN_AI_KEY);
  if (openai) return { provider: "openai", key: openai };
  return null;
}

function trimEnv(v) {
  if (v == null || typeof v !== "string") return "";
  const s = v.trim();
  return s || "";
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function extractJsonObjectSlice(s) {
  const start = s.indexOf("{");
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
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function callTextCompletion(system, user) {
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
      messages: [{ role: "user", content: user }],
    };
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": creds.key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-calls": "true",
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
    return String(text || "").trim();
  }

  const body = {
    model: OPENAI_VISION_MODEL,
    max_tokens: 2048,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
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
  return String(data?.choices?.[0]?.message?.content || "").trim();
}

function parseCatalogJson(text) {
  let s = (text || "").trim();
  if (!s) {
    throw new Error("Empty response from the model. Try again.");
  }

  const fence = /```(?:json)?\s*([\s\S]*?)```/i;
  const fm = s.match(fence);
  if (fm) s = fm[1].trim();

  const tryParse = (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(s);
  if (parsed && typeof parsed === "object") return parsed;

  const slice = extractJsonObjectSlice(s);
  if (slice) {
    parsed = tryParse(slice);
    if (parsed && typeof parsed === "object") return parsed;
  }

  const preview = s.slice(0, 100).replace(/\s+/g, " ");
  throw new Error(
    "The model did not return catalog JSON (e.g. it answered in plain text). Try another image or check the prompt. " +
      (preview ? `Response started with: "${preview}${s.length > 100 ? "…" : ""}"` : "")
  );
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

async function uploadImageToServer(file) {
  const formData = new FormData();
  formData.append("image", file);
  try {
    const res = await fetch("http://localhost:3001/api/upload-image", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("upload failed");
    const data = await res.json();
    if (!data.url) throw new Error("no url");
    return { url: data.url, filename: data.filename ?? null };
  } catch {
    return { url: URL.createObjectURL(file), filename: null };
  }
}

function defaultProfile() {
  return {
    name: "",
    gender: "",
    bodyType: "",
    budget: "",
    styles: [],
    brands: [],
    topSize: "",
    bottomSize: "",
    shoeSize: "",
  };
}

function stripWardrobeForStorage(items) {
  return items.map(
    ({
      id,
      name,
      category,
      color,
      style,
      season,
      tags,
      material,
      description,
      laundryStatus,
      timesWorn,
      cost,
      imagePreview,
      imageFilename,
    }) => ({
      id,
      name,
      category,
      color,
      style,
      season,
      tags,
      material,
      description,
      laundryStatus,
      timesWorn,
      cost,
      imagePreview,
      imageFilename,
    })
  );
}

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState(null);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [draft, setDraft] = useState(defaultProfile);

  const [activeNav, setActiveNav] = useState("wardrobe");
  const [wardrobe, setWardrobe] = useState([]);
  const [events, setEvents] = useState(() => {
    const e = loadJson(STORAGE_EVENTS, []);
    return Array.isArray(e) ? e : [];
  });
  const [catFilter, setCatFilter] = useState("All");
  const [laundryFilter, setLaundryFilter] = useState("All");
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", color: "", cost: "" });

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
    const p = loadJson(STORAGE_PROFILE, null);
    const w = loadJson(STORAGE_WARDROBE, []);
    setProfile(p);
    setDraft(p ? { ...defaultProfile(), ...p } : defaultProfile());
    setWardrobe(Array.isArray(w) ? w : []);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_WARDROBE, JSON.stringify(stripWardrobeForStorage(wardrobe)));
  }, [wardrobe, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_EVENTS, JSON.stringify(events));
  }, [events, hydrated]);

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
        return Boolean(draft.bodyType);
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
    const creds = resolveVisionCredentials();
    if (!creds) {
      throw new Error(
        "No AI key: set REACT_APP_ANTHROPIC_API_KEY or REACT_APP_OPENAI_API_KEY (or OPENAI_API_KEY / OPEN_AI_KEY)."
      );
    }

    if (creds.provider === "anthropic") {
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
          "x-api-key": creds.key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-calls": "true",
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
      return parseCatalogJson(text);
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
    return parseCatalogJson(text);
  };

  const addWardrobeFromFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }
    setUploadError("");
    setAnalyzing(true);
    let uploadResult = { url: "", filename: null };
    try {
      const mediaType = mediaTypeForFile(file);
      const [uploadRes, b64] = await Promise.all([uploadImageToServer(file), fileToBase64(file)]);
      uploadResult = uploadRes;
      const parsed = await catalogImageWithVision(b64, mediaType);
      const category = CATEGORIES.includes(parsed.category) ? parsed.category : "Accessories";
      const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 20) : [];
      const item = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        imagePreview: uploadResult.url,
        imageFilename: uploadResult.filename,
        name: String(parsed.name || "Untitled"),
        category,
        color: String(parsed.color || ""),
        style: String(parsed.style || ""),
        season: String(parsed.season || ""),
        tags,
        material: String(parsed.material || ""),
        description: String(parsed.description || ""),
        laundryStatus: "clean",
        timesWorn: 0,
        cost: "",
      };
      setWardrobe((prev) => [item, ...prev]);
    } catch (e) {
      if (!uploadResult.filename && uploadResult.url && String(uploadResult.url).startsWith("blob:")) {
        URL.revokeObjectURL(uploadResult.url);
      }
      setUploadError(e.message || "Could not analyze image.");
    } finally {
      setAnalyzing(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) addWardrobeFromFile(f);
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) addWardrobeFromFile(f);
  };

  const updateItem = (id, patch) => {
    setWardrobe((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id) => {
    setWardrobe((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it?.imageFilename) {
        fetch(`http://localhost:3001/api/delete-image/${encodeURIComponent(it.imageFilename)}`, {
          method: "DELETE",
        }).catch(() => {});
      }
      if (it?.imagePreview && String(it.imagePreview).startsWith("blob:")) {
        URL.revokeObjectURL(it.imagePreview);
      }
      return prev.filter((x) => x.id !== id);
    });
  };

  const openEdit = (it) => {
    setEditItem(it);
    setEditForm({
      name: it.name,
      color: it.color,
      cost: it.cost === "" || it.cost == null ? "" : String(it.cost),
    });
  };

  const saveEdit = () => {
    if (!editItem) return;
    const costVal = editForm.cost.trim();
    updateItem(editItem.id, {
      name: editForm.name.trim() || editItem.name,
      color: editForm.color.trim(),
      cost: costVal === "" ? "" : costVal,
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
    activeNav === "wardrobe"
      ? "Wardrobe"
      : activeNav === "calendar"
        ? "Calendar"
        : activeNav === "planner"
          ? "Planner"
          : "Profile";
  const userName = profile?.name || "";

  const upcomingEventCount = useMemo(() => {
    const t = todayYmdLocal();
    return events.filter((ev) => ev && typeof ev.date === "string" && ev.date >= t).length;
  }, [events]);

  const baseTransition = { transition: "all 0.22s ease" };

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
          <p style={{ color: COLORS.muted, margin: "0 0 32px", fontSize: "0.95rem" }}>
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
                  background: n <= onboardingStep ? COLORS.accent : COLORS.card,
                  ...baseTransition,
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
                <label style={{ display: "block", color: COLORS.muted, fontSize: "0.8rem", marginBottom: 8 }}>
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
                    background: COLORS.card,
                    color: COLORS.text,
                    fontSize: "1rem",
                    outline: "none",
                    ...baseTransition,
                  }}
                />
              </>
            )}

            {onboardingStep === 2 && (
              <>
                <p style={{ margin: "0 0 16px", color: COLORS.muted, fontSize: "0.9rem" }}>Gender</p>
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
                            bodyType: d.gender !== opt.value ? "" : d.bodyType,
                          }))
                        }
                        style={{
                          minHeight: 88,
                          padding: "20px 16px",
                          borderRadius: 10,
                          border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                          background: selected ? COLORS.accentLight : COLORS.card,
                          color: COLORS.text,
                          cursor: "pointer",
                          fontSize: "1rem",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          ...baseTransition,
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
                <p style={{ margin: "0 0 16px", color: COLORS.muted, fontSize: "0.9rem" }}>Body type</p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 10,
                  }}
                >
                  {onboardingBodyTypes.map((bt) => {
                    const selected = draft.bodyType === bt;
                    return (
                      <button
                        key={bt}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, bodyType: bt }))}
                        style={{
                          padding: "14px 12px",
                          borderRadius: 10,
                          border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                          background: selected ? COLORS.accentLight : COLORS.card,
                          color: COLORS.text,
                          cursor: "pointer",
                          fontSize: "0.88rem",
                          textAlign: "left",
                          ...baseTransition,
                        }}
                      >
                        {bt}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {onboardingStep === 4 && (
              <>
                <p style={{ margin: "0 0 16px", color: COLORS.muted, fontSize: "0.9rem" }}>Shopping budget</p>
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
                          border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                          background: selected ? COLORS.accentLight : COLORS.card,
                          color: COLORS.text,
                          cursor: "pointer",
                          ...baseTransition,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.label}</div>
                        <div style={{ fontSize: "0.82rem", color: COLORS.muted }}>{b.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {onboardingStep === 5 && (
              <>
                <p style={{ margin: "0 0 16px", color: COLORS.muted, fontSize: "0.9rem" }}>
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
                          border: `1px solid ${on ? COLORS.accent : COLORS.border}`,
                          background: on ? COLORS.accentLight : COLORS.card,
                          color: on ? COLORS.text : COLORS.muted,
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          ...baseTransition,
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
                <p style={{ margin: "0 0 16px", color: COLORS.muted, fontSize: "0.9rem" }}>
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
                          border: `1px solid ${on ? COLORS.accent : COLORS.border}`,
                          background: on ? COLORS.accentLight : COLORS.card,
                          color: on ? COLORS.text : COLORS.muted,
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          ...baseTransition,
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
                <p style={{ margin: "0 0 12px", color: COLORS.muted, fontSize: "0.9rem" }}>Top size</p>
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
                          border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                          background: selected ? COLORS.accentLight : COLORS.card,
                          color: COLORS.text,
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          ...baseTransition,
                        }}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
                <p style={{ margin: "0 0 12px", color: COLORS.muted, fontSize: "0.9rem" }}>Bottom size</p>
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
                          border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                          background: selected ? COLORS.accentLight : COLORS.card,
                          color: COLORS.text,
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          ...baseTransition,
                        }}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
                <p style={{ margin: "0 0 12px", color: COLORS.muted, fontSize: "0.9rem" }}>Shoe size (US)</p>
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
                          border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                          background: selected ? COLORS.accentLight : COLORS.card,
                          color: COLORS.text,
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          ...baseTransition,
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
                  color: onboardingStep === 1 ? COLORS.muted : COLORS.text,
                  cursor: onboardingStep === 1 ? "default" : "pointer",
                  ...baseTransition,
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
                  background: canAdvance ? COLORS.accent : COLORS.card,
                  color: canAdvance ? "#FAF7F4" : COLORS.muted,
                  cursor: canAdvance ? "pointer" : "default",
                  fontWeight: 600,
                  ...baseTransition,
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

  const profileIcon =
    profile?.gender === "male"
      ? "👨"
      : profile?.gender === "female"
        ? "👩"
        : profile?.gender === "nonbinary" || profile?.gender === "undisclosed"
          ? "🧑"
          : "✦";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
      }}
    >
      <aside
        style={{
          width: 80,
          flexShrink: 0,
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          background: COLORS.surface,
          borderRight: `1px solid ${COLORS.border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 24,
          gap: 8,
          zIndex: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 24,
            padding: "12px 0",
            borderBottom: `1px solid ${COLORS.border}`,
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: "0.6rem",
              letterSpacing: "0.2em",
              color: COLORS.accent,
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            F·O·S
          </div>
          <div style={{ fontSize: "1.8rem", lineHeight: 1 }}>{profileIcon}</div>
        </div>
        {[
          { id: "wardrobe", icon: "👗", label: "Wardrobe" },
          { id: "calendar", icon: "📅", label: "Calendar" },
          { id: "planner", icon: "✨", label: "Planner" },
        ].map((nav) => {
          const active = activeNav === nav.id;
          return (
            <button
              key={nav.id}
              type="button"
              title={nav.label}
              onClick={() => setActiveNav(nav.id)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                border: active ? `1px solid ${COLORS.accent}` : `1px solid transparent`,
                background: active ? COLORS.accentLight : "transparent",
                cursor: "pointer",
                fontSize: "1.35rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                ...baseTransition,
              }}
            >
              {nav.icon}
              {nav.id === "wardrobe" && stats.total > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 999,
                    background: COLORS.accent,
                    color: "#FAF7F4",
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {stats.total > 99 ? "99+" : stats.total}
                </span>
              )}
              {nav.id === "calendar" && upcomingEventCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 999,
                    background: COLORS.accent,
                    color: "#FAF7F4",
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {upcomingEventCount > 99 ? "99+" : upcomingEventCount}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setActiveNav("profile")}
          style={{
            marginTop: "auto",
            marginBottom: 16,
            background: "transparent",
            border: "none",
            color: COLORS.subtle,
            fontSize: "0.6rem",
            letterSpacing: "0.1em",
            cursor: "pointer",
            textTransform: "uppercase",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Profile
        </button>
      </aside>

      <div style={{ marginLeft: 80, flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "rgba(250, 247, 244, 0.92)",
            backdropFilter: "blur(8px)",
            borderBottom: `1px solid ${COLORS.border}`,
            padding: "20px 32px",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: COLORS.accent, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {agentTitle}
          </div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "1.75rem",
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            Welcome{userName ? `, ${userName}` : ""}
          </div>
        </header>

        <main style={{ padding: "28px 32px 48px", flex: 1 }}>
          {activeNav === "wardrobe" && (
            <>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => !analyzing && fileRef.current?.click()}
                style={{
                  border: `1px dashed ${analyzing ? COLORS.muted : COLORS.accent}`,
                  borderRadius: 12,
                  padding: "36px 24px",
                  textAlign: "center",
                  marginBottom: 28,
                  background: COLORS.surface,
                  cursor: analyzing ? "wait" : "pointer",
                  opacity: analyzing ? 0.85 : 1,
                  ...baseTransition,
                }}
              >
                {analyzing ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        border: `3px solid ${COLORS.border}`,
                        borderTopColor: COLORS.accent,
                        borderRadius: "50%",
                        animation: "fosSpin 0.8s linear infinite",
                      }}
                    />
                    <style>{`@keyframes fosSpin { to { transform: rotate(360deg); } }`}</style>
                    <span style={{ color: COLORS.muted }}>Analyzing image…</span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>＋</div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop a photo or click to upload</div>
                    <div style={{ color: COLORS.muted, fontSize: "0.88rem" }}>
                      JPEG, PNG, WebP — AI vision cataloging
                    </div>
                  </>
                )}
              </div>
              {uploadError && (
                <div
                  style={{
                    color: "#e8a0a0",
                    fontSize: "0.88rem",
                    marginTop: -16,
                    marginBottom: 20,
                  }}
                >
                  {uploadError}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  marginBottom: 20,
                  fontSize: "0.88rem",
                  color: COLORS.muted,
                }}
              >
                <span>
                  <strong style={{ color: COLORS.text }}>{stats.total}</strong> items
                </span>
                <span>·</span>
                <span>
                  Clean <strong style={{ color: COLORS.text }}>{stats.clean}</strong>
                </span>
                <span>·</span>
                <span>
                  Dirty <strong style={{ color: COLORS.text }}>{stats.dirty}</strong>
                </span>
                <span>·</span>
                <span>
                  In wash <strong style={{ color: COLORS.text }}>{stats.wash}</strong>
                </span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {["All", ...CATEGORIES].map((c) => {
                  const on = catFilter === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCatFilter(c)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: `1px solid ${on ? COLORS.accent : COLORS.border}`,
                        background: on ? COLORS.accentLight : COLORS.card,
                        color: on ? COLORS.text : COLORS.muted,
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        ...baseTransition,
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
                        border: `1px solid ${on ? COLORS.accent : COLORS.border}`,
                        background: on ? COLORS.accentLight : COLORS.card,
                        color: on ? COLORS.text : COLORS.muted,
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        ...baseTransition,
                      }}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>

              {filteredWardrobe.length === 0 ? (
                <p style={{ color: COLORS.muted }}>No pieces match these filters.</p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 20,
                  }}
                >
                  {filteredWardrobe.map((it) => {
                    const tags = (it.tags || []).slice(0, 3);
                    const costNum = parseFloat(String(it.cost).replace(/[^0-9.]/g, ""));
                    const cpw =
                      it.timesWorn > 0 && !Number.isNaN(costNum) && costNum > 0
                        ? (costNum / it.timesWorn).toFixed(2)
                        : null;

                    const laundryLabel =
                      it.laundryStatus === "clean"
                        ? "Clean ✓"
                        : it.laundryStatus === "dirty"
                          ? "Dirty ✗"
                          : "In Wash ↻";

                    return (
                      <div
                        key={it.id}
                        style={{
                          background: COLORS.card,
                          borderRadius: 12,
                          overflow: "hidden",
                          border: `1px solid ${COLORS.border}`,
                          display: "flex",
                          flexDirection: "column",
                          ...baseTransition,
                        }}
                      >
                        <div style={{ position: "relative", aspectRatio: "4/5", background: COLORS.surface }}>
                          {it.imagePreview ? (
                            <img
                              src={it.imagePreview}
                              alt=""
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: COLORS.muted,
                                fontSize: "0.85rem",
                              }}
                            >
                              No photo
                            </div>
                          )}
                          <span
                            style={{
                              position: "absolute",
                              top: 10,
                              left: 10,
                              padding: "4px 8px",
                              borderRadius: 6,
                              background: "rgba(28,25,23,0.7)",
                              fontSize: "0.7rem",
                              color: COLORS.text,
                            }}
                          >
                            {laundryLabel}
                          </span>
                          <span
                            style={{
                              position: "absolute",
                              top: 10,
                              right: 10,
                              padding: "4px 8px",
                              borderRadius: 6,
                              background: COLORS.accent,
                              color: "#FAF7F4",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                            }}
                          >
                            {it.category}
                          </span>
                        </div>
                        <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                          <div
                            style={{
                              fontFamily: "'Cormorant Garamond', serif",
                              fontSize: "1.25rem",
                              fontWeight: 600,
                            }}
                          >
                            {it.name}
                          </div>
                          <div style={{ fontSize: "0.85rem", color: COLORS.muted }}>
                            {it.color}
                            {it.season ? ` · ${it.season}` : ""}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {tags.map((t) => (
                              <span
                                key={t}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  background: COLORS.card,
                                  fontSize: "0.72rem",
                                  color: COLORS.muted,
                                }}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                          {it.description && (
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: COLORS.muted,
                                lineHeight: 1.5,
                                fontStyle: "italic",
                              }}
                            >
                              {it.description}
                            </div>
                          )}
                          <div style={{ fontSize: "0.82rem", color: COLORS.muted }}>
                            Worn <strong style={{ color: COLORS.text }}>{it.timesWorn}</strong> times
                            {cpw != null && (
                              <>
                                {" "}
                                · CPW <strong style={{ color: COLORS.text }}>${cpw}</strong>
                              </>
                            )}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {[
                              { key: "clean", label: "Clean" },
                              { key: "dirty", label: "Dirty" },
                              { key: "wash", label: "In wash" },
                            ].map((b) => (
                              <button
                                key={b.key}
                                type="button"
                                onClick={() => updateItem(it.id, { laundryStatus: b.key })}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 6,
                                  border: `1px solid ${it.laundryStatus === b.key ? COLORS.accent : COLORS.border}`,
                                  background: it.laundryStatus === b.key ? COLORS.accentLight : COLORS.card,
                                  color: COLORS.text,
                                  cursor: "pointer",
                                  fontSize: "0.72rem",
                                  ...baseTransition,
                                }}
                              >
                                {b.label}
                              </button>
                            ))}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "auto" }}>
                            <button
                              type="button"
                              onClick={() =>
                                updateItem(it.id, {
                                  timesWorn: (it.timesWorn || 0) + 1,
                                  laundryStatus: "dirty",
                                })
                              }
                              style={{
                                flex: 1,
                                minWidth: 100,
                                padding: "10px",
                                borderRadius: 8,
                                border: "none",
                                background: COLORS.accent,
                                color: "#FAF7F4",
                                fontWeight: 600,
                                cursor: "pointer",
                                fontSize: "0.82rem",
                                ...baseTransition,
                              }}
                            >
                              Wore it
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(it)}
                              style={{
                                padding: "10px 14px",
                                borderRadius: 8,
                                border: `1px solid ${COLORS.border}`,
                                background: "transparent",
                                color: COLORS.text,
                                cursor: "pointer",
                                fontSize: "0.82rem",
                                ...baseTransition,
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItem(it.id)}
                              style={{
                                padding: "10px 14px",
                                borderRadius: 8,
                                border: `1px solid rgba(232,160,160,0.35)`,
                                background: "transparent",
                                color: "#e8a0a0",
                                cursor: "pointer",
                                fontSize: "0.82rem",
                                ...baseTransition,
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeNav === "calendar" && (
            <CalendarAgent events={events} setEvents={setEvents} baseTransition={baseTransition} />
          )}
          {activeNav === "planner" && (
            <PlannerAgent
              profile={profile}
              wardrobe={wardrobe}
              events={events}
              setActiveNav={setActiveNav}
              baseTransition={baseTransition}
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
      </div>

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
            style={{
              width: "100%",
              maxWidth: 400,
              background: COLORS.surface,
              borderRadius: 12,
              padding: 24,
              border: `1px solid ${COLORS.border}`,
            }}
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
            <label style={{ display: "block", color: COLORS.muted, fontSize: "0.75rem", marginBottom: 6 }}>Name</label>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.card,
                color: COLORS.text,
              }}
            />
            <label style={{ display: "block", color: COLORS.muted, fontSize: "0.75rem", marginBottom: 6 }}>Color</label>
            <input
              value={editForm.color}
              onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.card,
                color: COLORS.text,
              }}
            />
            <label style={{ display: "block", color: COLORS.muted, fontSize: "0.75rem", marginBottom: 6 }}>
              Cost (optional, for CPW)
            </label>
            <input
              value={editForm.cost}
              onChange={(e) => setEditForm((f) => ({ ...f, cost: e.target.value }))}
              placeholder="e.g. 89"
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 20,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.card,
                color: COLORS.text,
              }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setEditItem(null)}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: "transparent",
                  color: COLORS.text,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: COLORS.accent,
                  color: "#FAF7F4",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
    background: COLORS.card,
    color: COLORS.text,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "0.9rem",
  };

  const labelStyle = { display: "block", color: COLORS.muted, fontSize: "0.75rem", marginBottom: 6 };

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
      <p style={{ color: COLORS.muted, margin: "0 0 24px", fontSize: "0.9rem" }}>Plan outfits around your schedule.</p>

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
              background: form.title.trim() && form.date ? COLORS.accent : COLORS.border,
              color: "#FAF7F4",
              fontWeight: 600,
              cursor: form.title.trim() && form.date ? "pointer" : "default",
              ...baseTransition,
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
                ...baseTransition,
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
        <p style={{ color: COLORS.muted }}>No upcoming events.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
          {sortedUpcoming.map((ev) => (
            <div
              key={ev.id}
              style={{
                background: COLORS.card,
                borderRadius: 12,
                padding: 16,
                border: `1px solid ${COLORS.border}`,
                ...baseTransition,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "1.05rem", marginBottom: 6 }}>{ev.title}</div>
                  <div style={{ color: COLORS.muted, fontSize: "0.85rem", marginBottom: 8 }}>
                    {formatDisplayDate(ev.date)} · <span style={{ color: COLORS.text }}>{daysRelativeLabel(ev.date)}</span>
                  </div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: COLORS.accentLight,
                      color: COLORS.accent,
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      marginRight: 8,
                      marginBottom: 6,
                    }}
                  >
                    {ev.occasionType}
                  </span>
                  <div style={{ fontSize: "0.82rem", color: COLORS.muted }}>{ev.dressCode}</div>
                  {ev.location ? (
                    <div style={{ fontSize: "0.82rem", color: COLORS.muted, marginTop: 6 }}>📍 {ev.location}</div>
                  ) : null}
                  {ev.notes ? (
                    <div style={{ fontSize: "0.8rem", color: COLORS.muted, marginTop: 8, lineHeight: 1.5 }}>{ev.notes}</div>
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
                      ...baseTransition,
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
                      ...baseTransition,
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
          ...baseTransition,
        }}
      >
        <span>{pastOpen ? "▼" : "▶"}</span>
        Past events {sortedPast.length > 0 ? `(${sortedPast.length})` : ""}
      </button>
      {pastOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sortedPast.length === 0 ? (
            <p style={{ color: COLORS.muted, fontSize: "0.9rem" }}>No past events.</p>
          ) : (
            sortedPast.map((ev) => (
              <div
                key={ev.id}
                style={{
                  background: COLORS.card,
                  borderRadius: 12,
                  padding: 16,
                  border: `1px solid ${COLORS.border}`,
                  opacity: 0.92,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{ev.title}</div>
                    <div style={{ color: COLORS.muted, fontSize: "0.85rem" }}>
                      {formatDisplayDate(ev.date)} · {daysRelativeLabel(ev.date)}
                    </div>
                    <div style={{ fontSize: "0.82rem", color: COLORS.muted, marginTop: 6 }}>
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
                        ...baseTransition,
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
                        ...baseTransition,
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
    `Body type: ${p.bodyType || "—"}`,
    `Budget: ${p.budget || "—"}`,
    `Styles: ${Array.isArray(p.styles) && p.styles.length ? p.styles.join(", ") : "—"}`,
    `Brands: ${Array.isArray(p.brands) && p.brands.length ? p.brands.join(", ") : "—"}`,
    `Sizes: top ${p.topSize || "—"}, bottom ${p.bottomSize || "—"}, shoe ${p.shoeSize || "—"}`,
  ];
  return lines.join("\n");
}

function buildCleanWardrobeList(items) {
  const clean = items.filter((it) => it.laundryStatus === "clean");
  if (clean.length === 0) return "";
  return clean
    .map((it) => `- ${it.name} (${it.category}): ${it.color}, style: ${it.style || "—"}, season: ${it.season || "—"}`)
    .join("\n");
}

function PlannerAgent({ profile, wardrobe, events, setActiveNav, baseTransition }) {
  const [mode, setMode] = useState("everyday");
  const [occasion, setOccasion] = useState("");
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
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

  const cleanItems = useMemo(() => wardrobe.filter((it) => it.laundryStatus === "clean"), [wardrobe]);

  const resetPlan = () => {
    setResult("");
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
    const wardrobeLines = buildCleanWardrobeList(cleanItems);
    const weatherContext = weather ? `Current weather: ${weather.summary}` : "Weather unknown";

    let occasionText = "";
    if (mode === "everyday") {
      occasionText = occasion.trim();
    } else if (selectedEvent) {
      occasionText = `Event "${selectedEvent.title}" on ${formatDisplayDate(selectedEvent.date)} (${daysRelativeLabel(selectedEvent.date)}). Occasion: ${selectedEvent.occasionType}. Dress code: ${selectedEvent.dressCode}.`;
      if (selectedEvent.location) occasionText += ` Location: ${selectedEvent.location}.`;
      if (selectedEvent.notes) occasionText += ` Notes: ${selectedEvent.notes}`;
      occasionText += " The outfit must respect the stated dress code.";
    }

    const system =
      "You are a personal fashion stylist. " +
      `${weatherContext}\n\n` +
      `The user has the following profile:\n${profileSummary}\n\n` +
      `Their clean wardrobe items are:\n${wardrobeLines}\n\n` +
      `Suggest a complete outfit for: ${occasionText}\n` +
      "Be specific — only use items from their wardrobe.\n" +
      "Format your response with:\n" +
      "- Outfit name\n" +
      "- Items to wear (from their wardrobe)\n" +
      "- Styling tips\n" +
      "- Why this works for the occasion";

    const user = "Provide the outfit plan now.";

    setLoading(true);
    try {
      const text = await callTextCompletion(system, user);
      setResult(text);
      setMatchedItems(matchOutfitItems(text, cleanItems));
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
          border: `1px solid ${on ? COLORS.accent : COLORS.border}`,
          background: on ? COLORS.accentLight : COLORS.card,
          color: on ? COLORS.text : COLORS.muted,
          cursor: "pointer",
          fontSize: "0.85rem",
          ...baseTransition,
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
      <p style={{ color: COLORS.muted, margin: "0 0 20px", fontSize: "0.9rem" }}>AI outfit ideas from your clean wardrobe.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {pill("everyday", "Everyday")}
        {pill("event", "For an Event")}
      </div>

      {wardrobe.length === 0 && (
        <p style={{ color: COLORS.muted, marginBottom: 16 }}>Add clothes to your wardrobe first</p>
      )}
      {wardrobe.length > 0 && cleanItems.length === 0 && (
        <p style={{ color: COLORS.muted, marginBottom: 16 }}>All your clothes are dirty or in the wash!</p>
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
              background: COLORS.card,
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
                  color: COLORS.muted,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Current Weather
              </div>
              {weatherLoading && (
                <div style={{ color: COLORS.muted, fontSize: "0.85rem" }}>Detecting location...</div>
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
                color: COLORS.muted,
                fontSize: "0.75rem",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              ↻ Refresh
            </button>
          </div>
          <label style={{ display: "block", color: COLORS.muted, fontSize: "0.75rem", marginBottom: 6 }}>
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
              background: COLORS.card,
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
            <p style={{ color: COLORS.muted, margin: 0, lineHeight: 1.6 }}>
              No upcoming events. Add one in the Calendar first.{" "}
              <button
                type="button"
                onClick={() => setActiveNav("calendar")}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: COLORS.accent,
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
              <label style={{ display: "block", color: COLORS.muted, fontSize: "0.75rem", marginBottom: 6 }}>
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
                  background: COLORS.card,
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
                    background: COLORS.card,
                    borderRadius: 10,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: "0.88rem",
                    color: COLORS.muted,
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
                : COLORS.accent,
            color: "#FAF7F4",
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
            ...baseTransition,
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
              borderTopColor: COLORS.accent,
              borderRadius: "50%",
              animation: "fosSpin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes fosSpin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ color: COLORS.muted }}>Stylist is thinking…</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: COLORS.accentLight,
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
          {matchedItems.length > 0 && (
            <div
              style={{
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  fontSize: "0.7rem",
                  letterSpacing: "0.15em",
                  color: COLORS.muted,
                  textTransform: "uppercase",
                  marginBottom: 12,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Your Look
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 16,
                }}
              >
                {matchedItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        width: 90,
                        height: 110,
                        borderRadius: 10,
                        overflow: "hidden",
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.card,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {item.imagePreview ? (
                        <img
                          src={item.imagePreview}
                          alt={item.name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: "1.5rem" }}>👗</span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: COLORS.muted,
                        textAlign: "center",
                        maxWidth: 90,
                        lineHeight: 1.3,
                      }}
                    >
                      {item.name}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: String(item.color || "").toLowerCase(),
                          border: `1px solid ${COLORS.border}`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.65rem",
                          color: COLORS.subtle,
                        }}
                      >
                        {item.color}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {matchedItems.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 0,
                    height: 8,
                    borderRadius: 4,
                    overflow: "hidden",
                    marginBottom: 8,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  {matchedItems.map((item) => (
                    <div
                      key={`${item.id}-palette`}
                      style={{
                        flex: 1,
                        background: String(item.color || "").toLowerCase(),
                      }}
                      title={item.color}
                    />
                  ))}
                </div>
              )}

              <div
                style={{
                  fontSize: "0.75rem",
                  color: COLORS.subtle,
                  fontStyle: "italic",
                }}
              >
                {matchedItems.length} piece{matchedItems.length !== 1 ? "s" : ""} ·{" "}
                {matchedItems.map((i) => i.color).join(", ")}
              </div>
            </div>
          )}

          <div
            style={{
              background: COLORS.card,
              borderRadius: 12,
              padding: 24,
              border: `1px solid ${COLORS.border}`,
              whiteSpace: "pre-wrap",
              fontSize: "0.92rem",
              lineHeight: 1.65,
              color: COLORS.text,
              marginBottom: 16,
            }}
          >
            {result}
          </div>
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
              ...baseTransition,
            }}
          >
            Plan another
          </button>
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
              background: n === step ? COLORS.accent : COLORS.card,
              ...baseTransition,
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
            <label style={{ display: "block", color: COLORS.muted, fontSize: "0.8rem", marginBottom: 8 }}>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.card,
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
                    border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                    background: selected ? COLORS.accentLight : COLORS.card,
                    color: COLORS.text,
                    cursor: "pointer",
                    fontSize: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    ...baseTransition,
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
                    border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                    background: selected ? COLORS.accentLight : COLORS.card,
                    color: COLORS.text,
                    cursor: "pointer",
                    fontSize: "0.88rem",
                    ...baseTransition,
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
                    border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                    background: selected ? COLORS.accentLight : COLORS.card,
                    color: COLORS.text,
                    cursor: "pointer",
                    ...baseTransition,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{b.label}</div>
                  <div style={{ fontSize: "0.82rem", color: COLORS.muted }}>{b.sub}</div>
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
                    border: `1px solid ${on ? COLORS.accent : COLORS.border}`,
                    background: on ? COLORS.accentLight : COLORS.card,
                    color: on ? COLORS.text : COLORS.muted,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    ...baseTransition,
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
                    border: `1px solid ${on ? COLORS.accent : COLORS.border}`,
                    background: on ? COLORS.accentLight : COLORS.card,
                    color: on ? COLORS.text : COLORS.muted,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    ...baseTransition,
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
            <p style={{ margin: "0 0 10px", color: COLORS.muted, fontSize: "0.85rem" }}>Top</p>
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
                      border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                      background: selected ? COLORS.accentLight : COLORS.card,
                      color: COLORS.text,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      ...baseTransition,
                    }}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: "0 0 10px", color: COLORS.muted, fontSize: "0.85rem" }}>Bottom</p>
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
                      border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                      background: selected ? COLORS.accentLight : COLORS.card,
                      color: COLORS.text,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      ...baseTransition,
                    }}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: "0 0 10px", color: COLORS.muted, fontSize: "0.85rem" }}>Shoe (US)</p>
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
                      border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                      background: selected ? COLORS.accentLight : COLORS.card,
                      color: COLORS.text,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      ...baseTransition,
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
              color: step === 1 ? COLORS.muted : COLORS.text,
              cursor: step === 1 ? "default" : "pointer",
              ...baseTransition,
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
              background: COLORS.card,
              color: !canAdvance || step === 7 ? COLORS.muted : COLORS.text,
              cursor: !canAdvance || step === 7 ? "default" : "pointer",
              ...baseTransition,
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
            background: COLORS.accent,
            color: "#FAF7F4",
            fontWeight: 600,
            cursor: "pointer",
            ...baseTransition,
          }}
        >
          Save profile
        </button>
      </div>
    </div>
  );
}
