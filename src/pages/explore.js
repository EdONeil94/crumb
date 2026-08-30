// ─── EXPLORE PAGE ───────────────────────────────────────────────────────────
// The #page-explore routed view (pages/components carving, Phase 7 step 29 —
// see CLAUDE.md). country/city pickers, "Nearby" radius mode, the Leaflet
// map view, geo detection, and the trending-bakeries logic that mixes
// Crumbz reviews with live Google Places results. (An on-screen
// "Debug log" panel under the map — scaffolding from an iOS map bug — was
// removed 2026-08-30 along with its exploreMapLog() helper; real error
// paths now use console.warn/console.error.)
//
// exploreCache lives in src/state/appState.js (moved there at Phase 1
// residual #2, 2026-08-30, alongside buildBakeryIndex — its only
// cross-module reader). This page populates it (exploreCache[key] = ...,
// property mutation on the imported live binding — never reassigned here).
// Extracting it from this file was the last thing blocking loadData()/
// buildBakeryIndex()/loadProfiles() from leaving legacy-app.js (Phase 0
// stage 3b's deferral).
//
// initExplorePage is exported for showPage() (nav.js, Phase 1 residual #1).
// EXPLORE_COUNTRIES/ALL_CITIES/UK_CITIES live in src/data/exploreCities.js
// (also imported by Settings + Pre-order discovery, still in legacy-app.js).
// geocodeBakeryAddress is imported from src/services/places.js (shared with
// profileModal.js's Dining Map). Every openBakeryProfile call here is
// data-onclick markup, resolved via the global registry — no import needed.
// The Leaflet map loads leaflet.js from unpkg on demand inside
// renderExploreMap (its own self-contained loader), same as before.

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { EXPLORE_COUNTRIES, ALL_CITIES, UK_CITIES } from '../data/exploreCities.js';
import { allItems, currentUser, isBookmarked, exploreCache } from '../state/appState.js';
import { distKm } from '../utils/geo.js';
import { showToast } from '../utils/dom.js';
import { getCategoryDisplay } from '../data/categories.js';
import { GOOGLE_MAPS_KEY, MAP_TILE_URL, MAP_TILE_ATTRIBUTION, MAP_TILE_MAX_ZOOM } from '../config.js';
import { geocodeBakeryAddress } from '../services/places.js';

let exploreActiveCity = null;
let exploreActiveCountry = 'United Kingdom';
let exploreSortMode = 'top';
let exploreNearestCity = null;
let exploreNearbyActive = false;
let exploreNearbyRadiusMiles = 5;
let exploreNearbyCoords = null;

// ─── EXPLORE: MAP VIEW ─────────────────────────────────────────────────────────
let exploreViewMode = 'list';
let exploreLastResults = [];
let exploreMapInstance = null;

function setExploreViewMode(mode) {
  exploreViewMode = mode;
  document.getElementById('exploreViewListBtn').classList.toggle('active', mode === 'list');
  document.getElementById('exploreViewMapBtn').classList.toggle('active', mode === 'map');
  document.getElementById('exploreBakeryList').style.display = mode === 'list' ? 'flex' : 'none';
  document.getElementById('exploreMapWrap').style.display = mode === 'map' ? 'block' : 'none';
  if (mode === 'map') renderExploreMap(exploreLastResults);
}

