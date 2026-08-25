// ─── CONFIG ─────────────────────────────────────────────────────────────────
// GOOGLE_MAPS_KEY moved out of src/legacy-app.js (2026-08-25, pages/components
// carving Phase 4 step 18) — not part of the addReviewModal.js extraction
// itself, but a necessary side-effect of it. src/components/addReviewModal.js
// needs it (fetchBakeryPlaces/selectBakery), and it's also used by several
// other not-yet-extracted clusters (geocoding, Explore map, Settings/Bakery
// photo uploads) still in legacy-app.js — importing it back from
// legacy-app.js into a leaf module would have broken the one invariant this
// whole carving plan has held since Phase 0: leaf modules never import
// anything from legacy-app.js. A shared, static, zero-risk value like this
// is exactly what src/data/categories.js already set precedent for in
// Phase 0 step 1 — same treatment here, just one constant instead of a tree
// of them.
export const GOOGLE_MAPS_KEY = 'AIzaSyCQa9SwvrPmdnk5S2-q8Mem2ZP22GVB1Yo';
