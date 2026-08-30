// Playwright globalSetup — seeds the Firebase emulators with the baseline
// data the E2E suite assumes exists (a bakery with reviews, several users,
// shop products, a follow graph). Runs AFTER playwright.config.js's
// webServer starts the emulators, BEFORE any spec.
//
// Uses firebase-admin (bypasses security rules, forces uids) via the
// *_EMULATOR_HOST env vars. It wipes both emulators first, so it's
// idempotent and the suite's skip count is deterministic instead of
// "whatever's in prod today".
//
// ── Shape of the data (why it's like this) ──────────────────────────────
// - E2E user = the app's hard-coded SUPER_ADMIN_UID (isAdmin()/ownsBakery()
//   true everywhere, no userRoles doc needed).
// - "Bea" is the power reviewer: most reviews, 3 bakeries, most categories,
//   2 followers -> she ranks #1, so tests that open ".ranking-card /
//   .member-card first()" land on *her* profile, not the E2E user's own
//   (which is what made the follow-graph tests churn/skip against prod).
// - The E2E user has exactly one review and follows only Bea -> in Bea's
//   Followers list the E2E user's own row (no follow button) sorts first,
//   so people-filters.spec.js:190 takes its no-churn path.
// - "Dot" has one review and is in nobody's follow graph -> gives the
//   "follow someone new" flows a target.

process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';

// firebase-admin probes the GCP metadata server once for default
// credentials — irrelevant when only the emulators are used, but it prints
// a MetadataLookupWarning. Swallow just that one so the Playwright output
// stays clean.
const _emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const name = rest[0]?.type ?? rest[0];
  if (name === 'MetadataLookupWarning' || String(warning).includes('MetadataLookup')) return;
  return _emitWarning.call(process, warning, ...rest);
};

import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'crumb-ddeb6';
const ADMIN_UID = 'KTpBS4yJx2h8LpcryCTfJDFCHlr2'; // src/state/appState.js SUPER_ADMIN_UID
export const E2E_EMAIL = 'e2e@crumb.test';
export const E2E_PASSWORD = 'crumb-e2e-pw';

const U = {
  e2e: { uid: ADMIN_UID,       email: E2E_EMAIL,       name: 'E2E Tester', location: 'York, UK',    country: 'United Kingdom' },
  bea: { uid: 'seed-user-bea', email: 'bea@crumb.test', name: 'Bea Baker',  location: 'Bath, UK',    country: 'United Kingdom' },
  cal: { uid: 'seed-user-cal', email: 'cal@crumb.test', name: 'Cal Crust',  location: 'Bristol, UK', country: 'United Kingdom' },
  dot: { uid: 'seed-user-dot', email: 'dot@crumb.test', name: 'Dot Dough',  location: 'Leeds, UK',   country: 'United Kingdom' },
};

const B = {
  alpha: { name: 'Seed Bakehouse Alpha', address: '1 Flour Street, York, UK' },
  beta:  { name: 'Seed Bakehouse Beta',  address: '9 Butter Lane, Bath, UK' },
  gamma: { name: 'Seed Bakehouse Gamma', address: '3 Crumb Court, Leeds, UK' },
};

// [ bakery, name, category, subCategory, price, [ {who, rating}, ... ] ]
const ITEMS = [
  ['alpha', 'Butter Croissant',  'pastry', 'croissant',        3.20, [{ who: 'bea', rating: 4.5 }, { who: 'cal', rating: 4.0 }, { who: 'e2e', rating: 5.0 }]],
  ['alpha', 'Country Sourdough', 'bread',  'sourdough',        4.80, [{ who: 'cal', rating: 3.5 }]],
  ['beta',  'Lemon Tart',        'tart',   'lemon_tart',       4.10, [{ who: 'bea', rating: 4.8 }]],
  ['beta',  'Almond Croissant',  'pastry', 'almond_croissant', 3.60, [{ who: 'bea', rating: 4.2 }]],
  ['gamma', 'Victoria Sponge',   'cake',   'victoria_sponge',  3.90, [{ who: 'bea', rating: 4.6 }, { who: 'dot', rating: 3.8 }]],
  ['gamma', 'Chelsea Bun',       'bun',    'chelsea_bun',      2.80, [{ who: 'bea', rating: 4.0 }]],
];
// -> bea: 5 reviews / 3 bakeries / 4 categories (#1 ranked)
//    cal: 2 reviews / 1 bakery ;  e2e: 1 review / 1 bakery ;  dot: 1 review / 1 bakery

