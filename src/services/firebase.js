// ─── FIREBASE SERVICE ──────────────────────────────────────────────────────
// This is a straight lift from the original single-file app, just wrapped as
// a proper ES module. It deliberately keeps the exact same window._crumb +
// 'crumb-firebase-ready' event interface that the rest of the app already
// expects — so the legacy app code needs zero changes for this first step.
//
// A later phase can refactor consumers to `import` these directly instead of
// reading them off `window`, but that's a separate, incremental task — not
// worth bundling into this initial migration.

import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator,
  signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator,
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy, where, getDoc, setDoc, increment, onSnapshot,
  serverTimestamp, limit, runTransaction
} from 'firebase/firestore';
import {
  getStorage, connectStorageEmulator,
  ref, uploadBytes, getDownloadURL, deleteObject, listAll
} from 'firebase/storage';

// ─── FIREBASE CONFIG ────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCEtZuELlMR_pxiJ0Ew3d1gBjXyXbKV1kA",
  authDomain: "crumb-ddeb6.firebaseapp.com",
  projectId: "crumb-ddeb6",
  storageBucket: "crumb-ddeb6.firebasestorage.app",
  messagingSenderId: "273733440798",
  appId: "1:273733440798:web:70ae58f391a0b9be20650f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// ─── EMULATORS (E2E only) ──────────────────────────────────────────────────
// Point at the local Firebase Emulator Suite when VITE_USE_EMULATOR is set —
// which ONLY the Playwright test webServer does (see playwright.config.js).
// `npm run dev` and the production build never set it, so this block is dead
// code Vite strips from `dist/` — the shipped app can't reach a localhost
// emulator. Ports match firebase.json.
if (import.meta.env.VITE_USE_EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

// Expose to global scope — the legacy app code (still one big module for now)
// reads this exactly the same way it always has.
window._crumb = {
  auth, db, storage, googleProvider,
  signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile,
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy,
  where, getDoc, setDoc, increment, onSnapshot, serverTimestamp, limit,
  runTransaction, ref, uploadBytes, getDownloadURL, deleteObject, listAll
};
window.dispatchEvent(new Event('crumb-firebase-ready'));
