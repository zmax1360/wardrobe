import { useState, useEffect, useCallback } from "react";
import { resolveBackendApiPath } from "../apiBase";
import { normalizeWardrobeItems } from "../utils/wardrobeFinance";
import { db, storage } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { STORAGE_WISHLIST } from "../constants";
import {
  ref as storageRef,
  deleteObject,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

export const STORAGE_WARDROBE = "fos_wardrobe";

/** Filename segment safe for Firebase Storage object keys under wardrobe/{uid}/{itemId}/ */
function safeImageStorageLeafName(filename) {
  const base =
    String(filename || "image.jpg")
      .trim()
      .replace(/\\/g, "/")
      .split("/")
      .pop() || "image.jpg";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const leaf = cleaned.slice(0, 160) || "image.jpg";
  return leaf.endsWith(".") ? `${leaf}x` : leaf;
}

/**
 * Upload a wardrobe photo to Firebase Storage and return HTTPS URL + full object path for deletion.
 * Path: wardrobe/{uid}/{itemId}/{filename}
 */
export async function uploadWardrobeImage(firebaseUser, file, itemId) {
  if (!firebaseUser) throw new Error("Not authenticated");

  const leaf = safeImageStorageLeafName(file?.name || "photo.jpg");
  const path = `wardrobe/${firebaseUser.uid}/${itemId}/${leaf}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file);
  const downloadURL = await getDownloadURL(fileRef);
  return { downloadURL, path };
}

/** Drop stale blob: URLs from hydrated sources (blobs cannot be restored across sessions). */
function stripBlobPreviewOnLoad(item) {
  return {
    ...item,
    imagePreview: item.imagePreview?.startsWith("blob:") ? "" : (item.imagePreview ?? ""),
  };
}

function loadWardrobeFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_WARDROBE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeWardrobeItems(parsed).map(stripBlobPreviewOnLoad);
  } catch {
    return [];
  }
}

function stripWardrobeForStorage(items) {
  return items.map((it) => ({
    id: it.id,
    name: it.name,
    category: it.category,
    color: it.color,
    style: it.style,
    season: it.season,
    tags: it.tags,
    material: it.material,
    description: it.description,
    laundryStatus: it.laundryStatus,
    purchasePrice: it.purchasePrice,
    purchaseDate: it.purchaseDate,
    expectedLifespan: it.expectedLifespan,
    timesWorn: it.timesWorn,
    imagePreview: it.imagePreview?.startsWith("blob:") ? "" : (it.imagePreview ?? ""),
    imageFilename: it.imageFilename,
    mood: it.mood,
    occasion: Array.isArray(it.occasion) ? it.occasion : [],
    lastWorn: it.lastWorn ?? null,
    sourceUrl: it.sourceUrl ?? "",
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
          const norm = normalizeWardrobeItems(w).map(stripBlobPreviewOnLoad);
          setWardrobe(norm);
          localStorage.setItem(STORAGE_WARDROBE, JSON.stringify(stripWardrobeForStorage(norm)));
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
            resolveBackendApiPath(`/api/delete-image/${encodeURIComponent(it.imageFilename)}`),
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

/** Pushes `STORAGE_WISHLIST` from localStorage to Firestore (ShopperScreen still owns wishlist in React + LS). */
export function useWishlistFirestoreSync(hydrated, firebaseUser) {
  useEffect(() => {
    if (!hydrated || !firebaseUser) return undefined;
    const push = () => {
      try {
        const raw = localStorage.getItem(STORAGE_WISHLIST);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return;
        setDoc(
          doc(db, "users", firebaseUser.uid),
          { wishlist: JSON.parse(JSON.stringify(parsed)) },
          { merge: true }
        ).catch(() => {});
      } catch {
        /* ignore */
      }
    };
    let intervalId = null;
    const start = window.setTimeout(() => {
      push();
      intervalId = window.setInterval(push, 4000);
    }, 2000);
    return () => {
      clearTimeout(start);
      if (intervalId != null) clearInterval(intervalId);
    };
  }, [hydrated, firebaseUser]);
}
