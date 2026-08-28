// ─── PRE-ORDER DISCOVERY PAGE ───────────────────────────────────────────────
// The #page-preorders routed view (pages/components carving, Phase 7
// step 30 — see CLAUDE.md): the country (locked to home country) / city /
// bakery / sort filters and the grouped list of active pre-order offerings
// for the selected city, read live from the `preorderOfferings` collection.
//
// Distinct from the "My Pre-orders" burger-menu sheet (still in
// legacy-app.js — Phase 7 step 31) and from the baker-side "Manage
// pre-orders" modal (src/components/manageOfferingsModal.js, step 17).
//
// initPreorderPage is exported for showPage() (legacy-app.js, step 32).
// renderPreorderPage registers here — it backs both the #poBakeryFilter/
// #poSortFilter data-onchange markup AND bakeryModal.js's
// getAction('renderPreorderPage')() call after a successful reserve
// (global registry, so no import either way). Every open* action in the
// row markup (openBakeryProfile / openReserveModal / openAuthModal) is a
// data-onclick string, resolved via the registry — no imports needed.
// poActiveCountry/poActiveCity/poUserCoords/poNearestCity are module-
// private (grep-confirmed: no reader outside this cluster, incl. the
// step-31 sheet).

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { EXPLORE_COUNTRIES, ALL_CITIES } from '../data/exploreCities.js';
import { allProfiles, allItems, currentUser, fb } from '../state/appState.js';
import { distKm, extractCity } from '../utils/geo.js';
import { showToast } from '../utils/dom.js';

let poActiveCountry = 'United Kingdom';
let poActiveCity = null;
let poUserCoords = null;
let poNearestCity = null;

export function initPreorderPage() {
  // Determine user's country — profile setting takes priority, then geolocation, then UK
  const profileCountry = allProfiles[currentUser?.uid]?.country || '';
  const detectedCountry = poNearestCity?.country || '';
  const country = profileCountry || detectedCountry || 'United Kingdom';
  poActiveCountry = country;

  // Country display (read-only — locked to home country)
  const countryDisplay = document.getElementById('poCountrySelect');
  if (countryDisplay) {
    countryDisplay.innerHTML = `<option value="${country}">${country}</option>`;
    countryDisplay.disabled = true;
    countryDisplay.title = 'Showing pre-orders in your home country. Update in Settings → Profile.';
  }

  populatePoCityDropdown(poActiveCountry, poActiveCity);
  if (poActiveCity) renderPreorderPage();

  // Auto-detect nearest city if not yet done
  if (!poNearestCity) poDetectNearest();
}

function onPoCountryChange() {
  // No-op — country is locked to user's home country
}

function onPoCityChange() {
  poActiveCity = document.getElementById('poCitySelect').value;
  if (poActiveCity) renderPreorderPage();
}

function populatePoCityDropdown(country, selectedCity) {
  const sel = document.getElementById('poCitySelect');
  if (!sel) return;
  const cities = (EXPLORE_COUNTRIES[country] || []).slice().sort((a,b) => a.name.localeCompare(b.name));
  const nearestName = poNearestCity?.country === country ? poNearestCity?.name : null;
  sel.innerHTML = '<option value="">Select a city…</option>' +
    cities.map(c => {
      const label = c.name === nearestName ? `📍 ${c.name} (nearest)` : c.name;
      return `<option value="${c.name}" ${c.name === selectedCity ? 'selected' : ''}>${label}</option>`;
    }).join('');
  if (selectedCity) sel.value = selectedCity;
}

function poDetectNearest() {
  const btn = document.getElementById('poNearestBtn');
  if (btn) { btn.disabled = true; btn.textContent = '📍 Detecting…'; }
  navigator.geolocation?.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    poUserCoords = { lat: latitude, lng: longitude };
    const countryCities = EXPLORE_COUNTRIES[poActiveCountry] || [];
    let nearest = null, nearestDist = Infinity;
    (countryCities.length ? countryCities : ALL_CITIES).forEach(city => {
      const d = distKm(latitude, longitude, city.lat, city.lng);
      if (d < nearestDist) { nearestDist = d; nearest = city; }
    });
    poNearestCity = nearest ? { ...nearest, country: poActiveCountry } : null;
    poActiveCity = nearest?.name || null;
    populatePoCityDropdown(poActiveCountry, poActiveCity);
    if (btn) { btn.disabled = false; btn.textContent = '📍 Nearest'; }
    if (poActiveCity) {
      showToast(`📍 Nearest: ${poActiveCity}`);
      renderPreorderPage();
    } else {
      showToast('Could not find a nearby city');
    }
  }, () => {
    if (btn) { btn.disabled = false; btn.textContent = '📍 Nearest'; }
    showToast('Location access denied');
  }, { timeout: 6000 });
}


