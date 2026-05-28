export function resolveColorHex(name) {
  const map = {
    white: "#f0ede8",
    "off-white": "#f0ede8",
    ivory: "#f5f0e8",
    cream: "#e8d5b0",
    beige: "#d4b896",
    tan: "#c9a87c",
    khaki: "#c3b091",
    taupe: "#b5a08a",
    sand: "#c8b89a",
    ecru: "#d9cbb8",
    oatmeal: "#d4c5a9",
    gray: "#9e9e9e",
    grey: "#9e9e9e",
    "light gray": "#bdbdbd",
    "light grey": "#bdbdbd",
    "dark gray": "#616161",
    "dark grey": "#616161",
    charcoal: "#455a64",
    silver: "#b0bec5",
    black: "#1a1a1a",
    blue: "#1565c0",
    "light blue": "#64b5f6",
    "sky blue": "#81d4fa",
    navy: "#1a237e",
    "dark blue": "#0d1b5e",
    cobalt: "#1a47b8",
    royal: "#2957d4",
    denim: "#5b7fa6",
    indigo: "#3949ab",
    "baby blue": "#90caf9",
    green: "#2e7d32",
    "light green": "#66bb6a",
    olive: "#827717",
    sage: "#7d9b76",
    mint: "#80cbc4",
    emerald: "#00695c",
    forest: "#1b5e20",
    khaki_green: "#8d9a4a",
    red: "#c62828",
    "dark red": "#7f0000",
    burgundy: "#6a1b1b",
    maroon: "#880e4f",
    wine: "#7b1b3a",
    crimson: "#b71c1c",
    pink: "#f48fb1",
    "light pink": "#f8bbd0",
    "hot pink": "#e91e8c",
    blush: "#f4c2c2",
    rose: "#e57373",
    coral: "#ff7043",
    salmon: "#ff8a65",
    orange: "#e65100",
    amber: "#ff8f00",
    yellow: "#f9a825",
    gold: "#c79c1e",
    mustard: "#b8971a",
    "dark yellow": "#a8860a",
    purple: "#6a1b9a",
    lavender: "#b39ddb",
    lilac: "#c5b4e3",
    violet: "#7b1fa2",
    plum: "#4a148c",
    mauve: "#9c6b8a",
    brown: "#4e342e",
    "dark brown": "#3e2723",
    "light brown": "#8d6e63",
    camel: "#c19a6b",
    chocolate: "#3e1a0e",
    rust: "#b84a1e",
    terracotta: "#c1623f",
    "bright white": "#ffffff",
    "pure white": "#ffffff",
  };

  const key = String(name || "").toLowerCase().trim();
  for (const [k, v] of Object.entries(map)) {
    if (key === k || key.includes(k)) return v;
  }
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 55%)`;
}

/**
 * Returns true if the color is light enough to need a border for visibility
 * on light backgrounds (Planner card is ~#faf7f2).
 */
export function colorNeedsBorder(hex) {
  if (!hex || !hex.startsWith("#")) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.75;
}
