import { useState, useEffect, useCallback } from "react";
import { db, storage } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";

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
  return items.map(({ id, name, category, color, style, season, tags,
    material, description, laundryStatus, timesWorn, cost,
    purchaseDate, imagePreview, imageFilename }) => ({
    id, name, category, color, style, season, tags,
    material, description, laundryStatus, timesWorn, cost,
    purchaseDate, imagePreview, imageFilename,
  }));
}

/** Firestore rejects `undefined`; JSON round-trip drops undefined keys on plain data. */
function wardrobeForFirestore(items) {
  return JSON.parse(JSON.stringify(items));
}

export function useWardrobe(hydrated, firebaseUser) {
  const [wardrobe, setWardrobe] = useState(() => loadWardrobeFromStorage());

  // ── Load from Firestore when user signs in ──────────────────────
  useEffect(() => {
    if (!firebaseUser) return;
    getDoc(doc(db, "users", firebaseUser.uid))
      .then((snap) => {
        if (!snap.exists()) return;
        const w = snap.data().wardrobe ?? [];
        if (Array.isArray(w) && w.length > 0) {
          setWardrobe(w);
          localStorage.setItem(STORAGE_WARDROBE, JSON.stringify(w));
        }
      })
      .catch(() => {});
  }, [firebaseUser]);

  // ── Save to localStorage + Firestore on every change ───────────
  useEffect(() => {
    if (!hydrated) return;
    const stripped = stripWardrobeForStorage(wardrobe);
    localStorage.setItem(STORAGE_WARDROBE, JSON.stringify(stripped));
    if (firebaseUser) {
      setDoc(
        doc(db, "users", firebaseUser.uid),
        { wardrobe: wardrobeForFirestore(stripped) },
        { merge: true }
      ).catch(() => {});
    }
  }, [wardrobe, hydrated, firebaseUser]);

  // ── Actions ────────────────────────────────────────────────────
  const addItem = useCallback((item) => {
    setWardrobe((prev) => [item, ...prev]);
  }, []);

  const updateItem = useCallback((id, patch) => {
    setWardrobe((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );
  }, []);

  const removeItem = useCallback((id) => {
    setWardrobe((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it?.imageFilename) {
        // Firebase Storage path (uploaded after auth was added)
        if (it.imageFilename.startsWith("wardrobe/")) {
          deleteObject(storageRef(storage, it.imageFilename)).catch(() => {});
        } else {
          // Legacy: local Express server
          fetch(
            `http://localhost:3001/api/delete-image/${encodeURIComponent(it.imageFilename)}`,
            { method: "DELETE" }
          ).catch(() => {});
        }
      }
      if (it?.imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(it.imagePreview);
      }
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  return { wardrobe, setWardrobe, addItem, updateItem, removeItem };
}
