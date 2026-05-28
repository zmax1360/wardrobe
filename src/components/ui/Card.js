import React from "react";

export function Card({ children, padding = "md", style = {}, onClick, ...props }) {
  const paddings = {
    sm: "var(--space-3)",
    md: "var(--space-4)",
    lg: "var(--space-6)",
  };

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--color-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: paddings[padding],
        boxShadow: "var(--shadow-sm)",
        boxSizing: "border-box",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
