export function dedupeStrings(ordered) {
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

export function bodyTypesForGender(g) {
  if (g === "male") return BODY_TYPES_MALE;
  if (g === "female") return BODY_TYPES_FEMALE;
  if (g === "nonbinary" || g === "undisclosed") return BODY_TYPES_NONBINARY;
  return [];
}

const TOP_SIZES_FEMALE = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
const TOP_SIZES_MALE = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];

export function topSizesForGender(g) {
  if (g === "male") return TOP_SIZES_MALE;
  if (g === "female") return TOP_SIZES_FEMALE;
  return dedupeStrings([...TOP_SIZES_FEMALE, ...TOP_SIZES_MALE]);
}

const BOTTOM_SIZES_FEMALE = ["24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "36"];
const BOTTOM_SIZES_MALE = ["28", "29", "30", "31", "32", "33", "34", "36", "38", "40"];

export function bottomSizesForGender(g) {
  if (g === "male") return BOTTOM_SIZES_MALE;
  if (g === "female") return BOTTOM_SIZES_FEMALE;
  return dedupeStrings([...BOTTOM_SIZES_FEMALE, ...BOTTOM_SIZES_MALE]);
}

const SHOE_SIZES_FEMALE = ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11"];
const SHOE_SIZES_MALE = ["7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13", "14", "15"];

export function shoeSizesForGender(g) {
  if (g === "male") return SHOE_SIZES_MALE;
  if (g === "female") return SHOE_SIZES_FEMALE;
  return dedupeStrings([...SHOE_SIZES_FEMALE, ...SHOE_SIZES_MALE]);
}

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mediaTypeForFile(file) {
  const t = file.type;
  if (t === "image/jpeg" || t === "image/png" || t === "image/gif" || t === "image/webp")
    return t;
  return "image/jpeg";
}

export function fileToBase64(file) {
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

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function compressImage(file, maxWidth = 800, quality = 0.6) {
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

export function defaultProfile() {
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
export function calculateCPW(price, wears) {
  const p = typeof price === "number" && Number.isFinite(price) ? price : parseFloat(String(price ?? 0).replace(/[^0-9.-]/g, "")) || 0;
  const w = typeof wears === "number" && Number.isFinite(wears) ? wears : parseInt(String(wears ?? 0), 10) || 0;
  return p / Math.max(w, 1);
}
