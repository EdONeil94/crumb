// ─── GOOGLE PLACES SERVICE ──────────────────────────────────────────────────
// geocodeBakeryAddress was module-private in src/components/profileModal.js
// (its Dining Map tab). Phase 7 step 29 (src/pages/explore.js) needs the
// same helper for the Explore map, so it moved to a shared home here rather
// than being exported from profileModal.js (which would make explore.js
// depend on that whole heavy module) or duplicated. Pure network helper:
// a Places text search returning { lat, lng } or null, its only dependency
// GOOGLE_MAPS_KEY. Both profileModal.js and explore.js import it one-way.

import { GOOGLE_MAPS_KEY } from '../config.js';

export async function geocodeBakeryAddress(name, address) {
  if (!GOOGLE_MAPS_KEY || !address) return null;
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
        'X-Goog-FieldMask': 'places.location,places.id'
      },
      body: JSON.stringify({ textQuery: `${name} ${address}`, maxResultCount: 1 })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data.places?.[0]?.location;
    return loc ? { lat: loc.latitude, lng: loc.longitude } : null;
  } catch(e) { return null; }
}
