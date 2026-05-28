import React from "react";

export function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  onClick,
  type = "button",
  style = {},
  ...props
}) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-sans)",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    border: "none",
    borderRadius: "var(--radius-full)",
    transition: "var(--transition)",
    width: fullWidth ? "100%" : "auto",
    minHeight: "var(--touch-target)",
    boxSizing: "border-box",
  };

  const sizes = {
    sm: { padding: "8px 16px", fontSize: "var(--text-sm)" },
    md: { padding: "12px 22px", fontSize: "var(--text-base)" },
    lg: { padding: "14px 28px", fontSize: "var(--text-lg)" },
  };

  const variants = {
    primary: {
      background: "var(--color-amber)",
      color: "var(--color-bg-dark)",
    },
    secondary: {
      background: "transparent",
      color: "var(--color-text-primary)",
      border: "1px solid var(--color-border-strong)",
    },
    ghost: {
      background: "transparent",
      color: "var(--color-text-secondary)",
      border: "none",
      textDecoration: "underline",
    },
    danger: {
      background: "transparent",
      color: "var(--color-error)",
      border: "1px solid rgba(198,40,40,0.3)",
    },
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
