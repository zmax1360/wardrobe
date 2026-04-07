import { COLORS } from "../styles/theme";

export function mergeStyles(...styles) {
  return Object.assign({}, ...styles.filter(Boolean));
}

export function focusInputVisual(e) {
  e.currentTarget.style.border = `1px solid ${COLORS.primary}`;
  e.currentTarget.style.boxShadow = "0 0 0 4px rgba(184, 92, 56, 0.10)";
}

export function blurInputVisual(e) {
  e.currentTarget.style.border = `1px solid ${COLORS.border}`;
  e.currentTarget.style.boxShadow = "none";
}
