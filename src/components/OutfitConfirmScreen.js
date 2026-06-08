import React, { useState } from "react";

export function OutfitConfirmScreen({
  outfit,
  wardrobe,
  onConfirm,
  onChangeMyMind,
  updateItem,
}) {
  const resolveItem = (itemName) => {
    const key = itemName.toLowerCase().trim();
    const exact = wardrobe.find(
      (it) => it.laundryStatus === "clean" &&
      it.name.toLowerCase().trim() === key
    );
    if (exact) return exact;
    const startsWith = wardrobe.find(
      (it) => it.laundryStatus === "clean" &&
      key.startsWith(it.name.toLowerCase().trim())
    );
    if (startsWith) return startsWith;
    const endsWith = wardrobe.find(
      (it) => it.laundryStatus === "clean" &&
      it.name.toLowerCase().trim().includes(key)
    );
    if (endsWith) return endsWith;
    return { id: null, name: itemName, category: null };
  };

  const [selectedItems, setSelectedItems] = useState(() =>
    outfit.items.map((name) => resolveItem(name))
  );
  const [swappingIdx, setSwappingIdx] = useState(null);

  const handleSwap = (idx) => {
    setSwappingIdx((prev) => (prev === idx ? null : idx));
  };

  const handlePickSwap = (idx, newItem) => {
    setSelectedItems((prev) =>
      prev.map((it, i) => (i === idx ? newItem : it))
    );
    setSwappingIdx(null);
  };

  const handleConfirm = () => {
    selectedItems.forEach((item) => {
      if (item.id && updateItem) {
        updateItem(item.id, {
          timesWorn: (item.timesWorn || 0) + 1,
          laundryStatus: "dirty",
        });
      }
    });
    onConfirm(selectedItems);
  };

  return (
    <div style={{
      padding: "20px 0",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>

      <div style={{
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--color-amber)",
        marginBottom: 2,
      }}>
        ✓ Today's outfit
      </div>
      <div style={{
        fontFamily: "var(--font-serif)",
        fontSize: "1.4rem",
        fontWeight: 700,
        color: "var(--color-text-primary)",
        marginBottom: 4,
        lineHeight: 1.2,
      }}>
        {outfit.name}
      </div>
      <p style={{
        fontSize: "var(--text-xs)",
        color: "var(--color-text-muted)",
        margin: "0 0 8px",
      }}>
        Tap any item to swap it with something else from your wardrobe.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {selectedItems.map((item, idx) => {
          const category = item.category ||
            wardrobe.find((w) => w.name === item.name)?.category || null;

          const swapOptions = category
            ? wardrobe.filter(
                (w) =>
                  w.laundryStatus === "clean" &&
                  w.category === category &&
                  w.id !== item.id
              )
            : [];

          return (
            <div key={idx}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: swappingIdx === idx
                  ? "rgba(196,129,58,0.08)"
                  : "var(--color-bg-secondary)",
                border: swappingIdx === idx
                  ? "1px solid var(--color-amber)"
                  : "1px solid var(--color-border)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
                onClick={() => handleSwap(idx)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {item.imagePreview ? (
                    <img
                      src={item.imagePreview}
                      alt={item.name}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.4rem",
                      flexShrink: 0,
                    }}>
                      👕
                    </div>
                  )}
                  <div>
                    <div style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}>
                      {item.name}
                    </div>
                    {category && (
                      <div style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-muted)",
                      }}>
                        {category}
                      </div>
                    )}
                  </div>
                </div>
                <span style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--color-amber)",
                  fontWeight: 600,
                }}>
                  {swappingIdx === idx ? "✕" : "swap"}
                </span>
              </div>

              {swappingIdx === idx && (
                <div style={{
                  marginTop: 6,
                  padding: "10px 12px",
                  background: "var(--color-bg-secondary)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}>
                  {swapOptions.length === 0 ? (
                    <p style={{
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-muted)",
                      margin: 0,
                    }}>
                      No other clean {category} items available.
                    </p>
                  ) : (
                    swapOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handlePickSwap(idx, opt)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--color-border)",
                          background: "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "var(--font-sans)",
                        }}
                      >
                        {opt.imagePreview ? (
                          <img
                            src={opt.imagePreview}
                            alt={opt.name}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 4,
                              objectFit: "cover",
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div style={{
                            width: 30,
                            height: 30,
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "1.1rem",
                            flexShrink: 0,
                          }}>
                            👕
                          </div>
                        )}
                        <span style={{
                          fontSize: "var(--text-sm)",
                          color: "var(--color-text-primary)",
                          fontWeight: 500,
                        }}>
                          {opt.name}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        style={{
          width: "100%",
          marginTop: 8,
          padding: "13px 24px",
          borderRadius: "var(--radius-full)",
          border: "none",
          background: "var(--color-amber)",
          color: "#fff",
          fontWeight: 700,
          fontSize: "var(--text-sm)",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
        }}
      >
        Done, getting dressed →
      </button>

      <button
        type="button"
        onClick={onChangeMyMind}
        style={{
          width: "100%",
          padding: "12px 24px",
          borderRadius: "var(--radius-full)",
          border: "1.5px solid var(--color-border)",
          background: "transparent",
          color: "var(--color-text-muted)",
          fontWeight: 600,
          fontSize: "var(--text-sm)",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
        }}
      >
        Change my mind
      </button>
    </div>
  );
}
