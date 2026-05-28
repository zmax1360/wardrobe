import React from "react";

export function Badge({ children, variant = "amber", style = {} }) {
  const variants = {
    amber: {
      background: "var(--color-amber-light)",
      color: "var(--color-amber)",
    },
    neutral: {
      background: "var(--color-bg-secondary)",
      color: "var(--color-text-secondary)",
    },
    success: {
      background: "rgba(46,125,50,0.1)",
      color: "var(--color-success)",
    },
    error: {
      background: "var(--color-error-bg)",
      color: "var(--color-error)",
    },
  };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "var(--radius-full)",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
