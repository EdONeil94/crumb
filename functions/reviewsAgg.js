// Shared itemRecords aggregate maths — used by submitReview / updateReview /
// deleteReview (C1, C1b) and by moderateFlaggedReview's 'remove' path (C3).
//
// The client used to compute these in the browser (legacy-app.js saveReview,
// editReviewModal.js saveEdit/deleteReview). Now the server owns them so the
// numbers can't be forged.

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

// Every tasting-dimension key stored on an item doc is `dim_*` (see
// src/data/categories.js getTastingDims). Recomputing over whatever dim_*
// keys the surviving reviews actually carry is category-agnostic and can't
// drift out of sync with the category tree.
function dimKeysIn(items) {
  const keys = new Set();
  for (const it of items) {
    for (const k of Object.keys(it)) if (k.startsWith('dim_')) keys.add(k);
  }
  return [...keys];
}

// Given the full set of review docs for one itemRecord, return the aggregate
// fields to write onto that record.
function aggregateFromReviews(items) {
  const reviewCount = items.length;
  const communityAvg = reviewCount
    ? round1(items.reduce((s, r) => s + (Number(r.overallRating) || 0), 0) / reviewCount)
    : 0;

  const withPrice = items.filter((r) => typeof r.price === 'number' && Number.isFinite(r.price));
  const priceCount = withPrice.length;
  const avgPrice = priceCount
    ? round2(withPrice.reduce((s, r) => s + r.price, 0) / priceCount)
    : null;

  const dims = {};
  for (const key of dimKeysIn(items)) {
    const vals = items.map((r) => Number(r[key]) || 0);
    dims[key] = vals.reduce((s, v) => s + v, 0) / vals.length;
  }

  return { communityAvg, reviewCount, avgPrice, priceCount, ...dims };
}

module.exports = { round1, round2, aggregateFromReviews };