const PRODUCTS = [
  // Beta is #1 on the Bakeries page (highest avg rating) — openFirstBakeryProfile
  // lands there, so it needs at least one product for the shop-management edit test.
  { bakery: 'beta',  name: 'Lemon Tart — box of 4',            productType: 'tart',  price: 16, available: true },
  { bakery: 'alpha', name: 'Sourdough Subscription — 4 weeks', productType: 'bread', price: 18, available: true },
  { bakery: 'alpha', name: 'Cinnamon Bun 6-pack',              productType: 'bun',   price: 15, available: true },
  { bakery: 'gamma', name: 'Seasonal Tart Box',                productType: 'tart',  price: 22, available: false },
];

const FOLLOWS = [
  ['e2e', 'bea'],
  ['cal', 'e2e'],
  ['cal', 'bea'],
  ['bea', 'cal'],
];

async function wipe() {
  const del = (url) => fetch(url, { method: 'DELETE' }).catch(() => {});
  await del(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`);
  await del(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`);
}

export default async function globalSetup() {
  await wipe();

  const app = initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const now = Date.now();
  const ts = (daysAgo) => Timestamp.fromMillis(now - daysAgo * 86_400_000);

  for (const u of Object.values(U)) {
    await auth.createUser({ uid: u.uid, email: u.email, password: E2E_PASSWORD, displayName: u.name })
      .catch((e) => { if (!/already-exists/.test(e.code || '')) throw e; });
  }

  const batch = db.batch();

  for (const u of Object.values(U)) {
    batch.set(db.collection('profiles').doc(u.uid), {
      displayName: u.name, location: u.location, country: u.country,
      bio: '', favCategory: '', photoURL: null, uid: u.uid, createdAt: ts(30),
    });
  }

  for (const b of Object.values(B)) {
    batch.set(db.collection('bakeryProfiles').doc(b.name), {
      blurb: `${b.name} — seeded test bakery.`, website: '', instagram: '',
      photoURL: null, ownerId: ADMIN_UID,
    });
  }

  let d = 20;
  for (const [bkey, name, category, subCategory, price, reviews] of ITEMS) {
    const bakery = B[bkey];
    const recRef = db.collection('itemRecords').doc();
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    batch.set(recRef, {
      name, category, subCategory, bakeryName: bakery.name, bakeryAddress: bakery.address,
      bakeryPlaceId: null, communityAvg: Math.round(avg * 10) / 10, reviewCount: reviews.length,
      avgPrice: price, priceCount: reviews.length, photoURL: null, createdAt: ts(d),
    });
    for (const r of reviews) {
      const u = U[r.who];
      batch.set(db.collection('items').doc(), {
        itemRecordId: recRef.id, name, category, subCategory,
        bakeryName: bakery.name, bakeryAddress: bakery.address, bakeryPlaceId: null,
        bakeryLat: null, bakeryLng: null, price,
        overallRating: r.rating, communityAvg: r.rating, ratingCount: 1,
        notes: '', photoURL: null,
        userId: u.uid, userName: u.name, userPhoto: null, createdAt: ts(d--),
      });
    }
  }

  for (const p of PRODUCTS) {
    batch.set(db.collection('products').doc(), {
      bakeryName: B[p.bakery].name, name: p.name, productType: p.productType,
      price: p.price, available: p.available, description: '', buyLink: null,
      enquiryEmail: 'shop@crumb.test', photoURL: null, ownerId: ADMIN_UID,
      createdAt: ts(10), updatedAt: ts(10),
    });
  }

  for (const [followerKey, followingKey] of FOLLOWS) {
    const follower = U[followerKey];
    batch.set(db.collection('follows').doc(`${follower.uid}_${U[followingKey].uid}`), {
      followerId: follower.uid, followerName: follower.name, followerPhoto: null,
      followingId: U[followingKey].uid, createdAt: ts(20),
    });
  }

  await batch.commit();
  await deleteApp(app);
}
