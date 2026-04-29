import { todayYmdLocal } from "./helpers";

export const CAL_OCCASION_TYPES = [
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

export const CAL_DRESS_CODES = [
  "No dress code",
  "Smart casual",
  "Business casual",
  "Business formal",
  "Black tie",
  "Cocktail",
  "Themed",
  "Sporty",
];

export function formatDisplayDate(ymd) {
  if (!ymd || typeof ymd !== "string") return "";
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function daysRelativeLabel(ymd) {
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

export function emptyEventForm() {
  return {
    title: "",
    date: "",
    occasionType: CAL_OCCASION_TYPES[0],
    dressCode: CAL_DRESS_CODES[0],
    location: "",
    notes: "",
  };
}
