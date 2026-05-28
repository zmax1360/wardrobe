import React, { useCallback, useState } from "react";

import { Button, Card, Badge } from "../components/ui";
import { suggestItemNames } from "../services/aiService";

function nextNamedItemId() {
  return `named-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function scanItemCount(item) {
  return Math.max(1, Math.min(99, Math.floor(Number(item?.count)) || 1));
}

function LoadingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", marginLeft: 8 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--color-amber)",
            animation: "post-scan-pulse 1s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </span>
  );
}

export function PostScanNamingScreen({ scanItems = [], onDone, onSkip, addItem, removeItem, updateItem }) {
  const [expandedId, setExpandedId] = useState(null);
  const [namesById, setNamesById] = useState({});
  const [loadingIds, setLoadingIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const items = Array.isArray(scanItems) ? scanItems : [];

  const loadNamesForItem = useCallback(async (item) => {
    const id = item.id;
    const count = scanItemCount(item);
    let alreadyLoaded = false;
    setNamesById((prev) => {
      if (prev[id]?.length === count) alreadyLoaded = true;
      return prev;
    });
    if (alreadyLoaded) return;

    setLoadingIds((prev) => new Set(prev).add(id));
    try {
      const suggested = await suggestItemNames(item);
      setNamesById((prev) => ({ ...prev, [id]: suggested.slice(0, count) }));
    } catch {
      setNamesById((prev) => ({
        ...prev,
        [id]: Array.from({ length: count }, (_, i) => `${item.name || "Item"} ${i + 1}`),
      }));
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const toggleRow = (item) => {
    const next = expandedId === item.id ? null : item.id;
    setExpandedId(next);
    if (next) void loadNamesForItem(item);
  };

  const updateName = (itemId, index, value) => {
    setNamesById((prev) => {
      const existing = [...(prev[itemId] || [])];
      existing[index] = value;
      return { ...prev, [itemId]: existing };
    });
  };

  const handleDone = async () => {
    setSaving(true);
    setError("");
    try {
      const idsToRemove = new Set();
      const newItems = [];

      for (const scanItem of items) {
        const count = scanItemCount(scanItem);
        const names = namesById[scanItem.id] || [];

        if (count <= 1) {
          const enteredName = String(names[0] || "").trim();
          if (enteredName && enteredName !== scanItem.name) {
            updateItem(scanItem.id, { name: enteredName, tags: ["closet-scan", "named"] });
          }
          continue;
        }

        idsToRemove.add(scanItem.id);
        for (let i = 0; i < count; i++) {
          newItems.push({
            id: nextNamedItemId(),
            name: String(names[i] || "").trim() || `${scanItem.name} ${i + 1}`,
            category: scanItem.category,
            color: scanItem.colors?.[0] || scanItem.color || "",
            colors: Array.isArray(scanItem.colors) ? scanItem.colors : [],
            style: scanItem.style || "",
            source: "closet_scan",
            tags: ["closet-scan", "named"],
            imagePreview: scanItem.imagePreview || "",
            imageFilename: scanItem.imageFilename || "",
            laundryStatus: "clean",
            timesWorn: 0,
            season: scanItem.season || "all",
            material: scanItem.material || "",
            description: "",
            purchasePrice: "",
            purchaseDate: "",
            expectedLifespan: "",
            mood: "",
            occasion: [],
            lastWorn: null,
            sourceUrl: "",
            parentScanId: scanItem.id,
          });
        }
      }

      idsToRemove.forEach((id) => removeItem(id));
      await new Promise((resolve) => setTimeout(resolve, 0));
      newItems.forEach((item) => addItem(item));

      onDone?.();
    } catch (e) {
      setError(e?.message || "Could not save names.");
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "var(--space-3)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-amber-border)",
    background: "rgba(250, 247, 242, 0.06)",
    color: "#faf7f2",
    fontSize: "var(--text-sm)",
    fontFamily: "var(--font-sans)",
    outline: "none",
  };

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        color: "#faf7f2",
      }}
    >
      <style>{`
        @keyframes post-scan-pulse {
          0%, 100% { opacity: 0.35; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1); }
        }
        .post-scan-input:focus {
          box-shadow: 0 0 0 2px rgba(196, 129, 58, 0.45);
          border-color: var(--color-amber) !important;
        }
      `}</style>

      <header style={{ marginBottom: "var(--space-8)" }}>
        <h1
          style={{
            margin: "0 0 var(--space-2)",
            fontFamily: "var(--font-serif)",
            fontSize: "var(--text-3xl)",
            fontWeight: 700,
            color: "#faf7f2",
          }}
        >
          Name Your Items
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-sm)",
            color: "rgba(250, 247, 242, 0.55)",
            lineHeight: 1.55,
          }}
        >
          Give each piece a name so your planner knows what to suggest
        </p>
      </header>

      {items.length === 0 ? (
        <p style={{ color: "rgba(250, 247, 242, 0.5)", fontSize: "var(--text-sm)" }}>No scan categories to name.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-8)" }}>
          {items.map((item) => {
            const count = scanItemCount(item);
            const expanded = expandedId === item.id;
            const loading = loadingIds.has(item.id);
            const names = namesById[item.id] || [];

            return (
              <Card
                key={item.id}
                padding="sm"
                style={{
                  background: expanded ? "rgba(250, 247, 242, 0.06)" : "rgba(250, 247, 242, 0.03)",
                  border: "0.5px solid var(--color-amber-border)",
                  borderLeft: expanded ? "3px solid var(--color-amber)" : "0.5px solid var(--color-amber-border)",
                  boxShadow: "none",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleRow(item)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                    background: "none",
                    border: "none",
                    padding: "var(--space-2) 0",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "#faf7f2",
                    minHeight: "var(--touch-target)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "var(--text-base)",
                        marginBottom: "var(--space-1)",
                      }}
                    >
                      {item.name}
                    </div>
                    <Badge
                      variant="amber"
                      style={{
                        background: "rgba(196, 129, 58, 0.15)",
                        color: "var(--color-amber)",
                      }}
                    >
                      {count} {count === 1 ? "item" : "items"}
                    </Badge>
                  </div>
                  <span style={{ color: "var(--color-amber)", fontSize: "var(--text-lg)", flexShrink: 0 }}>
                    {expanded ? "▾" : "▸"}
                  </span>
                </button>

                {expanded && (
                  <div
                    style={{
                      marginTop: "var(--space-3)",
                      paddingTop: "var(--space-3)",
                      borderTop: "0.5px solid var(--color-amber-border)",
                    }}
                  >
                    {loading ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          fontSize: "var(--text-sm)",
                          color: "rgba(250, 247, 242, 0.6)",
                          marginBottom: "var(--space-3)",
                        }}
                      >
                        Suggesting names
                        <LoadingDots />
                      </div>
                    ) : null}

                    {!loading &&
                      Array.from({ length: count }, (_, i) => (
                        <label
                          key={`${item.id}-${i}`}
                          style={{
                            display: "block",
                            marginBottom: i < count - 1 ? "var(--space-3)" : 0,
                          }}
                        >
                          <span
                            style={{
                              display: "block",
                              fontSize: "var(--text-xs)",
                              color: "rgba(250, 247, 242, 0.45)",
                              marginBottom: "var(--space-1)",
                            }}
                          >
                            Item {i + 1}
                          </span>
                          <input
                            type="text"
                            className="post-scan-input"
                            value={names[i] ?? ""}
                            disabled={loading}
                            onChange={(e) => updateName(item.id, i, e.target.value)}
                            placeholder={loading ? "Loading…" : `Name item ${i + 1}`}
                            style={inputStyle}
                          />
                        </label>
                      ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {error ? (
        <p style={{ color: "#ffb3a8", fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>{error}</p>
      ) : null}

      <Button fullWidth disabled={saving || items.length === 0} onClick={() => void handleDone()}>
        {saving ? "Saving…" : "Done"}
      </Button>

      <div style={{ textAlign: "center", marginTop: "var(--space-4)" }}>
        <Button variant="ghost" disabled={saving} onClick={onSkip} style={{ color: "rgba(250, 247, 242, 0.45)" }}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}
