#!/usr/bin/env node
// Sweeps E2E test data out of the live Firebase project (crumb-ddeb6).
//
// Run manually:   npm run cleanup:e2e
// Run in CI:       .github/workflows/cleanup-e2e.yml (nightly + workflow_dispatch)
//
// This is the third and last line of defence behind:
//   1. tests/utils/reviews.js's createReview fixture (per-test, on teardown)
//   2. tests/cleanup.teardown.js (once, after the chromium project)
// Neither of those runs if the Playwright process is killed outright, and a
// newly-added spec can always forget its own cleanup — so this exists to
// catch whatever slips through, on a schedule.
//
// Credentials come from E2E_EMAIL / E2E_PASSWORD — a real .env locally, repo
// secrets in CI. Everything it touches is scoped to the exact literal
// "E2E " name prefix (capital E-2-E-space) or the "E2E_" storage prefix; it
// cannot reach real user data. It only DELETES its own items (guarded by
// userId) — see below.

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, collection, getDocs, query, where, deleteDoc, doc,
} from 'firebase/firestore';
import { getStorage, ref, listAll, deleteObject } from 'firebase/storage';

try { process.loadEnvFile('.env'); } catch { /* CI supplies these as env vars */ }

const { E2E_EMAIL, E2E_PASSWORD } = process.env;
if (!E2E_EMAIL || !E2E_PASSWORD) {
  console.error('E2E_EMAIL / E2E_PASSWORD not set (see .env.example / repo secrets).');
  process.exit(1);
}

// Public web config — identical to src/services/firebase.js.
const app = initializeApp({
  apiKey: 'AIzaSyCEtZuELlMR_pxiJ0Ew3d1gBjXyXbKV1kA',
  authDomain: 'crumb-ddeb6.firebaseapp.com',
  projectId: 'crumb-ddeb6',
  storageBucket: 'crumb-ddeb6.firebasestorage.app',
  messagingSenderId: '273733440798',
  appId: '1:273733440798:web:70ae58f391a0b9be20650f',
});

const PREFIX = 'E2E ';
const UPPER = 'E2E' + ''; // Firestore prefix-range upper bound

const auth = getAuth(app);
const { user } = await signInWithEmailAndPassword(auth, E2E_EMAIL, E2E_PASSWORD);
const db = getFirestore(app);
const storage = getStorage(app);
const summary = {};

// items — delete only E2E-prefixed AND owned by this account, then their
// itemRecords. (deleteReview() in the app proves the rules allow both.)
{
  const snap = await getDocs(query(
    collection(db, 'items'), where('name', '>=', PREFIX), where('name', '<', UPPER),
  ));
  const recIds = new Set();
  let deleted = 0, skipped = 0;
  for (const d of snap.docs) {
    if (d.data().userId && d.data().userId !== user.uid) { skipped++; continue; }
    if (d.data().itemRecordId) recIds.add(d.data().itemRecordId);
    await deleteDoc(doc(db, 'items', d.id));
    deleted++;
  }
  summary.items = deleted;
  if (skipped) summary.itemsSkippedNotOwned = skipped;
  let recs = 0;
  for (const id of recIds) {
    try { await deleteDoc(doc(db, 'itemRecords', id)); recs++; } catch { /* already gone */ }
  }
  summary.itemRecordsViaItems = recs;
}

// name-prefixed collections that delete cleanly.
for (const col of ['itemRecords', 'preorderOfferings', 'bakeryCatalogue']) {
  const snap = await getDocs(query(
    collection(db, col), where('name', '>=', PREFIX), where('name', '<', UPPER),
  ));
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, col, d.id)).catch(() => {})));
  summary[col] = (summary[col] || 0) + snap.size;
}

// reservations — rules forbid deleting these from the client (the app only
// ever marks them 'cancelled'). Report the backlog so it stays visible; a
// real cleanup needs the Admin SDK or a rules change.
{
  const snap = await getDocs(query(
    collection(db, 'reservations'),
    where('offeringName', '>=', PREFIX), where('offeringName', '<', UPPER),
  ));
  summary.reservationsUndeletable = snap.size;
}

// Storage: offerings/E2E_*.
{
  const listing = await listAll(ref(storage, 'offerings')).catch(() => ({ items: [] }));
  const files = listing.items.filter(i => i.name.startsWith('E2E_'));
  await Promise.all(files.map(i => deleteObject(i).catch(() => {})));
  summary.storageFiles = files.length;
}

console.log('[cleanup-e2e-data]', JSON.stringify(summary));
process.exit(0);
