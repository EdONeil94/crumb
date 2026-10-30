// Firebase wiring for the iOS app. Same project as the web app (crumb-ddeb6).
// These are public client identifiers, not secrets; security comes from
// firestore.rules and the Cloud Functions, exactly as on the web.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyCEtZuELlMR_pxiJ0Ew3d1gBjXyXbKV1kA',
  authDomain: 'crumb-ddeb6.firebaseapp.com',
  projectId: 'crumb-ddeb6',
  storageBucket: 'crumb-ddeb6.firebasestorage.app',
  messagingSenderId: '273733440798',
  // NOTE: this is the web app id. Replace with a registered iOS app id
  // (and add GoogleService-Info.plist) when native Google sign-in lands.
  appId: '1:273733440798:web:70ae58f391a0b9be20650f',
};

// The React Native persistence helper ships in Firebase's RN bundle but is
// missing from the web typings, so read it off the module with a narrow type.
const { getReactNativePersistence } = firebaseAuth as unknown as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => firebaseAuth.Persistence;
};

const isNew = getApps().length === 0;
export const app = isNew ? initializeApp(firebaseConfig) : getApp();

// initializeAuth may only run once per app; guard for fast refresh.
export const auth = isNew
  ? firebaseAuth.initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  : firebaseAuth.getAuth(app);

export const db = getFirestore(app);
// Must match the server region (functions/shared.js REGION).
export const functions = getFunctions(app, 'europe-west2');
