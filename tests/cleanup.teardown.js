import { test as teardown } from '@playwright/test';

// Runs once after all specs finish (wired via the "chromium" project's
// `teardown: 'cleanup'` in playwright.config.js) and removes everything
// tests/utils/preorders.js creates in Firestore. See that file's module
// comment for the full picture; in short, each addOffering() call creates a
// preorderOfferings doc + a bakeryCatalogue doc (saveToCatalogue runs on
// every save), and each reserveFromBakeryProfile() call creates a
// reservations doc.
//
// Scoped tightly by design: every test-created name is generated as
// `E2E <label> <timestamp>` (see E2E_PREFIX below). This only ever
// queries/deletes documents whose relevant name field starts with that
// exact literal prefix ("E2E ", capital E-2-E-space) — it cannot touch
// anything else, real user data included, no matter what else exists in the
// project. It also cleans up stray data left by a previous crashed/
// interrupted run, not just what this run created, since it's a query over
// the prefix rather than a track-ids-as-you-go list.
//
// preorderOfferings and bakeryCatalogue are deleted outright, mirroring
// deleteOffering()/removeCatalogueItem() in src/legacy-app.js — both real,
// working app features, so Firestore rules are already known to permit this
// for the account that created them. reservations tries a real delete first
// and falls back to marking the reservation 'cancelled' if that's rejected,
// since the app itself never hard-deletes a reservation (cancelReservation
// only ever updates its status) — rules may not allow an outright delete
// there even though they allow it for the other two collections.
//
// Storage: the "catalogue picker" test (manage-offerings.spec.js) uploads a
// real file via tests/utils/preorders.js's uploadE2EOfferingPhoto(), which
// deliberately names it `offerings/E2E_{uid}_{timestamp}.png` — unlike the
// app's own uploadItemPhoto() (`offerings/{uid}_{timestamp}.ext`, no test
// marker available), that name IS safely scopable, so it's swept here the
// same way as the Firestore docs: list the `offerings/` folder, delete only
// items whose name starts with "E2E_".

const E2E_PREFIX = 'E2E ';

teardown('remove E2E-prefixed test data', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window._crumb, null, { timeout: 15_000 });

  const summary = await page.evaluate(async (prefix) => {
    const {
      db, collection, query, where, getDocs, deleteDoc, updateDoc, doc,
      storage, ref, listAll, deleteObject,
    } = window._crumb;
    // Firestore's documented prefix-range trick: appending U+F8FF (a very
    // high Unicode private-use codepoint — renders as invisible in most
    // fonts/editors, including this one, which is expected) means
    // `>= prefix AND < upperBound` matches exactly the strings starting
    // with `prefix`.
    const upperBound = prefix + '';
    const result = {};

    for (const col of ['preorderOfferings', 'bakeryCatalogue']) {
      const snap = await getDocs(query(
        collection(db, col),
        where('name', '>=', prefix),
        where('name', '<', upperBound)
      ));
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, col, d.id))));
      result[col] = snap.size;
    }

    const resSnap = await getDocs(query(
      collection(db, 'reservations'),
      where('offeringName', '>=', prefix),
      where('offeringName', '<', upperBound)
    ));
    let deleted = 0, cancelledInstead = 0;
    await Promise.all(resSnap.docs.map(async d => {
      try {
        await deleteDoc(doc(db, 'reservations', d.id));
        deleted++;
      } catch {
        await updateDoc(doc(db, 'reservations', d.id), { status: 'cancelled' });
        cancelledInstead++;
      }
    }));
    result.reservations = { deleted, cancelledInstead };

    const listing = await listAll(ref(storage, 'offerings'));
    const e2eFiles = listing.items.filter(item => item.name.startsWith('E2E_'));
    await Promise.all(e2eFiles.map(item => deleteObject(item)));
    result.storageFiles = e2eFiles.length;

    return result;
  }, E2E_PREFIX);

  console.log('[cleanup] removed E2E test data:', JSON.stringify(summary));
});
