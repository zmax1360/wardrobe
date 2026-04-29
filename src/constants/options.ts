export const STORAGE_PROFILE = "fos_profile";
export const STORAGE_EVENTS = "fos_events";
export const STORAGE_WISHLIST = "fos_wishlist";
export const STORAGE_GAP_ANALYSIS_LAST = "fos_gap_analysis_last";

export const GENDER_OPTIONS = [
  { value: "male", icon: "👨", label: "Male" },
  { value: "female", icon: "👩", label: "Female" },
  { value: "nonbinary", icon: "🧑", label: "Non-binary" },
  { value: "undisclosed", icon: "🤐", label: "Prefer not to say" },
];

export const BUDGET_OPTIONS = [
  { id: "budget", label: "Budget", sub: "Mostly under $50 per piece" },
  { id: "mid-range", label: "Mid-range", sub: "$50 – $150 typical" },
  { id: "premium", label: "Premium", sub: "$150 – $400" },
  { id: "luxury", label: "Luxury", sub: "$400+" },
  { id: "mixed", label: "Mixed", sub: "Varies by category" },
];

export const STYLE_PREFS = [
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

export const BRANDS = [
  "Zara", "H&M", "ASOS", "Uniqlo", "Mango",
  "COS", "Nike", "Levi's", "Nordstrom", "Net-a-Porter",
  "Boss", "Massimo Dutti", "Ralph Lauren", "Tommy Hilfiger",
  "Calvin Klein", "Gucci", "Prada", "Balenciaga",
  "Stone Island", "Arc'teryx", "Lululemon", "Adidas",
  "New Balance", "Off-White", "Acne Studios", "A.P.C.",
  "Arket", "& Other Stories",
] as const;

export const CATEGORIES = [
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

export const CATALOG_SYSTEM =
  "You are a fashion cataloger for a personal wardrobe app. Analyze the clothing/accessories in the image and return a single JSON object with keys: " +
  "name, category (one of: Tops, Bottoms, Outerwear, Shoes, Accessories, Dresses, Activewear, Formal, Bags), color, style, season, tags (array of strings), material, description. " +
  "Output rules: respond with ONLY raw JSON — no markdown fences, no code blocks, no explanation, apology, or other prose. Start with { and end with }. " +
  "If the image shows wearable items or bags, always produce your best-effort JSON; do not refuse or say you cannot.";
