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

// ─── MAP BASEMAP TILES (Stadia Maps) ───────────────────────────────────────
// Raster basemap tiles for the Explore map (src/pages/explore.js) and the
// profile modal's Dining Map (src/components/profileModal.js). Both used to
// pull CARTO's keyless basemaps.cartocdn.com/light_all tiles directly —
// CARTO ended keyless access to that basemap and now stamps every tile it
// serves without a key with a repeating "API KEY REQUIRED" watermark, which
// made the map unreadable in production.
//
// Stadia Maps' "alidade_smooth" style is the closest drop-in for CARTO's old
// light / Positron look. The free tier covers this app's volume. MAP_TILE_KEY
// is domain-restricted in the Stadia dashboard (edoneil94.github.io +
// localhost), so it's safe to ship in the client bundle — same rationale as
// GOOGLE_MAPS_KEY above. Stadia serves from a single host (no {s} subdomain
// rotation); {r} stays in the template for parity with the old URL but
// resolves to '' unless detectRetina is enabled on the layer. Stadia always
// allows localhost / 127.0.0.1 regardless of the domain allowlist, so local
// dev and the Playwright run work without adding them to the property.
export const MAP_TILE_KEY = 'dc0c09e8-719e-43f9-ae56-de13abdeeddb';
export const MAP_TILE_URL =
  `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${MAP_TILE_KEY}`;
export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
export const MAP_TILE_MAX_ZOOM = 20;
