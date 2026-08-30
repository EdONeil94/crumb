// ─── GEO UTILITIES ──────────────────────────────────────────────────────────
// Extracted as-is from src/legacy-app.js (pages/components carving,
// Phase 0 step 2 — see CLAUDE.md). Pure functions, no shared state.

export function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function extractCity(address) {
  if (!address) return '';
  // Google Places UK format: "3 Bootham, York YO30 7BN, UK"
  // or "50 Goodramgate, York YO1 7LF, UK"
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);

  // Drop trailing country names
  const countryWords = ['uk', 'england', 'scotland', 'wales', 'ireland', 'united kingdom', 'gb'];
  const filtered = parts.filter(p => !countryWords.includes(p.toLowerCase()));

  // Within each part, strip postcodes (e.g. "York YO30 7BN" → "York")
  const cleaned = filtered.map(p => p.replace(/\b[A-Z]{1,2}\d[\d A-Z]*\d[A-Z]{2}\b/gi, '').trim()).filter(Boolean);

  // City is typically the last remaining part (after street address)
  return cleaned.length >= 2 ? cleaned[cleaned.length - 1] : (cleaned[0] || '');
}

export function extractCountry(address) {
  if (!address) return '';
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  const ukRegions = ['england', 'scotland', 'wales', 'northern ireland'];
  const last = (parts[parts.length - 1] || '').toLowerCase();
  if (last === 'uk' || last === 'united kingdom' || ukRegions.includes(last)) return 'United Kingdom';
  // Also catch "UK" embedded in last segment e.g. "York YO1, UK"
  if (parts.some(p => p.toLowerCase() === 'uk')) return 'United Kingdom';
  return parts[parts.length - 1] || '';
}