async function renderExploreMap(bakeries) {
  const el = document.getElementById('exploreMapEl');
  const loader = document.getElementById('exploreMapLoading');
  const loaderText = document.getElementById('exploreMapLoadingText');
  if (!el) return;
  if (loader) loader.style.display = 'flex';
  if (loaderText) loaderText.textContent = 'Loading map…';

  // Many bakeries — especially older Crumbz reviews added before Places-based
  // selection was the norm — never had lat/lng stored at all. Rather than
  // silently dropping them from the map, geocode the ones that are missing it
  // (same approach already used for the profile "My Map" and Bakeries→Nearest).
  const withCoords = bakeries.filter(b => b.lat && b.lng);
  const missingCoords = bakeries.filter(b => !b.lat || !b.lng);

  if (missingCoords.length && loaderText) {
    loaderText.textContent = `Locating ${missingCoords.length} bakery${missingCoords.length !== 1 ? 'ies' : ''}…`;
  }

  let points;
  try {
    const geocoded = await Promise.all(missingCoords.map(async b => {
      const coords = await geocodeBakeryAddress(b.name, b.address);
      return coords ? { ...b, lat: coords.lat, lng: coords.lng } : null;
    }));
    points = [...withCoords, ...geocoded.filter(Boolean)];
  } catch(geoErr) {
    console.warn('Explore map: geocode step failed', geoErr);
    points = withCoords;
  }

  function setupMap() {
    try {
      if (loader) loader.style.display = 'none';
      if (exploreMapInstance) { exploreMapInstance.remove(); exploreMapInstance = null; }

      const L = window.L;
      exploreMapInstance = L.map('exploreMapEl', { center: [54, -1], zoom: 6, zoomControl: true, scrollWheelZoom: false, tap: true, touchZoom: true, dragging: true });

      L.tileLayer(MAP_TILE_URL, {
        attribution: MAP_TILE_ATTRIBUTION, maxZoom: MAP_TILE_MAX_ZOOM
      }).addTo(exploreMapInstance);

      // Two earlier approaches both failed: inline SVG in a divIcon silently
      // failed to paint on iOS Safari (no error, just invisible), and
      // circleMarker + a permanent Leaflet tooltip threw a hard "appendChild"
      // crash on EVERY browser including desktop (confirmed — this was never
      // iOS-specific, it was a genuine bug in that combination). Plain HTML/CSS
      // inside a divIcon — no SVG, no Leaflet tooltip system — sidesteps both:
      // it's just a styled <div> with text in it, the most basic possible
      // rendering path.
      function makeIcon(label, isCrumb) {
        const fill = isCrumb ? '#2c1810' : '#8a8a8a';
        const stroke = isCrumb ? '#d4a574' : '#cfcfcf';
        const html = `<div style="width:30px;height:30px;border-radius:50%;background:${fill};border:2px solid ${stroke};display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:9px;font-weight:700;color:${stroke};box-sizing:border-box;">${label}</div>`;
        return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
      }

      const markerLayer = L.layerGroup();

      if (!points.length) {
        el.insertAdjacentHTML('beforeend', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:400;"><div style="background:rgba(250,246,240,0.92);border-radius:8px;padding:12px 20px;font-size:0.82rem;color:var(--text-muted);text-align:center;">📍 No mappable bakeries in this result set</div></div>`);
      }

      let markersAdded = 0;
      points.forEach(b => {
        try {
          const isCrumb = b.source === 'crumb';
          const scoreLabel = isCrumb ? (b.communityAvg || 0).toFixed(1) : (b.googleRating || '–');

          const marker = L.marker([b.lat, b.lng], { icon: makeIcon(scoreLabel, isCrumb) });

          const cardAction = isCrumb
            ? `data-onclick="closeExploreMapPopup,openBakeryProfile" data-args='${dataArgs([b.name])}'`
            : '';
          const actionHtml = isCrumb
            ? `<button data-onclick="closeExploreMapPopup,openBakeryProfile" data-args='${dataArgs([b.name])}' style="margin-top:6px;width:100%;background:#2c1810;color:#d4a574;border:none;border-radius:100px;padding:8px 12px;font-size:0.8rem;font-weight:600;cursor:pointer;">View bakery →</button>`
            : `<button data-onclick="closeExploreMapPopup,openAddModalForBakery" data-args='${dataArgs([b.name, b.address || '', b.placeId || '', b.lat || '', b.lng || ''])}' style="margin-top:6px;width:100%;background:#2c1810;color:#d4a574;border:none;border-radius:100px;padding:8px 12px;font-size:0.8rem;font-weight:600;cursor:pointer;">+ Be first to review</button>`;

          // For reviewed bakeries, the whole card is tappable (not just the small
          // button) — much easier to hit accurately on a touchscreen. Google-only
          // cards keep just the explicit "+ Be first to review" button, since
          // that's a deliberate add action rather than a passive drill-through.
          // Neither the card nor the button needs event.stopPropagation() any
          // more: our delegated click handler resolves to the innermost
          // data-onclick match only, so the button's action never also
          // re-triggers the card's.
          marker.bindPopup(`
            <div style="font-family:sans-serif;min-width:170px;${isCrumb ? 'cursor:pointer;' : ''}" ${cardAction}>
              <div style="font-weight:700;font-size:0.88rem;margin-bottom:3px;">${b.name}</div>
              <div style="font-size:0.74rem;color:#888;margin-bottom:4px;">${b.address || ''}</div>
              <div style="font-size:0.8rem;">${isCrumb ? `<strong>${b.reviewCount || 1}</strong> review${(b.reviewCount||1) !== 1 ? 's' : ''} &nbsp;·&nbsp; <strong style="color:#2c1810;">⭐ ${scoreLabel}</strong>` : `<strong style="color:#2c1810;">★ ${scoreLabel} Google</strong>${b.googleReviews ? ` &nbsp;·&nbsp; ${b.googleReviews.toLocaleString()} reviews` : ''}`}</div>
              ${actionHtml}
            </div>`, { maxWidth: 220 });
          markerLayer.addLayer(marker);
          markersAdded++;
        } catch(markerErr) {
          console.warn(`Explore map: marker failed for "${b.name}"`, markerErr);
        }
      });

      exploreMapInstance.addLayer(markerLayer);

      if (points.length) {
        const group = L.featureGroup(points.map(b => L.marker([b.lat, b.lng])));
        try {
          exploreMapInstance.fitBounds(group.getBounds().pad(0.3), { maxZoom: 14 });
        } catch(fbErr) {
          console.warn('Explore map: fitBounds failed', fbErr);
        }
      }

      // Leaflet measures its container's pixel size at the moment it initialises.
      // Since #exploreMapWrap goes from display:none to visible right before this
      // runs, the browser may not have finished laying it out yet — on slower
      // mobile devices in particular, a fixed setTimeout delay isn't always long
      // enough. A ResizeObserver is the robust fix: it fires whenever the
      // container's actual rendered size changes, however long that takes.
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          if (exploreMapInstance) exploreMapInstance.invalidateSize();
        });
        ro.observe(el);
        // Stop observing once the map is torn down again
        exploreMapInstance.on('unload', () => ro.disconnect());
      } else {
        // Fallback for older browsers without ResizeObserver support
        setTimeout(() => { if (exploreMapInstance) exploreMapInstance.invalidateSize(); }, 100);
        setTimeout(() => { if (exploreMapInstance) exploreMapInstance.invalidateSize(); }, 500);
      }

      if (markersAdded === 0 && points.length > 0) {
        el.insertAdjacentHTML('beforeend', `<div style="position:absolute;top:8px;left:8px;right:8px;z-index:600;background:#c0392b;color:white;border-radius:8px;padding:10px 14px;font-size:0.78rem;">⚠️ Found ${points.length} location${points.length!==1?'s':''} but couldn't place any pins on the map.</div>`);
      }
    } catch(fatalErr) {
      console.error('Explore map failed to render:', fatalErr);
      if (loader) loader.style.display = 'none';
      el.insertAdjacentHTML('beforeend', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--parchment);z-index:600;padding:20px;text-align:center;"><div><div style="font-size:1.5rem;margin-bottom:8px;">⚠️</div><div style="font-size:0.85rem;color:var(--text-body);margin-bottom:6px;font-weight:600;">Map couldn't load</div><div style="font-size:0.72rem;color:var(--text-muted);word-break:break-word;">${(fatalErr && fatalErr.message) || 'Unknown error'}</div></div></div>`);
    }
  }

  if (window.L) {
    setupMap();
  } else {
    const s1 = document.createElement('script');
    s1.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s1.onload = () => setupMap();
    s1.onerror = () => {
      console.error('Explore map: leaflet.js failed to load');
      if (loader) loader.style.display = 'none';
      el.insertAdjacentHTML('beforeend', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--parchment);z-index:600;padding:20px;text-align:center;"><div><div style="font-size:1.5rem;margin-bottom:8px;">⚠️</div><div style="font-size:0.85rem;color:var(--text-body);font-weight:600;">Couldn't load the map library</div><div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">Check your connection and try again</div></div></div>`);
    };
    document.head.appendChild(s1);
  }
}

// Leaflet popups render inside iframe-free DOM but outside Explore's own
// click-handling context, so route "view" / "review" taps back through a
// small registrable action that closes the popup first for a clean
// transition — used as the "cleanup" half of the comma-list "cleanup, then
// one parameterized action" shape.
function closeExploreMapPopup() {
  if (exploreMapInstance) exploreMapInstance.closePopup();
}

function hideExploreResults() {
  document.getElementById('exploreResults').style.display = 'none';
}

// ─── EXPLORE: NEARBY MODE (radius-based, not tied to any city) ────────────────
function toggleExploreNearby() {
  exploreNearbyActive = !exploreNearbyActive;
  const btn = document.getElementById('exploreNearbyBtn');
  const radiusSel = document.getElementById('exploreNearbyRadius');

  if (exploreNearbyActive) {
    btn.classList.add('active');
    btn.style.background = 'var(--honey)';
    btn.style.color = 'var(--espresso)';
    radiusSel.style.display = 'inline-block';
    // Deselect any city — nearby and city selection are mutually exclusive
    exploreActiveCity = null;
    document.getElementById('exploreCitySelect').value = '';
    runExploreNearbySearch();
  } else {
    btn.classList.remove('active');
    btn.style.background = '';
    btn.style.color = '';
    radiusSel.style.display = 'none';
    document.getElementById('exploreResults').style.display = 'none';
  }
}

function onExploreRadiusChange() {
  exploreNearbyRadiusMiles = parseInt(document.getElementById('exploreNearbyRadius').value);
  if (exploreNearbyActive) runExploreNearbySearch();
}

async function runExploreNearbySearch() {
  const resultsEl = document.getElementById('exploreResults');
  const btn = document.getElementById('exploreNearbyBtn');
  const originalLabel = '📍 Nearby';
  btn.textContent = '📍 Locating…';

  const coords = await new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 }
    );
  });

  btn.textContent = originalLabel;

  if (!coords) {
    showToast('Could not get your location');
    resultsEl.style.display = 'block';
    document.getElementById('exploreEyebrow').textContent = '📍 Nearby';
    document.getElementById('exploreTitle').textContent = 'Location unavailable';
    document.getElementById('exploreCrumbBanner').style.display = 'none';
    document.getElementById('exploreBakeryList').innerHTML = `<div class="empty-state"><div class="empty-state-icon">📍</div><div class="empty-state-title">Couldn't get your location</div><div class="empty-state-text">Check your device's location permissions and try again.</div></div>`;
    return;
  }

  exploreNearbyCoords = coords;
  const radiusKm = exploreNearbyRadiusMiles * 1.60934;

  resultsEl.style.display = 'block';
  document.getElementById('exploreEyebrow').textContent = '📍 Nearby';
  document.getElementById('exploreTitle').textContent = `Within ${exploreNearbyRadiusMiles} mile${exploreNearbyRadiusMiles !== 1 ? 's' : ''} of you`;
  document.getElementById('exploreBakeryList').innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner" style="margin:0 auto;"></div></div>';
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const crumbBakeries = getCrumbBakeriesNearPoint(coords.lat, coords.lng, radiusKm);

  const crumbBanner = document.getElementById('exploreCrumbBanner');
  const crumbBannerText = document.getElementById('exploreCrumbBannerText');
  if (crumbBakeries.length > 0) {
    crumbBanner.style.display = 'flex';
    crumbBannerText.textContent = `${crumbBakeries.length} bakeries reviewed by the Crumbz community nearby`;
  } else {
    crumbBanner.style.display = 'none';
  }

  let googleResults = [];
  try {
    googleResults = await fetchGoogleBakeriesNearPoint(coords.lat, coords.lng, radiusKm);
  } catch(e) {
    console.warn('Google Places nearby error:', e);
  }

  renderExploreResults({ name: 'this area' }, crumbBakeries, googleResults, true);
}

function getCrumbBakeriesNearPoint(lat, lng, radiusKm) {
  const results = {};
  allItems.forEach(item => {
    if (!item.bakeryName || !item.bakeryLat) return;
    const dist = distKm(lat, lng, item.bakeryLat, item.bakeryLng);
    if (dist > radiusKm) return;
    const key = item.bakeryName;
    if (!results[key]) results[key] = { name: key, address: item.bakeryAddress || '', lat: item.bakeryLat, lng: item.bakeryLng, items: [], totalScore: 0, dist };
    results[key].items.push(item);
    results[key].totalScore += (item.communityAvg || item.overallRating || 0);
  });
  return Object.values(results)
    .map(b => ({ ...b, communityAvg: b.items.length ? b.totalScore / b.items.length : 0, topItem: [...b.items].sort((a,b) => (b.communityAvg||b.overallRating||0) - (a.communityAvg||a.overallRating||0))[0] }))
    .sort((a, b) => b.communityAvg - a.communityAvg)
    .slice(0, 20);
}

async function fetchGoogleBakeriesNearPoint(lat, lng, radiusKm) {
  if (!GOOGLE_MAPS_KEY) return [];
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location,places.websiteUri,places.regularOpeningHours'
    },
    body: JSON.stringify({
      textQuery: 'bakery cafe patisserie',
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radiusKm * 1000, 50000) }
      },
      maxResultCount: 20
    })
  });
  const data = await res.json();
  return (data.places || [])
    .filter(p => p.rating && p.rating >= 3.5)
    // locationBias is only a soft preference for the Places API — it does NOT
    // exclude results outside the radius, so enforce the actual distance ourselves.
    .filter(p => {
      if (!p.location?.latitude || !p.location?.longitude) return false;
      return distKm(lat, lng, p.location.latitude, p.location.longitude) <= radiusKm;
    })
    .sort((a, b) => {
      const scoreA = (a.rating || 0) * Math.log10((a.userRatingCount || 1) + 1);
      const scoreB = (b.rating || 0) * Math.log10((b.userRatingCount || 1) + 1);
      return scoreB - scoreA;
    })
    .slice(0, 20);
}

// ─── EXPLORE: DROPDOWNS ───────────────────────────────────────────────────────
function populateExploreCountryDropdown(selectedCountry) {
  const sel = document.getElementById('exploreCountrySelect');
  if (!sel) return;
  sel.innerHTML = Object.keys(EXPLORE_COUNTRIES).sort().map(c =>
    `<option value="${c}" ${c === selectedCountry ? 'selected' : ''}>${c}</option>`
  ).join('');
}

function populateExploreCityDropdown(country, selectedCity) {
  const sel = document.getElementById('exploreCitySelect');
  if (!sel) return;
  const cities = (EXPLORE_COUNTRIES[country] || []).slice().sort((a,b) => a.name.localeCompare(b.name));
  const nearestName = exploreNearestCity?.country === country ? exploreNearestCity?.name : null;
  sel.innerHTML = `<option value="">Select a city…</option>` +
    cities.map(c => {
      const label = c.name === nearestName ? `📍 ${c.name} (nearest)` : c.name;
      return `<option value="${c.name}" ${c.name === selectedCity ? 'selected' : ''}>${label}</option>`;
    }).join('');
}

function onExploreCountryChange() {
  deactivateExploreNearby();
  exploreActiveCountry = document.getElementById('exploreCountrySelect').value;
  exploreActiveCity = null;
  document.getElementById('exploreResults').style.display = 'none';
  populateExploreCityDropdown(exploreActiveCountry, null);
}

function onExploreCityChange() {
  const city = document.getElementById('exploreCitySelect').value;
  if (city) {
    deactivateExploreNearby();
    selectExploreCity(city);
  }
}

function deactivateExploreNearby() {
  if (!exploreNearbyActive) return;
  exploreNearbyActive = false;
  const btn = document.getElementById('exploreNearbyBtn');
  const radiusSel = document.getElementById('exploreNearbyRadius');
  if (btn) { btn.classList.remove('active'); btn.style.background = ''; btn.style.color = ''; }
  if (radiusSel) radiusSel.style.display = 'none';
}

function onExploreSortChange() {
  exploreSortMode = document.getElementById('exploreSortSelect').value;
  if (exploreActiveCity) selectExploreCity(exploreActiveCity);
}

// ─── EXPLORE: GEO DETECTION ───────────────────────────────────────────────────
async function detectExploreLocation() {
  populateExploreCountryDropdown('United Kingdom');
  populateExploreCityDropdown('United Kingdom', null);

  if (!navigator.geolocation) return;

  document.getElementById('exploreCountrySelect').innerHTML = '<option>🌍 Detecting location…</option>';

  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;

    let nearest = null, nearestDist = Infinity;
    ALL_CITIES.forEach(city => {
      const d = distKm(latitude, longitude, city.lat, city.lng);
      if (d < nearestDist) { nearestDist = d; nearest = city; }
    });

    exploreNearestCity = nearest;
    exploreActiveCountry = nearest?.country || 'United Kingdom';

    populateExploreCountryDropdown(exploreActiveCountry);
    populateExploreCityDropdown(exploreActiveCountry, nearest?.name);

    if (nearest) {
      document.getElementById('exploreCitySelect').value = nearest.name;
      selectExploreCity(nearest.name, true);
    }
  }, () => {
    populateExploreCountryDropdown('United Kingdom');
    populateExploreCityDropdown('United Kingdom', null);
  }, { timeout: 6000 });
}

function renderExploreCityGrid() {
  // No-op — city grid replaced by dropdown; kept for compatibility
}

export function initExplorePage() {
  populateExploreCountryDropdown(exploreActiveCountry);
  populateExploreCityDropdown(exploreActiveCountry, exploreActiveCity);
  if (exploreActiveCity) {
    document.getElementById('exploreCitySelect').value = exploreActiveCity;
    document.getElementById('exploreResults').style.display = 'block';
  }
  detectExploreLocation();
}

// ─── EXPLORE: TRENDING LOGIC ──────────────────────────────────────────────────
function getTrendingBakeriesNearCity(city) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const results = {};

  allItems.forEach(item => {
    const ts = item.createdAt?.toDate ? item.createdAt.toDate() : (item.createdAt ? new Date(item.createdAt) : null);
    if (!ts || ts < cutoff) return;

    let nearCity = false;
    if (item.bakeryLat) {
      nearCity = distKm(city.lat, city.lng, item.bakeryLat, item.bakeryLng) <= 20;
    } else {
      nearCity = (item.bakeryAddress || '').toLowerCase().includes(city.name.toLowerCase());
    }
    if (!nearCity) return;

    const key = item.bakeryName || 'Unknown';
    if (!results[key]) results[key] = { name: key, address: item.bakeryAddress || '', lat: item.bakeryLat, lng: item.bakeryLng, items: [], totalScore: 0, recentCount: 0 };
    results[key].items.push(item);
    results[key].totalScore += (item.communityAvg || item.overallRating || 0);
    results[key].recentCount++;
  });

  return Object.values(results)
    .map(b => ({
      ...b,
      communityAvg: b.items.length ? b.totalScore / b.items.length : 0,
      topItem: [...b.items].sort((a,b) => (b.communityAvg||b.overallRating||0) - (a.communityAvg||a.overallRating||0))[0]
    }))
    .sort((a, b) => b.recentCount - a.recentCount || b.communityAvg - a.communityAvg);
}

function getCrumbBakeriesNearCity(city) {
  const results = {};
  allItems.forEach(item => {
    if (!item.bakeryName) return;
    let nearCity = false;
    if (item.bakeryLat) {
      nearCity = distKm(city.lat, city.lng, item.bakeryLat, item.bakeryLng) <= 20;
    } else {
      nearCity = (item.bakeryAddress || '').toLowerCase().includes(city.name.toLowerCase());
    }
    if (!nearCity) return;
    const key = item.bakeryName;
    if (!results[key]) results[key] = { name: key, address: item.bakeryAddress || '', lat: item.bakeryLat, lng: item.bakeryLng, items: [], totalScore: 0, dist: item.bakeryLat ? distKm(city.lat, city.lng, item.bakeryLat, item.bakeryLng) : 0 };
    results[key].items.push(item);
    results[key].totalScore += (item.communityAvg || item.overallRating || 0);
  });
  return Object.values(results)
    .map(b => ({ ...b, communityAvg: b.items.length ? b.totalScore / b.items.length : 0, topItem: [...b.items].sort((a,b) => (b.communityAvg||b.overallRating||0) - (a.communityAvg||a.overallRating||0))[0] }))
    .sort((a,b) => b.communityAvg - a.communityAvg);
}

async function selectExploreCity(cityName, isAutoDetected = false) {
  exploreActiveCity = cityName;

  // Look up city across all countries (active country first)
  const countryCities = EXPLORE_COUNTRIES[exploreActiveCountry] || [];
  const city = countryCities.find(c => c.name === cityName) || ALL_CITIES.find(c => c.name === cityName);
  if (!city) return;

  // Update chips
  document.querySelectorAll('.city-chip').forEach(c => {
    const chipName = c.textContent.replace('📍 ','').replace(' 🥐','').trim();
    c.classList.toggle('active', chipName === cityName);
  });

  const resultsEl = document.getElementById('exploreResults');
  resultsEl.style.display = 'block';

  const eyebrow = exploreSortMode === 'trending' ? '🔥 Trending bakeries in' : '⭐ Top bakeries in';
  const nearestLabel = isAutoDetected ? ' (nearest to you)' : '';
  document.getElementById('exploreEyebrow').textContent = eyebrow;
  document.getElementById('exploreTitle').textContent = cityName + nearestLabel;
  document.getElementById('exploreBakeryList').innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner" style="margin:0 auto;"></div></div>';
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Get Crumbz data
  const crumbBakeries = exploreSortMode === 'trending'
    ? getTrendingBakeriesNearCity(city)
    : getCrumbBakeriesNearCity(city);

  const crumbBanner = document.getElementById('exploreCrumbBanner');
  const crumbBannerText = document.getElementById('exploreCrumbBannerText');
  if (crumbBakeries.length > 0) {
    crumbBanner.style.display = 'flex';
    crumbBannerText.textContent = exploreSortMode === 'trending'
      ? `${crumbBakeries.length} bakeries active in ${cityName} in the last 30 days`
      : `${crumbBakeries.length} bakeries reviewed by the Crumbz community in ${cityName}`;
  } else {
    crumbBanner.style.display = 'none';
  }

  // Google Places (only for top rated; trending shows Crumbz-only)
  let googleResults = [];
  let googleFailed = false;
  if (exploreSortMode === 'top') {
    const cacheKey = cityName;
    if (exploreCache[cacheKey]) {
      googleResults = exploreCache[cacheKey];
    } else {
      try {
        googleResults = await fetchGoogleBakeries(city);
        exploreCache[cacheKey] = googleResults;
      } catch(e) {
        console.warn('Google Places error:', e);
        googleFailed = true;
      }
    }
  }

  renderExploreResults(city, crumbBakeries, googleResults, googleFailed);
}

async function fetchGoogleBakeries(city) {
  if (!GOOGLE_MAPS_KEY) return [];
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location,places.websiteUri,places.regularOpeningHours'
    },
    body: JSON.stringify({
      textQuery: `bakery cafe patisserie in ${city.name} ${city.country || ''}`,
      locationBias: {
        circle: { center: { latitude: city.lat, longitude: city.lng }, radius: 8000 }
      },
      maxResultCount: 20
    })
  });
  const data = await res.json();
  return (data.places || [])
    .filter(p => p.rating && p.rating >= 3.5)
    .sort((a, b) => {
      // Score = rating * log(reviews) to balance quality and popularity
      const scoreA = (a.rating || 0) * Math.log10((a.userRatingCount || 1) + 1);
      const scoreB = (b.rating || 0) * Math.log10((b.userRatingCount || 1) + 1);
      return scoreB - scoreA;
    })
    .slice(0, 20);
}

function renderExploreResults(city, crumbBakeries, googleResults, isNearby) {
  const list = document.getElementById('exploreBakeryList');

  // Merge: Crumbz bakeries take priority, then Google fills the rest
  const combined = [];
  const crumbNames = new Set(crumbBakeries.map(b => b.name.toLowerCase()));

  // Add Crumbz bakeries first
  crumbBakeries.forEach(b => combined.push({ ...b, source: 'crumb' }));

  // Add Google results that aren't already in Crumbz
  googleResults.forEach(p => {
    const pName = (p.displayName?.text || '').toLowerCase();
    const alreadyInCrumb = [...crumbNames].some(cn => pName.includes(cn) || cn.includes(pName));
    if (!alreadyInCrumb) {
      combined.push({
        source: 'google',
        name: p.displayName?.text || 'Unknown',
        address: p.formattedAddress || '',
        googleRating: p.rating,
        googleReviews: p.userRatingCount,
        website: p.websiteUri || null,
        placeId: p.id,
        lat: p.location?.latitude,
        lng: p.location?.longitude,
      });
    }
  });

  if (!combined.length) {
    const nearbyHint = isNearby ? ' Try a wider radius to see more options.' : '';
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏪</div><div class="empty-state-title">No bakeries found ${isNearby ? 'within this radius' : 'yet'}</div><div class="empty-state-text">Be the first to review a bakery in ${city.name} on Crumbz!${nearbyHint}</div></div>`;
    const countEl = document.getElementById('exploreResultCount');
    if (countEl) countEl.textContent = '';
    exploreLastResults = [];
    if (exploreViewMode === 'map') renderExploreMap([]);
    return;
  }

  const countEl = document.getElementById('exploreResultCount');
  if (countEl) {
    countEl.textContent = isNearby
      ? `${combined.length} bakeries found within this radius`
      : '';
  }

  // Stash the latest result set so the Map view (and re-toggling into it) can
  // use it without needing to re-fetch anything.
  exploreLastResults = combined;
  if (exploreViewMode === 'map') renderExploreMap(combined);

  list.innerHTML = combined.slice(0, 20).map((b, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

    if (b.source === 'crumb') {
      // Crumbz-reviewed bakery
      const avg = b.communityAvg.toFixed(1);
      const topItem = b.topItem;
      const topItemHTML = topItem ? `
        <div class="explore-top-item" data-onclick="closeMobileMenu,openBakeryProfile" data-args='${dataArgs([b.name])}'>
          ${topItem.photoURL ? `<img src="${topItem.photoURL}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex-shrink:0;" alt="">` : `<span style="font-size:1.2rem;">${getCategoryDisplay(topItem).emoji}</span>`}
          <div>
            <div class="explore-top-item-label">Best rated item</div>
            <div class="explore-top-item-name">${topItem.name || 'Unknown'}</div>
          </div>
          <div class="explore-top-item-score">${(topItem.communityAvg || topItem.overallRating || 0).toFixed(1)}</div>
        </div>` : '';
      return `
        <div class="explore-bakery-card">
          <div class="explore-bakery-header">
            <div class="explore-rank ${rankClass}">${rank}</div>
            <div class="explore-bakery-info">
              <div class="explore-bakery-name">${b.name}</div>
              <div class="explore-bakery-address">📍 ${b.address}</div>
              <div class="explore-bakery-meta">
                <span class="explore-score-badge crumb">🥐 ${avg} Crumbz</span>
                <span style="font-size:0.75rem;color:var(--text-muted);">${b.items.length} review${b.items.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
              ${currentUser ? `<button class="bookmark-btn${isBookmarked(b.name) ? ' saved' : ''}" data-onclick="toggleBookmark" data-args='${dataArgs([b.name, b.address || ''])}' title="Save bakery">🔖</button>` : ''}
              <button class="admin-btn primary" data-onclick="openBakeryProfile" data-args='${dataArgs([b.name])}' style="font-size:0.78rem;">View →</button>
            </div>
          </div>
          ${topItemHTML}
        </div>`;
    } else {
      // Google-sourced bakery — not yet reviewed on Crumbz
      const stars = '★'.repeat(Math.round(b.googleRating || 0));
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.name + ' ' + (b.address || ''))}&query_place_id=${b.placeId}`;
      // Matches the old hand-built onclick="...openBakeryProfile(name,'',{...})"
      // JS-object-literal source field-for-field: address/placeId always a
      // string (placeId defaults to '', not null — openBakeryProfile's own
      // `googleData.placeId || null` normalizes that further downstream, so
      // either default behaves identically once it gets there), lat/lng/
      // googleRating/googleReviews all number-or-null.
      const googleData = {
        address: b.address || '',
        placeId: b.placeId || '',
        lat: b.lat || null,
        lng: b.lng || null,
        googleRating: b.googleRating || null,
        googleReviews: b.googleReviews || null,
      };
      return `
        <div class="explore-bakery-card">
          <div class="explore-bakery-header">
            <div class="explore-rank ${rankClass}">${rank}</div>
            <div class="explore-bakery-info">
              <div class="explore-bakery-name">${b.name}</div>
              <div class="explore-bakery-address">📍 ${b.address}</div>
              <div class="explore-bakery-meta">
                <span class="explore-score-badge google">★ ${b.googleRating} Google</span>
                <span style="font-size:0.75rem;color:var(--text-muted);">${b.googleReviews?.toLocaleString() || '?'} reviews</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
              ${currentUser ? `<button class="bookmark-btn${isBookmarked(b.name) ? ' saved' : ''}" data-onclick="toggleBookmark" data-args='${dataArgs([b.name, b.address || ''])}' title="Save bakery">🔖</button>` : ''}
              <button class="admin-btn primary" data-onclick="openBakeryProfile" data-args='${dataArgs([b.name, '', googleData])}' style="font-size:0.78rem;">View →</button>
            </div>
          </div>
          <div class="explore-no-crumb">
            <span>Not yet reviewed on Crumbz</span>
            <button class="admin-btn primary" style="font-size:0.75rem;" data-onclick="openAddModalForBakery" data-args='${dataArgs([b.name, b.address, b.placeId || '', b.lat || '', b.lng || ''])}'>+ Be first to review</button>
          </div>
        </div>`;
    }
  }).join('');
}

registerActions({
  onExploreCountryChange, onExploreCityChange, onExploreSortChange,
  toggleExploreNearby, onExploreRadiusChange, hideExploreResults,
  setExploreViewMode, closeExploreMapPopup,
});
