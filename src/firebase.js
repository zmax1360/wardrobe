// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

/** Bearer token for same-origin `/api/*` calls (Firebase ID token). */
export async function getFirebaseAuthHeader() {
  return new Promise((resolve) => {
    // If already signed in, use immediately
    if (auth.currentUser) {
      auth.currentUser
        .getIdToken()
        .then((token) =>
          resolve({
            Authorization: `Bearer ${token}`,
          })
        )
        .catch(() => resolve({}));
      return;
    }
    // Wait for auth state to restore (max 5 seconds)
    const timeout = setTimeout(() => resolve({}), 5000);
    const unsubscribe = auth.onAuthStateChanged((user) => {
      clearTimeout(timeout);
      unsubscribe();
      if (!user) {
        resolve({});
        return;
      }
      user
        .getIdToken()
        .then((token) =>
          resolve({
            Authorization: `Bearer ${token}`,
          })
        )
        .catch(() => resolve({}));
    });
  });
}