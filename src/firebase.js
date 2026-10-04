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
  getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile
} from 'firebase/auth';
import {
  getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy, where, getDoc, setDoc, increment, onSnapshot,
  serverTimestamp, limit, runTransaction
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

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

// Expose to global scope — the legacy app code (still one big module for now)
// reads this exactly the same way it always has.
window._crumb = {
  auth, db, storage, googleProvider,
  signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile,
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy,
  where, getDoc, setDoc, increment, onSnapshot, serverTimestamp, limit,
  runTransaction, ref, uploadBytes, getDownloadURL, deleteObject
};

// legacy-app.js checks window._crumb directly on load rather than solely
// waiting for this event (see the INIT section there for why) — this event
// dispatch is kept only as a defensive fallback for that same code path.
window.dispatchEvent(new Event('crumb-firebase-ready'));
