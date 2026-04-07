// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAcWxYmgZHEw3B-CZ1iaj4H47qL6xLrK4I",
  authDomain: "fashion-os-e876b.firebaseapp.com",
  projectId: "fashion-os-e876b",
  storageBucket: "fashion-os-e876b.firebasestorage.app",
  messagingSenderId: "376156136955",
  appId: "1:376156136955:web:3f7595297b298697bf175e",
  measurementId: "G-L0M7X0LGNN"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);