async function renderPreorderPage() {
  if (!fb) return;
  const results = document.getElementById('preorderPageResults');
  const city = poActiveCity;
  if (!city) return;

  results.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner" style="margin:0 auto 12px;"></div><div style="font-size:0.82rem;color:var(--text-muted);">Finding pre-orders near ' + city + '…</div></div>';

  const { db, collection, query, where, getDocs } = fb;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  try {
    // Find bakeries in this city by matching address
    const cityObj = ALL_CITIES.find(c => c.name === city && c.country === poActiveCountry)
      || ALL_CITIES.find(c => c.name === city);

    // Get all active offerings (filter by city/bakery client-side)
    const snap = await getDocs(query(collection(db, 'preorderOfferings'), where('active','==',true)));
    let offerings = snap.docs.map(d => ({id:d.id,...d.data()}))
      .filter(o => {
        if (o.collectDate < todayStr) return false;
        // Go-live check
        const goLive = o.goLiveAt ? new Date(o.goLiveAt) : (() => {
          const d = new Date(o.collectDate + 'T00:00:00');
          d.setDate(d.getDate()-1); d.setHours(8,0,0,0); return d;
        })();
        return now >= goLive;
      });

    // Filter by city using Crumbz item data for that bakery
    const bakeriesInCity = new Set(
      allItems
        .filter(item => {
          const itemCity = extractCity(item.bakeryAddress || '');
          return itemCity.toLowerCase() === city.toLowerCase();
        })
        .map(i => i.bakeryName)
    );

    // Also try matching by bakeryName against Explore city data if no address match
    offerings = offerings.filter(o => bakeriesInCity.has(o.bakeryName) || offerings.length < 5);

    // If we got no city-matched offerings, fall back to showing all for now
    // with a message — bakeries without Crumbz reviews won't match by address
    const bakeryFilter = document.getElementById('poBakeryFilter')?.value || '';
    if (bakeryFilter) offerings = offerings.filter(o => o.bakeryName === bakeryFilter);

    // Populate bakery filter dropdown
    const bakeryNames = [...new Set(offerings.map(o => o.bakeryName).filter(Boolean))].sort();
    const poBakeryFilter = document.getElementById('poBakeryFilter');
    if (poBakeryFilter) {
      const current = poBakeryFilter.value;
      poBakeryFilter.innerHTML = '<option value="">🏪 All bakeries</option>' +
        bakeryNames.map(n => `<option value="${n}" ${n===current?'selected':''}>${n}</option>`).join('');
    }

    // Sort
    const sort = document.getElementById('poSortFilter')?.value || 'slot';
    if (sort === 'slot') offerings.sort((a,b) => (a.collectDate+a.slot).localeCompare(b.collectDate+b.slot));
    else if (sort === 'bakery') offerings.sort((a,b) => (a.bakeryName||'').localeCompare(b.bakeryName||''));
    else if (sort === 'price_asc') offerings.sort((a,b) => (a.price||0)-(b.price||0));
    else if (sort === 'price_desc') offerings.sort((a,b) => (b.price||0)-(a.price||0));

    if (!offerings.length) {
      results.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">🗓️</div>
        <div class="empty-state-title">No pre-orders in ${city} yet</div>
        <div class="empty-state-text">Check back later — bakeries update their listings daily.</div>
      </div>`;
      return;
    }

    // Group by date then bakery
    const byDate = {};
    offerings.forEach(o => {
      if (!byDate[o.collectDate]) byDate[o.collectDate] = {};
      if (!byDate[o.collectDate][o.bakeryName]) byDate[o.collectDate][o.bakeryName] = [];
      byDate[o.collectDate][o.bakeryName].push(o);
    });

    results.innerHTML = `
      <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px;">${offerings.length} item${offerings.length!==1?'s':''} available in ${city}</div>
      ${Object.entries(byDate).map(([date, bakeries]) => {
        const dateLabel = new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
        return `<div style="margin-bottom:28px;">
          <div style="font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;color:var(--espresso);margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--border);">Collection: ${dateLabel}</div>
          ${Object.entries(bakeries).map(([bakeryName, items]) => `
            <div style="margin-bottom:20px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div style="font-size:0.88rem;font-weight:600;color:var(--caramel);cursor:pointer;" data-onclick="closeBakeryModalIfOpen,openBakeryProfile" data-args='${dataArgs([bakeryName])}'>🏪 ${bakeryName} ↗</div>
                <div style="font-size:0.72rem;color:var(--text-muted);">${items.length} item${items.length!==1?'s':''}</div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
                ${items.map(o => {
                  const remaining = o.remaining ?? o.quantity ?? 0;
                  const soldOut = remaining <= 0;
                  return `<div class="preorder-card">
                    ${o.photoURL ? `<img src="${o.photoURL}" class="preorder-img" alt="${o.name}">` : `<div class="preorder-img">🥐</div>`}
                    <div class="preorder-body">
                      <div class="preorder-name">${o.name}</div>
                      ${o.description ? `<div class="preorder-desc">${o.description}</div>` : ''}
                      <div class="preorder-meta">
                        <span class="preorder-slot">🕐 ${o.slot}</span>
                        <span class="preorder-qty${remaining<=2&&!soldOut?' low':''}">${soldOut?'Sold out':`${remaining} left`}</span>
                      </div>
                      <div style="display:flex;align-items:center;justify-content:space-between;">
                        <span class="preorder-price">£${parseFloat(o.price||0).toFixed(2)}</span>
                        ${soldOut
                          ? `<button class="btn-ghost" disabled style="opacity:0.4;font-size:0.78rem;">Sold out</button>`
                          : currentUser
                            ? `<button class="btn-espresso" style="font-size:0.78rem;padding:7px 14px;" data-onclick="openReserveModal" data-args='${dataArgs([o.id, o.bakeryName, o.name, o.slot, o.collectDate, remaining||0, o.maxPerPerson||2])}'>Reserve</button>`
                            : `<button class="btn-espresso" style="font-size:0.78rem;padding:7px 14px;" data-onclick="openAuthModal">Sign in</button>`}
                      </div>
                    </div>
                  </div>`;
                }).join('')}
              </div>
            </div>`).join('')}
        </div>`;
      }).join('')}`;
  } catch(e) {
    results.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Could not load pre-orders.</div>';
    console.error(e);
  }
}

function closeBakeryModalIfOpen() {
  document.getElementById('bakeryModal')?.classList.remove('open');
}

registerActions({
  onPoCountryChange, onPoCityChange, poDetectNearest, renderPreorderPage,
  closeBakeryModalIfOpen,
});
