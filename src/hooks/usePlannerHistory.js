import { useState, useEffect, useCallback } from "react";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";

const LS_KEY = "fos_planner_history";

function loadLocalHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalHistory(history) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(history.slice(0, 30)));
  } catch {}
}

export function usePlannerHistory(firebaseUser) {
  const [history, setHistory] = useState(loadLocalHistory);

  useEffect(() => {
    if (!firebaseUser) return;
    (async () => {
      try {
        const ref = collection(db, "users", firebaseUser.uid, "plannerHistory");
        const snap = await getDocs(
          query(ref, orderBy("createdAt", "desc"), limit(30))
        );
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (docs.length > 0) {
          setHistory(docs);
          saveLocalHistory(docs);
        }
      } catch (e) {
        console.warn("Could not load planner history:", e);
      }
    })();
  }, [firebaseUser]);

  const recordSession = useCallback(
    async ({ weather, occasion, outfits }) => {
      const session = {
        date: new Date().toISOString().slice(0, 10),
        weather: weather || "",
        occasion: occasion || "",
        outfits: outfits || [],
        chosenIdx: null,
        chosenName: null,
        createdAt: new Date().toISOString(),
      };

      const updated = [session, ...history].slice(0, 30);
      setHistory(updated);
      saveLocalHistory(updated);

      let docId = null;
      if (firebaseUser) {
        try {
          const ref = collection(db, "users", firebaseUser.uid, "plannerHistory");
          const docRef = await addDoc(ref, {
            ...session,
            createdAt: serverTimestamp(),
          });
          docId = docRef.id;
          setHistory((prev) =>
            prev.map((s, i) => (i === 0 ? { ...s, id: docId } : s))
          );
        } catch (e) {
          console.warn("Could not save planner session:", e);
        }
      }

      return docId || session.createdAt;
    },
    [firebaseUser, history]
  );

  const recordChoice = useCallback(
    async (sessionId, chosenIdx, chosenName) => {
      setHistory((prev) =>
        prev.map((s) =>
          (s.id === sessionId || s.createdAt === sessionId)
            ? { ...s, chosenIdx, chosenName }
            : s
        )
      );

      if (firebaseUser && sessionId) {
        try {
          const { doc, updateDoc } = await import("firebase/firestore");
          const ref = doc(
            db,
            "users",
            firebaseUser.uid,
            "plannerHistory",
            sessionId
          );
          await updateDoc(ref, { chosenIdx, chosenName });
        } catch (e) {
          console.warn("Could not update planner choice:", e);
        }
      }
    },
    [firebaseUser]
  );

  return { history, recordSession, recordChoice };
}
