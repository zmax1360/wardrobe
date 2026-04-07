import { useState, useEffect, useCallback } from "react";

export const STORAGE_WARDROBE = "fos_wardrobe";

function loadWardrobeFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_WARDROBE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stripWardrobeForStorage(items) {
  return items.map(
    ({
      id,
      name,
      category,
      color,
      style,
      season,
      tags,
      material,
      description,
      laundryStatus,
      timesWorn,
      cost,
      imagePreview,
      imageFilename,
    }) => ({
      id,
      name,
      category,
      color,
      style,
      season,
      tags,
      material,
      description,
      laundryStatus,
      timesWorn,
      cost,
      imagePreview,
      imageFilename,
    })
  );
}

export function useWardrobe(hydrated) {
  const [wardrobe, setWardrobe] = useState(() => loadWardrobeFromStorage());

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_WARDROBE, JSON.stringify(stripWardrobeForStorage(wardrobe)));
  }, [wardrobe, hydrated]);

  const addItem = useCallback((item) => {
    setWardrobe((prev) => [item, ...prev]);
  }, []);

  const updateItem = useCallback((id, patch) => {
    setWardrobe((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((id) => {
    setWardrobe((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it?.imageFilename) {
        fetch(`http://localhost:3001/api/delete-image/${encodeURIComponent(it.imageFilename)}`, {
          method: "DELETE",
        }).catch(() => {});
      }
      if (it?.imagePreview && String(it.imagePreview).startsWith("blob:")) {
        URL.revokeObjectURL(it.imagePreview);
      }
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  return {
    wardrobe,
    addItem,
    updateItem,
    removeItem,
  };
}
