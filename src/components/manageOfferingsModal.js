// ─── MANAGE OFFERINGS MODAL ─────────────────────────────────────────────────
// The baker-side "Manage pre-orders" modal: tab bar (Upcoming/Last 7d/
// Month/Forecast), the Upcoming tab's own Add-offering form + Edit-offering
// overlay, the item catalogue (auto-fill + manage), and marking a
// reservation collected. Pages/components carving, Phase 4 step 17 — see
// CLAUDE.md. The biggest single cluster in this plan (~1,020 lines of
// function bodies, 11 real-click tests in tests/manage-offerings.spec.js —
// deepest coverage in the app) — the "does this scale" milestone for the
// extraction approach used so far.
//
// Moved wholesale, as ONE commit — flagged and confirmed before writing any
// code, not decided silently. Unlike src/state/appState.js (Phase 0 step 3,
// split into 3 commits), this cluster has no natural fault line to split
// across: appState's 3 sub-stages were genuinely independent state domains
// (identity/roles, core data caches, social state) with different
// dependency-resolution profiles per group. This cluster is the opposite —
// one feature, zero shared module-level state (just two static constants,
// COLLECTION_TIMES/COLLECTION_SLOTS below), and a dense internal call graph
// (renderMpUpcoming alone is called from saveOffering/saveEditOffering/
// deleteOffering/markCollected; mpItemBreakdownHTML from renderMpHistoric/
// renderMpMonth). Splitting it across partial-file commits would force
// artificial one-way-back imports in both directions simultaneously while
// mid-split — manufacturing exactly the kind of cross-file cycle this whole
// plan exists to avoid, for a fault line that doesn't actually exist in the
// finished module. Verified with the full test:e2e gate once, as one
// module, same as every other single-feature cluster moved wholesale so far
// (reviewCard.js, feed.js, people.js).
//
// Explicitly out of scope, despite living in the same original PRE-ORDER /
// RESERVATIONS section of legacy-app.js and touching the same Firestore
// collections: renderPreorderTab/openReserveModal/closeReserveModal/
// reserveOffering (the "Reserve" flow reached from a bakery profile's own
// Pre-order tab — bakery-profile-modal internals, future
// src/components/bakeryModal.js, Phase 5 step 21) and cancelReservation
// (stays in legacy-app.js per src/components/reservations.js's own Phase 3
// step 16 decision, since it depends on loadMyPreorders(), still not
// extracted). Both scope boundaries were decided at step 16, not revisited
// here.
//
// Resolves src/components/qrCode.js's own step-10 deferral: confirmCollected/
// closeQrConfirmOverlay moved into qrCode.js (not here), now that
// markCollected() has a real importable home in this file — see qrCode.js's
// own updated header comment for the full reasoning. This file exports
// markCollected specifically so qrCode.js can import it back, one-way, no
// cycle (nothing here needs anything from qrCode.js beyond a markup
// data-onclick="openQRScanner" string, resolved via the delegated-actions
// registry at click time, not an import).

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { currentUser, fb, ownsBakery } from '../state/appState.js';
import { lockScroll, unlockScroll, showToast } from '../utils/dom.js';
import { escJS } from '../utils/strings.js';

const COLLECTION_TIMES = ['7:00am','7:30am','8:00am','8:30am','9:00am','9:30am','10:00am','10:30am','11:00am','11:30am','12:00pm','12:30pm','1:00pm','2:00pm','3:00pm','4:00pm','5:00pm'];
// Legacy alias
const COLLECTION_SLOTS = COLLECTION_TIMES;

export async function openManagePreordersModal(bakeryName) {
  if (!ownsBakery(bakeryName)) return;
  const modal = document.getElementById('managePreordersModal');
  document.getElementById('managePreordersTitle').textContent = `🗓️ Pre-orders — ${bakeryName}`;
  modal.classList.add('open'); lockScroll();

  // Tab bar
  document.getElementById('managePreordersContent').innerHTML = `
    <div style="display:flex;border-bottom:1px solid var(--border);margin:-24px -24px 20px;padding:0 24px;">
      <button class="dm-stat-tab active" id="mpTab_upcoming" data-onclick="switchMpTab" data-args='${dataArgs(['upcoming', bakeryName])}'
        style="flex:1;padding:12px 4px;font-size:0.8rem;font-weight:600;border:none;background:none;cursor:pointer;color:var(--espresso);border-bottom:2px solid var(--honey);">Upcoming</button>
      <button class="dm-stat-tab" id="mpTab_week" data-onclick="switchMpTab" data-args='${dataArgs(['week', bakeryName])}'
        style="flex:1;padding:12px 4px;font-size:0.8rem;font-weight:500;border:none;background:none;cursor:pointer;color:var(--text-muted);border-bottom:2px solid transparent;">Last 7d</button>
      <button class="dm-stat-tab" id="mpTab_month" data-onclick="switchMpTab" data-args='${dataArgs(['month', bakeryName])}'
        style="flex:1;padding:12px 4px;font-size:0.8rem;font-weight:500;border:none;background:none;cursor:pointer;color:var(--text-muted);border-bottom:2px solid transparent;">Month</button>
      <button class="dm-stat-tab" id="mpTab_forecast" data-onclick="switchMpTab" data-args='${dataArgs(['forecast', bakeryName])}'
        style="flex:1;padding:12px 4px;font-size:0.8rem;font-weight:500;border:none;background:none;cursor:pointer;color:var(--text-muted);border-bottom:2px solid transparent;">✨ Forecast</button>
    </div>
    <div id="mpTabContent"><div style="text-align:center;padding:32px;"><div class="spinner" style="margin:0 auto;"></div></div></div>`;

  await renderMpTab('upcoming', bakeryName);
}

export function switchMpTab(tab, bakeryName) {
  document.querySelectorAll('[id^="mpTab_"]').forEach(btn => {
    const isActive = btn.id === `mpTab_${tab}`;
    btn.classList.toggle('active', isActive);
    btn.style.fontWeight = isActive ? '600' : '500';
    btn.style.color = isActive ? 'var(--espresso)' : 'var(--text-muted)';
    btn.style.borderBottom = isActive ? '2px solid var(--honey)' : '2px solid transparent';
  });
  const content = document.getElementById('mpTabContent');
  if (content) content.innerHTML = '<div style="text-align:center;padding:32px;"><div class="spinner" style="margin:0 auto;"></div></div>';
  renderMpTab(tab, bakeryName);
}

export async function renderMpTab(tab, bakeryName) {
  const content = document.getElementById('mpTabContent');
  if (!content || !fb) return;
  const { db, collection, query, where, getDocs } = fb;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  try {
    if (tab === 'upcoming') {
      await renderMpUpcoming(content, bakeryName);
    } else if (tab === 'week') {
      await renderMpHistoric(content, bakeryName, 7);
    } else if (tab === 'month') {
      await renderMpMonth(content, bakeryName);
    } else if (tab === 'forecast') {
      await renderMpForecast(content, bakeryName);
    }
  } catch(e) {
    content.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Could not load data.</div>';
    console.error(e);
  }
}

export function closeManagePreordersModal() {
  document.getElementById('managePreordersModal').classList.remove('open');
  unlockScroll();
}

export async function renderMpUpcoming(panel, bakeryName) {
  if (!panel) panel = document.getElementById('mpTabContent');
  const { db, collection, query, where, getDocs } = fb;
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const [offeringsSnap, reservationsSnap] = await Promise.all([
      getDocs(query(collection(db, 'preorderOfferings'),
        where('bakeryName','==',bakeryName), where('active','==',true))),
      getDocs(query(collection(db, 'reservations'), where('bakeryName','==',bakeryName)))
    ]);

    const allOfferings = offeringsSnap.docs.map(d => ({id: d.id, ...d.data()}))
      .filter(o => o.collectDate >= todayStr)
      .sort((a,b) => a.collectDate.localeCompare(b.collectDate));
    const allReservations = reservationsSnap.docs.map(d => ({id: d.id, ...d.data()}));

    const byDate = {};
    allOfferings.forEach(o => {
      if (!byDate[o.collectDate]) byDate[o.collectDate] = [];
      byDate[o.collectDate].push(o);
    });

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-size:0.85rem;font-weight:600;color:var(--espresso);">Pre-order offerings</div>
        <div style="display:flex;gap:8px;">
          <button class="btn-caramel" style="font-size:0.78rem;padding:7px 14px;" data-onclick="openQRScanner" data-args='${dataArgs([bakeryName])}'>📷 Scan QR</button>
          <button class="btn-ghost" style="font-size:0.78rem;padding:7px 14px;" data-onclick="openCatalogueManager" data-args='${dataArgs([bakeryName])}'>📋 Catalogue</button>
          <button class="btn-espresso" style="font-size:0.78rem;padding:7px 14px;" data-onclick="showAddOfferingForm" data-args='${dataArgs([bakeryName])}'>+ Add item</button>
        </div>
      </div>
      <div id="addOfferingForm" style="display:none;background:var(--parchment);border-radius:var(--radius-sm);padding:16px;margin-bottom:16px;"></div>
      ${!allOfferings.length ? `<div class="empty-state" style="padding:20px 0;"><div class="empty-state-icon">🥐</div><div class="empty-state-title">No upcoming offerings</div><div class="empty-state-text">Add items for customers to pre-order. They go live at 8am the day before.</div></div>`
      : Object.entries(byDate).map(([date, offerings]) => {
        const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'});
        const goLive = new Date(date + 'T00:00:00');
        goLive.setDate(goLive.getDate() - 1); goLive.setHours(8,0,0,0);
        const isLive = now >= goLive;
        const reservationsForDate = allReservations.filter(r => r.collectDate === date && r.status !== 'cancelled');
        return `<div style="margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="font-size:0.85rem;font-weight:700;color:var(--espresso);">${dateLabel}</div>
            <span style="font-size:0.65rem;font-weight:600;padding:2px 8px;border-radius:100px;${isLive ? 'background:#d4edda;color:#155724;' : 'background:#fff3cd;color:#856404;'}">${isLive ? '🟢 Live now' : `⏰ Live ${goLive.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} 8am`}</span>
          </div>
          ${offerings.map(o => {
            const reserved = reservationsForDate.filter(r => r.offeringId === o.id).length;
            const remaining = o.remaining ?? o.quantity ?? 0;
            return `<div id="offeringrow_${o.id}" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-bottom:6px;background:var(--cream-white);display:flex;gap:10px;align-items:center;">
              ${o.photoURL ? `<img src="${o.photoURL}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;">` : `<div style="width:40px;height:40px;border-radius:6px;background:var(--parchment-dark);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">🥐</div>`}
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:0.85rem;color:var(--espresso);">${o.name}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">${o.slot} · £${parseFloat(o.price||0).toFixed(2)} · ${remaining} left · ${reserved} reserved</div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <button data-onclick="openEditOffering" data-args='${dataArgs([o.id, bakeryName])}' style="background:none;border:none;color:var(--caramel);font-size:0.8rem;cursor:pointer;">✏️</button>
                <button data-onclick="deleteOffering" data-args='${dataArgs([o.id, bakeryName])}' style="background:none;border:none;color:#e74c3c;font-size:0.8rem;cursor:pointer;">✕</button>
              </div>
            </div>`;
          }).join('')}
          ${reservationsForDate.length ? `
            <div style="font-size:0.75rem;font-weight:600;color:var(--espresso);margin:10px 0 6px;">📋 Reservations (${reservationsForDate.length})</div>
            ${reservationsForDate.map(r => `
              <div class="manage-res-card${r.status === 'collected' ? ' collected' : ''}" id="rescard_${r.id}">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:0.82rem;font-weight:600;color:var(--espresso);">${r.userName || 'Customer'}</div>
                  <div style="font-size:0.7rem;color:var(--text-muted);">${r.offeringName} · ${r.slot} · #${r.id.slice(-6).toUpperCase()}</div>
                </div>
                ${r.status === 'collected'
                  ? `<span style="font-size:0.68rem;font-weight:700;color:#155724;background:#d4edda;padding:3px 8px;border-radius:100px;">✓ Collected</span>`
                  : `<button class="btn-espresso" style="font-size:0.72rem;padding:5px 10px;" data-onclick="markCollected" data-args='${dataArgs([r.id, bakeryName])}'>Collected</button>`}
              </div>`).join('')}` : ''}
        </div>`;
      }).join('')}`;
  } catch(e) {
    panel.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Could not load pre-orders.</div>';
    console.error(e);
  }
}

export async function renderMpHistoric(panel, bakeryName, days) {
  if (!panel) panel = document.getElementById('mpTabContent');
  const { db, collection, query, where, getDocs } = fb;
  const now = new Date();
  const cutoffDate = new Date(now); cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  // Include today AND the next few days (orders placed now for upcoming collection)
  const upperDate = new Date(now); upperDate.setDate(upperDate.getDate() + days);
  const upperStr = upperDate.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  const snap = await getDocs(query(collection(db, 'reservations'),
    where('bakeryName','==',bakeryName)));
  const reservations = snap.docs.map(d => ({id:d.id,...d.data()}))
    .filter(r => r.collectDate >= cutoffStr && r.collectDate <= upperStr && r.status !== 'cancelled')
    .sort((a,b) => b.collectDate.localeCompare(a.collectDate));

  if (!reservations.length) {
    panel.innerHTML = `<div class="empty-state" style="padding:24px 0;">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-title">No orders in the last or next ${days} days</div>
    </div>`;
    return;
  }

  // Summary stats
  const totalRevenue = reservations.reduce((s,r) => s + (r.totalPrice || r.price || 0), 0);
  const totalItems = reservations.reduce((s,r) => s + (r.quantity || 1), 0);
  const collectedOrders = reservations.filter(r => r.status === 'collected');
  const pendingOrders = reservations.filter(r => r.status !== 'collected');
  const collected = collectedOrders.length;
  const pending = pendingOrders.length;
  const collectedRevenue = collectedOrders.reduce((s,r) => s + (r.totalPrice || r.price || 0), 0);
  const pendingRevenue = pendingOrders.reduce((s,r) => s + (r.totalPrice || r.price || 0), 0);
  const collectedItems = collectedOrders.reduce((s,r) => s + (r.quantity || 1), 0);
  const pendingItems = pendingOrders.reduce((s,r) => s + (r.quantity || 1), 0);

  // Group by date
  const byDate = {};
  reservations.forEach(r => {
    if (!byDate[r.collectDate]) byDate[r.collectDate] = [];
    byDate[r.collectDate].push(r);
  });

  panel.innerHTML = `
    <!-- Summary strip — top level -->
    <div style="background:var(--espresso);border-radius:var(--radius-sm);padding:14px;margin-bottom:10px;text-align:center;">
      <div style="font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:var(--honey);">£${totalRevenue.toFixed(2)}</div>
      <div style="font-size:0.65rem;color:var(--honey-light);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Total revenue · ${totalItems} item${totalItems!==1?'s':''} · ${reservations.length} order${reservations.length!==1?'s':''}</div>
    </div>

    <!-- Collected vs Pending breakdown -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <div style="border:2px solid #d4edda;border-radius:var(--radius-sm);padding:12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="font-size:0.7rem;font-weight:700;color:#155724;background:#d4edda;padding:2px 8px;border-radius:100px;">✓ Collected</span>
        </div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:var(--espresso);">${collected}</div>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:1px;">${collectedItems} item${collectedItems!==1?'s':''}</div>
        <div style="font-size:0.85rem;font-weight:700;color:#155724;margin-top:4px;">£${collectedRevenue.toFixed(2)}</div>
      </div>
      <div style="border:2px solid #fff3cd;border-radius:var(--radius-sm);padding:12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="font-size:0.7rem;font-weight:700;color:#856404;background:#fff3cd;padding:2px 8px;border-radius:100px;">⏳ Pending</span>
        </div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:var(--espresso);">${pending}</div>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:1px;">${pendingItems} item${pendingItems!==1?'s':''}</div>
        <div style="font-size:0.85rem;font-weight:700;color:#856404;margin-top:4px;">£${pendingRevenue.toFixed(2)}</div>
      </div>
    </div>

    <!-- Collection rate bar -->
    ${reservations.length > 0 ? `
    <div style="background:var(--parchment);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <div style="font-size:0.72rem;font-weight:600;color:var(--espresso);">Collection rate</div>
        <div style="font-size:0.72rem;font-weight:700;color:var(--espresso);">${Math.round((collected/reservations.length)*100)}%</div>
      </div>
      <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${Math.round((collected/reservations.length)*100)}%;background:#27ae60;border-radius:4px;transition:width 0.5s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;">
        <div style="font-size:0.62rem;color:#155724;">✓ ${collected} collected</div>
        <div style="font-size:0.62rem;color:#856404;">${pending} not yet collected</div>
      </div>
    </div>` : ''}

    <!-- Item breakdown -->
    ${mpItemBreakdownHTML(reservations, totalRevenue)}

    <!-- Orders by date -->
    <div style="font-size:0.78rem;font-weight:700;color:var(--espresso);margin:20px 0 10px;">Orders by date</div>
    ${Object.entries(byDate).map(([date, orders]) => {
      const dateLabel = new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});
      const dayRevenue = orders.reduce((s,r) => s + (r.totalPrice||r.price||0), 0);
      const dayCollected = orders.filter(r => r.status==='collected').length;
      const isFuture = date > todayStr;
      const isToday = date === todayStr;
      return `
        <div style="margin-bottom:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="font-size:0.82rem;font-weight:700;color:var(--espresso);">${dateLabel}</div>
              ${isToday ? `<span style="font-size:0.62rem;font-weight:700;background:var(--honey);color:var(--espresso);padding:2px 7px;border-radius:100px;">Today</span>` : isFuture ? `<span style="font-size:0.62rem;font-weight:700;background:#d4edda;color:#155724;padding:2px 7px;border-radius:100px;">Upcoming</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:0.68rem;color:var(--text-muted);">${dayCollected}/${orders.length} collected</span>
              <span style="font-size:0.82rem;font-weight:700;color:var(--caramel);">£${dayRevenue.toFixed(2)}</span>
            </div>
          </div>
          ${orders.map(r => `
            <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">
              <div style="flex:1;min-width:0;">
                <div style="font-size:0.82rem;font-weight:600;color:var(--espresso);">${r.offeringName}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">${r.userName||'Customer'} · ${r.slot} · ${r.quantity>1?`${r.quantity}× `:''}#${r.id.slice(-6).toUpperCase()}</div>
              </div>
              <div style="text-align:right;flex-shrink:0;">
                <div style="font-size:0.82rem;font-weight:700;color:var(--caramel);">£${parseFloat(r.totalPrice||r.price||0).toFixed(2)}</div>
                <div style="font-size:0.65rem;${r.status==='collected'?'color:#155724;background:#d4edda;':'color:#856404;background:#fff3cd;'}padding:1px 6px;border-radius:100px;display:inline-block;margin-top:2px;">${r.status==='collected'?'✓ Collected':'Pending'}</div>
              </div>
            </div>`).join('')}
        </div>`;
    }).join('')}`;
}

export async function renderMpMonth(panel, bakeryName) {
  if (!panel) panel = document.getElementById('mpTabContent');
  const { db, collection, query, where, getDocs } = fb;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstStr = firstDay.toISOString().split('T')[0];
  const lastStr = lastDay.toISOString().split('T')[0];
  const monthName = firstDay.toLocaleDateString('en-GB',{month:'long',year:'numeric'});

  const snap = await getDocs(query(collection(db, 'reservations'),
    where('bakeryName','==',bakeryName)));
  const reservations = snap.docs.map(d => ({id:d.id,...d.data()}))
    .filter(r => r.collectDate >= firstStr && r.collectDate <= lastStr && r.status !== 'cancelled');

  // Build date map
  const dateMap = {};
  reservations.forEach(r => {
    if (!dateMap[r.collectDate]) dateMap[r.collectDate] = { count:0, revenue:0, items:[] };
    dateMap[r.collectDate].count++;
    dateMap[r.collectDate].revenue += r.totalPrice || r.price || 0;
    dateMap[r.collectDate].items.push(r);
  });

  // Month totals
  const totalRevenue = reservations.reduce((s,r) => s + (r.totalPrice||r.price||0), 0);
  const totalOrders = reservations.length;
  const totalItems = reservations.reduce((s,r) => s + (r.quantity||1), 0);
  const collectedMo = reservations.filter(r => r.status === 'collected');
  const pendingMo = reservations.filter(r => r.status !== 'collected');
  const collectedRevMo = collectedMo.reduce((s,r) => s + (r.totalPrice||r.price||0), 0);
  const pendingRevMo = pendingMo.reduce((s,r) => s + (r.totalPrice||r.price||0), 0);

  // Calendar grid
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();
  const dayLabels = ['S','M','T','W','T','F','S'];
  const maxRevDay = Math.max(...Object.values(dateMap).map(d => d.revenue), 1);

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const data = dateMap[dateStr];
    const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
    const intensity = data ? Math.max(0.15, data.revenue / maxRevDay) : 0;
    cells += `<div class="mp-cal-day" data-date="${dateStr}" ${data ? `data-onclick="showMpDayDetail" data-args='${dataArgs([dateStr, bakeryName])}'` : ''}
      style="aspect-ratio:1;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:${data?'pointer':'default'};
        background:${data ? `rgba(44,24,16,${intensity})` : 'transparent'};
        border:${isToday?'2px solid var(--honey)':'1px solid transparent'};
        transition:transform 0.1s;" ${data?'onmouseover="this.style.transform=\'scale(1.08)\'"onmouseout="this.style.transform=\'scale(1)\'"':''}>
      <div style="font-size:0.72rem;font-weight:${data?'700':'400'};color:${data?'var(--cream-white)':'var(--text-muted)'};">${d}</div>
      ${data ? `<div style="font-size:0.52rem;color:var(--honey);font-weight:600;margin-top:1px;">£${data.revenue.toFixed(0)}</div>` : ''}
    </div>`;
  }

  panel.innerHTML = `
    <!-- Month summary -->
    <div style="font-size:0.82rem;font-weight:700;color:var(--espresso);margin-bottom:12px;">${monthName}</div>
    <div style="background:var(--espresso);border-radius:var(--radius-sm);padding:14px;margin-bottom:10px;text-align:center;">
      <div style="font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:var(--honey);">£${totalRevenue.toFixed(2)}</div>
      <div style="font-size:0.65rem;color:var(--honey-light);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Total revenue · ${totalItems} items · ${totalOrders} orders</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <div style="border:2px solid #d4edda;border-radius:var(--radius-sm);padding:12px;">
        <div style="margin-bottom:6px;"><span style="font-size:0.7rem;font-weight:700;color:#155724;background:#d4edda;padding:2px 8px;border-radius:100px;">✓ Collected</span></div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:var(--espresso);">${collectedMo.length}</div>
        <div style="font-size:0.72rem;color:var(--text-muted);">${collectedMo.reduce((s,r)=>s+(r.quantity||1),0)} items</div>
        <div style="font-size:0.85rem;font-weight:700;color:#155724;margin-top:4px;">£${collectedRevMo.toFixed(2)}</div>
      </div>
      <div style="border:2px solid #fff3cd;border-radius:var(--radius-sm);padding:12px;">
        <div style="margin-bottom:6px;"><span style="font-size:0.7rem;font-weight:700;color:#856404;background:#fff3cd;padding:2px 8px;border-radius:100px;">⏳ Pending</span></div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:var(--espresso);">${pendingMo.length}</div>
        <div style="font-size:0.72rem;color:var(--text-muted);">${pendingMo.reduce((s,r)=>s+(r.quantity||1),0)} items</div>
        <div style="font-size:0.85rem;font-weight:700;color:#856404;margin-top:4px;">£${pendingRevMo.toFixed(2)}</div>
      </div>
    </div>
    ${totalOrders > 0 ? `
    <div style="background:var(--parchment);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <div style="font-size:0.72rem;font-weight:600;color:var(--espresso);">Collection rate</div>
        <div style="font-size:0.72rem;font-weight:700;color:var(--espresso);">${Math.round((collectedMo.length/totalOrders)*100)}%</div>
      </div>
      <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${Math.round((collectedMo.length/totalOrders)*100)}%;background:#27ae60;border-radius:4px;"></div>
      </div>
    </div>` : ''}

    <!-- Item breakdown -->
    ${mpItemBreakdownHTML(reservations, totalRevenue)}

    <!-- Calendar heatmap -->
    <div style="font-size:0.78rem;font-weight:700;color:var(--espresso);margin:20px 0 10px;">Revenue calendar</div>
    <div id="mpMonthCalendar" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px;">
      ${dayLabels.map(l=>`<div style="text-align:center;font-size:0.62rem;font-weight:600;color:var(--text-muted);padding-bottom:4px;">${l}</div>`).join('')}
      ${cells}
    </div>
    <div style="font-size:0.68rem;color:var(--text-muted);margin-top:8px;">Tap a day to see its orders. Darker = more revenue.</div>`;
}

export async function renderMpForecast(panel, bakeryName) {
  if (!panel) panel = document.getElementById('mpTabContent');
  const { db, collection, query, where, getDocs } = fb;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Pull 90 days of history for pattern analysis
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const snap = await getDocs(query(collection(db, 'reservations'), where('bakeryName','==',bakeryName)));
  const history = snap.docs.map(d => ({id:d.id,...d.data()}))
    .filter(r => r.collectDate >= cutoffStr && r.collectDate <= todayStr && r.status !== 'cancelled');

  const hasHistory = history.length > 0;

  // ── Day-of-week patterns (0=Sun…6=Sat) per item ──────────────────────────
  // dowData[itemName][dow] = { totalQty, totalRevenue, occurrences }
  const dowData = {};
  const dowTotals = Array(7).fill(0).map(() => ({ qty: 0, revenue: 0, count: 0 }));

  history.forEach(r => {
    // Use collectDate as the demand signal
    const dow = new Date(r.collectDate + 'T12:00:00').getDay();
    const item = r.offeringName || 'Other';
    const qty = r.quantity || 1;
    const rev = r.totalPrice || r.price || 0;

    if (!dowData[item]) dowData[item] = Array(7).fill(null).map(() => ({ qty: 0, revenue: 0, weeks: 0 }));
    dowData[item][dow].qty += qty;
    dowData[item][dow].revenue += rev;
    dowData[item][dow].weeks++;

    dowTotals[dow].qty += qty;
    dowTotals[dow].revenue += rev;
    dowTotals[dow].count++;
  });

  // How many of each weekday appeared in the history window (to normalise)
  const dowWeekCounts = Array(7).fill(0);
  for (let d = 0; d < 90; d++) {
    const date = new Date(cutoff); date.setDate(date.getDate() + d);
    dowWeekCounts[date.getDay()]++;
  }

  // Average per weekday across history
  const dowAvgQty = dowTotals.map((t, i) => dowWeekCounts[i] > 0 ? t.qty / dowWeekCounts[i] : 0);
  const dowAvgRev = dowTotals.map((t, i) => dowWeekCounts[i] > 0 ? t.revenue / dowWeekCounts[i] : 0);

  // Per-item averages by day-of-week
  const itemDowAvg = {};
  Object.entries(dowData).forEach(([item, days]) => {
    itemDowAvg[item] = days.map((d, i) => ({
      avgQty: dowWeekCounts[i] > 0 ? d.qty / dowWeekCounts[i] : 0,
      avgRev: dowWeekCounts[i] > 0 ? d.revenue / dowWeekCounts[i] : 0
    }));
  });

  // ── Build 28-day forecast ─────────────────────────────────────────────────
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const forecastDays = [];
  for (let d = 1; d <= 28; d++) {
    const date = new Date(now); date.setDate(date.getDate() + d);
    const dow = date.getDay();
    const dateStr = date.toISOString().split('T')[0];
    const dateLabel = date.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'});
    forecastDays.push({
      date: dateStr, label: dateLabel, dow,
      dayName: DAY_NAMES[dow],
      projQty: hasHistory ? dowAvgQty[dow] : 0,
      projRev: hasHistory ? dowAvgRev[dow] : 0,
      isWeekend: dow === 0 || dow === 6
    });
  }

  const weeklyProjRev = forecastDays.slice(0,7).reduce((s,d) => s + d.projRev, 0);
  const monthlyProjRev = forecastDays.reduce((s,d) => s + d.projRev, 0);
  const weeklyProjQty = Math.round(forecastDays.slice(0,7).reduce((s,d) => s + d.projQty, 0));
  const monthlyProjQty = Math.round(forecastDays.reduce((s,d) => s + d.projQty, 0));

  // Peak day of week from history
  const peakDow = dowAvgQty.indexOf(Math.max(...dowAvgQty));
  const peakDay = DAY_NAMES[peakDow];
  const quietDow = dowAvgQty.indexOf(Math.min(...dowAvgQty.filter(v => v > 0)));
  const quietDay = hasHistory && quietDow >= 0 ? DAY_NAMES[quietDow] : null;

  // ── Item-level forecast (next 28 days) ────────────────────────────────────
  const itemForecasts = Object.entries(itemDowAvg).map(([item, days]) => {
    const proj28Qty = Math.round(days.reduce((s, d, i) => {
      // Sum projected qty across all 28 days
      const daysOfWeekInPeriod = forecastDays.filter(fd => fd.dow === i).length;
      return s + d.avgQty * daysOfWeekInPeriod;
    }, 0));
    const proj28Rev = days.reduce((s, d, i) => {
      const daysOfWeekInPeriod = forecastDays.filter(fd => fd.dow === i).length;
      return s + d.avgRev * daysOfWeekInPeriod;
    }, 0);
    const bestDow = days.indexOf(days.reduce((best, d, i) => d.avgQty > best.avgQty ? d : best, {avgQty:-1}));
    return { item, proj28Qty, proj28Rev, bestDay: DAY_NAMES[bestDow] };
  }).sort((a,b) => b.proj28Qty - a.proj28Qty);

  // Max for bar scaling
  const maxProjQty = Math.max(...forecastDays.map(d => d.projQty), 1);

  panel.innerHTML = `
    <!-- Disclaimer -->
    <div style="background:#fff3cd;border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:16px;display:flex;gap:8px;align-items:flex-start;">
      <span style="flex-shrink:0;">✨</span>
      <div style="font-size:0.72rem;color:#856404;line-height:1.5;">
        <strong>Forecast based on ${history.length} past order${history.length!==1?'s':''}</strong>${hasHistory?` from the last 90 days. Predictions improve with more data.`:' — predictions will improve as orders come in.'} These are estimates, not guarantees.
      </div>
    </div>

    ${!hasHistory ? `<div class="empty-state" style="padding:24px 0;">
      <div class="empty-state-icon">📊</div>
      <div class="empty-state-title">Not enough data yet</div>
      <div class="empty-state-text">Once you have some completed orders, forecasts will appear here based on your day-of-week patterns.</div>
    </div>` : `

    <!-- Projection summary -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:20px;">
      <div style="background:var(--espresso);border-radius:var(--radius-sm);padding:12px;text-align:center;">
        <div style="font-size:0.6rem;color:var(--honey-light);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Next 7 days</div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:var(--honey);">£${weeklyProjRev.toFixed(0)}</div>
        <div style="font-size:0.7rem;color:var(--honey-light);margin-top:2px;">~${weeklyProjQty} items</div>
      </div>
      <div style="background:var(--espresso);border-radius:var(--radius-sm);padding:12px;text-align:center;">
        <div style="font-size:0.6rem;color:var(--honey-light);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Next 28 days</div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:var(--honey);">£${monthlyProjRev.toFixed(0)}</div>
        <div style="font-size:0.7rem;color:var(--honey-light);margin-top:2px;">~${monthlyProjQty} items</div>
      </div>
    </div>

    <!-- Day-of-week insights -->
    <div style="background:var(--parchment);border-radius:var(--radius-sm);padding:14px;margin-bottom:16px;">
      <div style="font-size:0.78rem;font-weight:700;color:var(--espresso);margin-bottom:12px;">📅 Day of week patterns</div>
      ${DAY_NAMES.map((day, dow) => {
        const avg = dowAvgQty[dow];
        if (avg === 0 && dowWeekCounts[dow] === 0) return '';
        const barW = Math.round((avg / Math.max(...dowAvgQty, 1)) * 100);
        const isPeak = dow === peakDow;
        return `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:30px;font-size:0.72rem;font-weight:${isPeak?'700':'400'};color:${isPeak?'var(--espresso)':'var(--text-muted)'};flex-shrink:0;">${day}</div>
            <div style="flex:1;height:20px;background:var(--border);border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${barW}%;background:${isPeak?'var(--caramel)':'var(--honey)'};border-radius:4px;display:flex;align-items:center;padding-left:${barW>15?'8px':'0'};transition:width 0.5s;">
                ${barW > 20 ? `<span style="font-size:0.6rem;color:white;font-weight:600;">${avg.toFixed(1)}</span>` : ''}
              </div>
            </div>
            <div style="width:36px;text-align:right;font-size:0.72rem;font-weight:600;color:var(--espresso);flex-shrink:0;">${avg.toFixed(1)}</div>
            ${isPeak ? `<span style="font-size:0.65rem;background:#d4edda;color:#155724;padding:2px 6px;border-radius:100px;flex-shrink:0;">Peak</span>` : ''}
            ${dow === quietDow ? `<span style="font-size:0.65rem;background:var(--parchment-dark);color:var(--text-muted);padding:2px 6px;border-radius:100px;flex-shrink:0;">Quiet</span>` : ''}
          </div>`;
      }).join('')}
      <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Average items per day based on history</div>
    </div>

    <!-- Per-item 28-day forecast -->
    <div style="background:var(--parchment);border-radius:var(--radius-sm);padding:14px;margin-bottom:16px;">
      <div style="font-size:0.78rem;font-weight:700;color:var(--espresso);margin-bottom:12px;">🥐 Item forecasts (next 28 days)</div>
      ${itemForecasts.length ? `
        <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:0;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:6px;">
          <div style="font-size:0.62rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;">Item</div>
          <div style="font-size:0.62rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;text-align:right;padding-right:10px;">Est. qty</div>
          <div style="font-size:0.62rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;text-align:right;padding-right:10px;">Est. rev</div>
          <div style="font-size:0.62rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;text-align:right;">Best day</div>
        </div>
        ${itemForecasts.map((f,i) => `
          <div style="display:grid;grid-template-columns:1fr auto auto auto;align-items:center;gap:0;padding:8px 0;border-bottom:${i<itemForecasts.length-1?'1px solid var(--border)':'none'};">
            <div style="font-size:0.82rem;font-weight:600;color:var(--espresso);padding-right:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':''}${f.item}</div>
            <div style="font-size:0.82rem;font-weight:700;color:var(--espresso);text-align:right;padding-right:10px;">~${f.proj28Qty}</div>
            <div style="font-size:0.82rem;font-weight:700;color:var(--caramel);text-align:right;padding-right:10px;">£${f.proj28Rev.toFixed(0)}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);text-align:right;background:var(--parchment-dark);padding:2px 7px;border-radius:100px;white-space:nowrap;">${f.bestDay}</div>
          </div>`).join('')}` : '<div style="font-size:0.82rem;color:var(--text-muted);">No item data yet</div>'}
    </div>

    <!-- 28-day daily bar chart -->
    <div style="background:var(--parchment);border-radius:var(--radius-sm);padding:14px;">
      <div style="font-size:0.78rem;font-weight:700;color:var(--espresso);margin-bottom:12px;">📊 Projected demand — next 28 days</div>
      <div style="display:flex;align-items:flex-end;gap:3px;height:80px;margin-bottom:6px;">
        ${forecastDays.map(d => {
          const h = maxProjQty > 0 ? Math.max(4, Math.round((d.projQty / maxProjQty) * 72)) : 4;
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;" title="${d.label}: ~${d.projQty.toFixed(1)} items">
            <div style="width:100%;background:${d.isWeekend?'var(--caramel)':'var(--honey)'};border-radius:2px 2px 0 0;height:${h}px;opacity:0.85;"></div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:3px;">
        ${forecastDays.map((d, i) => `<div style="flex:1;text-align:center;font-size:0.5rem;color:${d.isWeekend?'var(--caramel)':'var(--text-muted)'};font-weight:${d.isWeekend?'700':'400'};overflow:hidden;">${i%4===0?d.dayName.charAt(0):''}</div>`).join('')}
      </div>
      <div style="display:flex;gap:12px;margin-top:8px;">
        <div style="display:flex;align-items:center;gap:5px;font-size:0.66rem;color:var(--text-muted);">
          <div style="width:10px;height:10px;background:var(--honey);border-radius:2px;"></div>Weekday
        </div>
        <div style="display:flex;align-items:center;gap:5px;font-size:0.66rem;color:var(--text-muted);">
          <div style="width:10px;height:10px;background:var(--caramel);border-radius:2px;"></div>Weekend
        </div>
      </div>
    </div>`}`;
}

export function mpItemBreakdownHTML(reservations, totalRevenue) {
  if (!reservations.length) return '';

  // Aggregate by item name
  const itemMap = {};
  reservations.forEach(r => {
    const name = r.offeringName || 'Unknown';
    if (!itemMap[name]) itemMap[name] = { qty: 0, revenue: 0, orders: 0, unitPrice: r.price || 0 };
    itemMap[name].qty += r.quantity || 1;
    itemMap[name].revenue += r.totalPrice || r.price || 0;
    itemMap[name].orders++;
  });

  const rows = Object.entries(itemMap)
    .sort((a, b) => b[1].qty - a[1].qty);

  const maxQty = Math.max(...rows.map(([,d]) => d.qty), 1);

  return `
    <div style="background:var(--parchment);border-radius:var(--radius-sm);padding:14px;margin-bottom:4px;">
      <div style="font-size:0.78rem;font-weight:700;color:var(--espresso);margin-bottom:12px;">🏆 Item breakdown</div>
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:0;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:6px;">
        <div style="font-size:0.65rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Item</div>
        <div style="font-size:0.65rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;text-align:right;padding-right:14px;">Qty</div>
        <div style="font-size:0.65rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Revenue</div>
      </div>
      ${rows.map(([name, d], i) => {
        const barWidth = Math.round((d.qty / maxQty) * 100);
        const pct = totalRevenue > 0 ? Math.round((d.revenue / totalRevenue) * 100) : 0;
        return `
          <div style="padding:8px 0;border-bottom:${i < rows.length-1 ? '1px solid var(--border)' : 'none'};">
            <div style="display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:0;margin-bottom:5px;">
              <div style="font-size:0.82rem;font-weight:600;color:var(--espresso);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:10px;">${i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':''}${name}</div>
              <div style="font-size:0.82rem;font-weight:700;color:var(--espresso);text-align:right;padding-right:14px;">${d.qty}</div>
              <div style="font-size:0.82rem;font-weight:700;color:var(--caramel);text-align:right;">£${d.revenue.toFixed(2)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
                <div style="height:100%;width:${barWidth}%;background:var(--caramel);border-radius:2px;transition:width 0.4s;"></div>
              </div>
              <div style="font-size:0.65rem;color:var(--text-muted);flex-shrink:0;">${pct}% of revenue</div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

export function showMpDayDetail(dateStr, bakeryName) {
  // Build reservation list for this day
  const { db, collection, query, where, getDocs } = fb;
  const dateLabel = new Date(dateStr+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});

  getDocs(query(collection(db, 'reservations'),
    where('bakeryName','==',bakeryName), where('collectDate','==',dateStr)))
    .then(snap => {
      const orders = snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.status!=='cancelled');
      const revenue = orders.reduce((s,r)=>s+(r.totalPrice||r.price||0),0);

      const overlay = document.createElement('div');
      overlay.id = 'mpDayDetailOverlay';
      overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:flex-end;justify-content:center;';
      overlay.innerHTML=`
        <div style="background:var(--cream-white);border-radius:var(--radius) var(--radius) 0 0;width:100%;max-width:520px;max-height:70vh;overflow-y:auto;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--cream-white);">
            <div>
              <div style="font-family:'Playfair Display',serif;font-size:0.95rem;font-weight:700;color:var(--espresso);">${dateLabel}</div>
              <div style="font-size:0.75rem;color:var(--caramel);font-weight:600;margin-top:2px;">${orders.length} order${orders.length!==1?'s':''} · £${revenue.toFixed(2)} total</div>
            </div>
            <button data-onclick="closeMpDayDetail" style="background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text-muted);">✕</button>
          </div>
          <div style="padding:16px 20px 32px;">
            ${!orders.length?'<div style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:20px 0;">No orders this day</div>':
              orders.map(r=>`
                <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:0.85rem;font-weight:600;color:var(--espresso);">${r.offeringName}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted);">${r.userName||'Customer'} · ${r.slot}${r.quantity>1?` · ${r.quantity}×`:''} · #${r.id.slice(-6).toUpperCase()}</div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:0.85rem;font-weight:700;color:var(--caramel);">£${parseFloat(r.totalPrice||r.price||0).toFixed(2)}</div>
                    <span style="font-size:0.62rem;padding:2px 7px;border-radius:100px;${r.status==='collected'?'background:#d4edda;color:#155724;':'background:#fff3cd;color:#856404;'}">${r.status==='collected'?'✓ Collected':'Pending'}</span>
                  </div>
                </div>`).join('')}
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
    });
}

export function closeMpDayDetail() {
  document.getElementById('mpDayDetailOverlay')?.remove();
}

export async function uploadItemPhoto(file) {
  const { storage, ref, uploadBytes, getDownloadURL } = fb;
  const ext = file.name.split('.').pop() || 'jpg';
  const storageRef = ref(storage, `offerings/${currentUser.uid}_${Date.now()}.${ext}`);
  const snap = await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  return await getDownloadURL(snap.ref);
}

export async function openEditOffering(offeringId, bakeryName) {
  if (!fb) return;
  const { db, doc, getDoc } = fb;
  const snap = await getDoc(doc(db, 'preorderOfferings', offeringId));
  if (!snap.exists()) { showToast('Offering not found'); return; }
  const o = snap.data();

  const slotIsRange = o.slot?.includes('–');
  const slotIsBy = o.slot?.startsWith('Collect by');

  const overlay = document.createElement('div');
  overlay.id = 'editOfferingOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:flex-end;justify-content:center;';

  const slotFromVal = slotIsRange ? o.slot.split('–')[0].trim() : (slotIsBy ? '' : o.slot || '');
  const slotToVal = slotIsRange ? o.slot.split('–')[1]?.trim() : '';
  const slotByVal = slotIsBy ? o.slot.replace('Collect by ', '').trim() : '';

  const timeOpts = COLLECTION_TIMES.map(t => `<option value="${t}">${t}</option>`).join('');

  overlay.innerHTML = `
    <div style="background:var(--cream-white);border-radius:var(--radius) var(--radius) 0 0;width:100%;max-width:560px;max-height:82vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--cream-white);z-index:1;">
        <div style="font-family:'Playfair Display',serif;font-size:1rem;font-weight:700;color:var(--espresso);">✏️ Edit offering</div>
        <button data-onclick="closeEditOfferingOverlay" style="background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text-muted);">✕</button>
      </div>
      <div style="padding:16px 20px 32px;display:flex;flex-direction:column;gap:14px;">
        <div class="form-group" style="margin:0;"><label class="form-label">Item name</label>
          <input type="text" class="form-input" id="editOfferingName" value="${escJS(o.name||'')}"></div>
        <div class="form-group" style="margin:0;"><label class="form-label">Description</label>
          <textarea class="form-textarea" id="editOfferingDesc" style="min-height:60px;">${o.description||''}</textarea></div>
        <div class="form-group" style="margin:0;"><label class="form-label">Price (£)</label>
          <input type="number" class="form-input" id="editOfferingPrice" value="${o.price||''}" step="0.01" min="0"></div>
        <div class="form-group" style="margin:0;"><label class="form-label">Quantity available</label>
          <input type="number" class="form-input" id="editOfferingQty" value="${o.quantity||''}" min="1" step="1">
          <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Currently ${o.remaining??o.quantity??0} remaining of ${o.quantity??0} — adjusting quantity won't restore already-reserved slots</div>
        </div>
        <div class="form-group" style="margin:0;"><label class="form-label">Max per person</label>
          <input type="number" class="form-input" id="editOfferingMaxPerPerson" value="${o.maxPerPerson||2}" min="1" step="1">
          <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Maximum a single customer can reserve</div>
        </div>
        <div class="form-group" style="margin:0;"><label class="form-label">Collection window</label>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <button type="button" id="editSlotModeRange" class="bakery-view-btn ${!slotIsBy?'active':''}" style="flex:1;border-radius:8px;" data-onclick="setEditSlotMode" data-args='${dataArgs(['range'])}'>Time range</button>
            <button type="button" id="editSlotModeBy" class="bakery-view-btn ${slotIsBy?'active':''}" style="flex:1;border-radius:8px;" data-onclick="setEditSlotMode" data-args='${dataArgs(['by'])}'>Collect by</button>
          </div>
          <div id="editSlotRangeInputs" style="display:${slotIsBy?'none':'flex'};align-items:center;gap:8px;">
            <select class="form-select" id="editOfferingSlotFrom" style="flex:1;">${COLLECTION_TIMES.map(t=>`<option value="${t}" ${t===slotFromVal?'selected':''}>${t}</option>`).join('')}</select>
            <span style="color:var(--text-muted);font-size:0.85rem;flex-shrink:0;">to</span>
            <select class="form-select" id="editOfferingSlotTo" style="flex:1;">${COLLECTION_TIMES.map(t=>`<option value="${t}" ${t===slotToVal?'selected':''}>${t}</option>`).join('')}</select>
          </div>
          <div id="editSlotByInput" style="display:${slotIsBy?'block':'none'};">
            <select class="form-select" id="editOfferingSlotBy">${COLLECTION_TIMES.map(t=>`<option value="${t}" ${t===slotByVal?'selected':''}>${t}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-group" style="margin:0;"><label class="form-label">Photo</label>
          ${o.photoURL ? `<img src="${o.photoURL}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;margin-bottom:8px;display:block;">` : ''}
          <input type="file" accept="image/*" id="editOfferingPhoto" style="font-size:0.82rem;"></div>
        <div style="display:flex;gap:10px;margin-top:4px;">
          <button class="btn-ghost" style="flex:1;" data-onclick="closeEditOfferingOverlay">Cancel</button>
          <button class="btn-espresso" style="flex:2;" data-onclick="saveEditOffering" data-args='${dataArgs([offeringId, bakeryName])}'>Save changes</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

export function closeEditOfferingOverlay() {
  document.getElementById('editOfferingOverlay')?.remove();
}

export function setEditSlotMode(mode) {
  document.getElementById('editSlotModeRange').classList.toggle('active', mode === 'range');
  document.getElementById('editSlotModeBy').classList.toggle('active', mode === 'by');
  document.getElementById('editSlotRangeInputs').style.display = mode === 'range' ? 'flex' : 'none';
  document.getElementById('editSlotByInput').style.display = mode === 'by' ? 'block' : 'none';
}

export function getEditSlotValue() {
  const modeRange = document.getElementById('editSlotModeRange')?.classList.contains('active');
  if (modeRange) {
    const from = document.getElementById('editOfferingSlotFrom')?.value;
    const to = document.getElementById('editOfferingSlotTo')?.value;
    return from && to ? `${from} – ${to}` : from || '';
  } else {
    const by = document.getElementById('editOfferingSlotBy')?.value;
    return by ? `Collect by ${by}` : '';
  }
}

export async function saveEditOffering(offeringId, bakeryName) {
  if (!fb) return;
  const { db, doc, updateDoc } = fb;
  const name = document.getElementById('editOfferingName').value.trim();
  const price = parseFloat(document.getElementById('editOfferingPrice').value);
  const qty = parseInt(document.getElementById('editOfferingQty').value);
  const maxPerPerson = parseInt(document.getElementById('editOfferingMaxPerPerson').value) || 2;
  const slot = getEditSlotValue();
  if (!name || !price || !qty || !slot) { showToast('Please fill in all required fields'); return; }

  let photoURL = null;
  const fileInput = document.getElementById('editOfferingPhoto');
  if (fileInput?.files[0]) {
    try { photoURL = await uploadItemPhoto(fileInput.files[0]); } catch(e) {}
  }

  try {
    const updates = {
      name,
      description: document.getElementById('editOfferingDesc').value.trim(),
      price, quantity: qty, maxPerPerson, slot,
      ...(photoURL ? { photoURL } : {})
    };
    await updateDoc(doc(db, 'preorderOfferings', offeringId), updates);
    // Update catalogue entry too
    await saveToCatalogue(bakeryName, name, updates.description, price, photoURL);
    showToast('✅ Offering updated');
    document.getElementById('editOfferingOverlay')?.remove();
    await renderMpUpcoming(null, bakeryName);
  } catch(e) { showToast('Could not save changes'); console.error(e); }
}

export function showAddOfferingForm(bakeryName) {
  // Build date options: next 7 days (collection dates)
  const dateOptions = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const label = i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'short' });
    dateOptions.push(`<option value="${d.toISOString().split('T')[0]}">${label}</option>`);
  }

  const slotOptions = COLLECTION_SLOTS.map(s => `<option value="${s}">${s}</option>`).join('');

  document.getElementById('addOfferingForm').style.display = 'block';
  document.getElementById('addOfferingForm').innerHTML = `
    <!-- Catalogue picker -->
    <div class="form-group" id="cataloguePickerGroup">
      <label class="form-label">From your catalogue <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
      <select class="form-select" id="cataloguePicker" data-onchange="fillFromCatalogue">
        <option value="">— Start fresh or pick a saved item —</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Item name <span style="color:#e74c3c;">*</span></label>
      <input type="text" class="form-input" id="offeringName" placeholder="e.g. Almond Croissant"></div>
    <div class="form-group"><label class="form-label">Description</label>
      <textarea class="form-textarea" id="offeringDesc" placeholder="What makes this special…" style="min-height:60px;"></textarea></div>
    <div class="form-group"><label class="form-label">Price (£) <span style="color:#e74c3c;">*</span></label>
      <input type="number" class="form-input" id="offeringPrice" placeholder="0.00" step="0.01" min="0"></div>
    <div class="form-group"><label class="form-label">Quantity available <span style="color:#e74c3c;">*</span></label>
      <input type="number" class="form-input" id="offeringQty" placeholder="e.g. 12" min="1" step="1"></div>
    <div class="form-group"><label class="form-label">Max per person <span style="color:#e74c3c;">*</span></label>
      <input type="number" class="form-input" id="offeringMaxPerPerson" placeholder="e.g. 2" min="1" step="1" value="2">
      <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Maximum a single customer can reserve</div>
    </div>
    <div class="form-group"><label class="form-label">Collection date <span style="color:#e74c3c;">*</span></label>
      <select class="form-select" id="offeringDate">${dateOptions.join('')}</select>
      <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">⏰ Pre-orders go live at 8am the day before</div>
    </div>
    <div class="form-group"><label class="form-label">Collection window <span style="color:#e74c3c;">*</span></label>
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <button type="button" id="slotModeRange" class="bakery-view-btn active" style="flex:1;border-radius:8px;" data-onclick="setSlotMode" data-args='${dataArgs(['range'])}'>Time range</button>
        <button type="button" id="slotModeBy" class="bakery-view-btn" style="flex:1;border-radius:8px;" data-onclick="setSlotMode" data-args='${dataArgs(['by'])}'>Collect by</button>
      </div>
      <div id="slotRangeInputs" style="display:flex;align-items:center;gap:8px;">
        <select class="form-select" id="offeringSlotFrom" style="flex:1;">${COLLECTION_TIMES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
        <span style="color:var(--text-muted);font-size:0.85rem;flex-shrink:0;">to</span>
        <select class="form-select" id="offeringSlotTo" style="flex:1;">${COLLECTION_TIMES.map((t,i)=>`<option value="${t}" ${i===4?'selected':''}>${t}</option>`).join('')}</select>
      </div>
      <div id="slotByInput" style="display:none;">
        <select class="form-select" id="offeringSlotBy">${COLLECTION_TIMES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Customer can collect any time before this</div>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Photo</label>
      <div id="offeringPhotoPreview" style="margin-bottom:6px;"></div>
      <input type="file" accept="image/*" id="offeringPhoto" style="font-size:0.82rem;" data-onchange="previewOfferingPhoto"></div>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button class="btn-ghost" data-onclick="hideAddOfferingForm">Cancel</button>
      <button class="btn-espresso" data-onclick="saveOffering" data-args='${dataArgs([bakeryName])}'>Save offering</button>
    </div>`;

  // Load catalogue async
  loadBakeryCatalogue(bakeryName);
}

export function hideAddOfferingForm() {
  document.getElementById('addOfferingForm').style.display = 'none';
}

export function previewOfferingPhoto(input) {
  const preview = document.getElementById('offeringPhotoPreview');
  if (!preview || !input.files[0]) return;
  const url = URL.createObjectURL(input.files[0]);
  preview.innerHTML = `<img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;">`;
}

export async function loadBakeryCatalogue(bakeryName) {
  if (!fb) return;
  const { db, collection, query, where, getDocs, orderBy } = fb;
  try {
    const snap = await getDocs(query(
      collection(db, 'bakeryCatalogue'),
      where('bakeryName', '==', bakeryName)
    ));
    const items = snap.docs.map(d => ({id: d.id, ...d.data()}))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const sel = document.getElementById('cataloguePicker');
    if (!sel) return;
    if (!items.length) {
      sel.innerHTML = '<option value="">— No saved items yet (will save after first offering) —</option>';
      return;
    }
    sel.innerHTML = '<option value="">— Pick a saved item to auto-fill —</option>' +
      items.map(i => `<option value="${i.id}" data-name="${escJS(i.name)}" data-desc="${escJS(i.description||'')}" data-price="${i.price||''}" data-photo="${i.photoURL||''}">${i.name} · £${parseFloat(i.price||0).toFixed(2)}</option>`).join('');
  } catch(e) { console.warn('Catalogue load error:', e); }
}

// bakeryName was a dead parameter on the old onclick="fillFromCatalogue(bakeryName,this.value)"
// call (never read in the body) — dropped here since this is its only call site.
export function fillFromCatalogue(sel) {
  if (!sel.value) return;
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;

  document.getElementById('offeringName').value = opt.dataset.name || '';
  document.getElementById('offeringDesc').value = opt.dataset.desc || '';
  document.getElementById('offeringPrice').value = opt.dataset.price || '';

  // Show existing photo preview
  if (opt.dataset.photo) {
    const preview = document.getElementById('offeringPhotoPreview');
    if (preview) preview.innerHTML = `<img src="${opt.dataset.photo}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;">`;
  }

  // Store catalogue item ID so we can reuse its photoURL on save
  document.getElementById('addOfferingForm').dataset.catalogueId = sel.value;
  document.getElementById('addOfferingForm').dataset.cataloguePhoto = opt.dataset.photo || '';
}

export async function saveToCatalogue(bakeryName, name, description, price, photoURL) {
  if (!fb || !currentUser) return;
  const { db, collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } = fb;
  try {
    // Check if this item already exists in catalogue (by name, case-insensitive)
    const snap = await getDocs(query(
      collection(db, 'bakeryCatalogue'),
      where('bakeryName', '==', bakeryName),
      where('nameLower', '==', name.toLowerCase())
    ));
    if (snap.empty) {
      // New item — add to catalogue
      await addDoc(collection(db, 'bakeryCatalogue'), {
        bakeryName, name, nameLower: name.toLowerCase(),
        description: description || '', price, photoURL: photoURL || null,
        createdBy: currentUser.uid, createdAt: serverTimestamp()
      });
    } else {
      // Existing — update price and photo if changed
      await updateDoc(doc(db, 'bakeryCatalogue', snap.docs[0].id), {
        price, photoURL: photoURL || snap.docs[0].data().photoURL || null,
        description: description || snap.docs[0].data().description || ''
      });
    }
  } catch(e) { console.warn('Catalogue save error:', e); }
}

export function setSlotMode(mode) {
  document.getElementById('slotModeRange').classList.toggle('active', mode === 'range');
  document.getElementById('slotModeBy').classList.toggle('active', mode === 'by');
  document.getElementById('slotRangeInputs').style.display = mode === 'range' ? 'flex' : 'none';
  document.getElementById('slotByInput').style.display = mode === 'by' ? 'block' : 'none';
}

export function getSlotValue() {
  const modeRange = document.getElementById('slotModeRange')?.classList.contains('active');
  if (modeRange) {
    const from = document.getElementById('offeringSlotFrom')?.value;
    const to = document.getElementById('offeringSlotTo')?.value;
    return from && to ? `${from} – ${to}` : from || '';
  } else {
    const by = document.getElementById('offeringSlotBy')?.value;
    return by ? `Collect by ${by}` : '';
  }
}

export async function saveOffering(bakeryName) {
  if (!fb || !currentUser) return;
  const name = document.getElementById('offeringName').value.trim();
  const price = parseFloat(document.getElementById('offeringPrice').value);
  const qty = parseInt(document.getElementById('offeringQty').value);
  const maxPerPerson = parseInt(document.getElementById('offeringMaxPerPerson').value) || 2;
  const slot = getSlotValue();
  const collectDate = document.getElementById('offeringDate').value;
  if (!name || !price || !qty || !slot || !collectDate) { showToast('Please fill in all required fields'); return; }

  // Go-live = 8am the day before collection
  const goLiveDate = new Date(collectDate + 'T00:00:00');
  goLiveDate.setDate(goLiveDate.getDate() - 1);
  goLiveDate.setHours(8, 0, 0, 0);
  const goLiveISO = goLiveDate.toISOString();

  const { db, collection, addDoc, serverTimestamp } = fb;

  // Photo — new upload takes priority, then catalogue photo
  let photoURL = document.getElementById('addOfferingForm').dataset.cataloguePhoto || null;
  const fileInput = document.getElementById('offeringPhoto');
  if (fileInput?.files[0]) {
    try { photoURL = await uploadItemPhoto(fileInput.files[0]); } catch(e) {}
  }

  const description = document.getElementById('offeringDesc').value.trim();

  try {
    await addDoc(collection(db, 'preorderOfferings'), {
      bakeryName, name, description, price,
      quantity: qty, remaining: qty, maxPerPerson, slot,
      collectDate, goLiveAt: goLiveISO, photoURL,
      createdBy: currentUser.uid, createdAt: serverTimestamp(), active: true
    });

    // Save/update catalogue entry
    await saveToCatalogue(bakeryName, name, description, price, photoURL);

    showToast('✅ Offering added — goes live at 8am the day before');
    document.getElementById('addOfferingForm').style.display = 'none';
    await renderMpUpcoming(null, bakeryName);
  } catch(e) { showToast('Could not save offering'); console.error(e); }
}

export async function deleteOffering(offeringId, bakeryName) {
  if (!confirm('Remove this offering? Any existing reservations will be cancelled.')) return;
  const { db, doc, deleteDoc } = fb;
  try {
    await deleteDoc(doc(db, 'preorderOfferings', offeringId));
    showToast('Offering removed');
    await renderMpUpcoming(null, bakeryName);
  } catch(e) { showToast('Could not remove'); }
}

export async function markCollected(reservationId, bakeryName) {
  const { db, doc, updateDoc } = fb;
  try {
    await updateDoc(doc(db, 'reservations', reservationId), { status: 'collected', collectedAt: new Date().toISOString() });
    showToast('✓ Marked as collected');
    await renderMpUpcoming(null, bakeryName);
  } catch(e) { showToast('Could not update'); }
}

export async function openCatalogueManager(bakeryName) {
  const overlay = document.createElement('div');
  overlay.id = 'catalogueManagerOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--cream-white);border-radius:var(--radius) var(--radius) 0 0;width:100%;max-width:560px;max-height:75vh;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);">
        <div style="font-family:'Playfair Display',serif;font-size:1rem;font-weight:700;color:var(--espresso);">📋 Item catalogue</div>
        <button data-onclick="closeCatalogueManager" style="background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text-muted);">✕</button>
      </div>
      <div id="catalogueList" style="overflow-y:auto;flex:1;padding:16px 20px;">
        <div style="text-align:center;padding:24px;"><div class="spinner" style="margin:0 auto;"></div></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  if (!fb) return;
  const { db, collection, query, where, getDocs, doc, deleteDoc } = fb;
  try {
    const snap = await getDocs(query(collection(db, 'bakeryCatalogue'), where('bakeryName','==',bakeryName)));
    const items = snap.docs.map(d => ({id:d.id,...d.data()})).sort((a,b) => a.name.localeCompare(b.name));
    const list = document.getElementById('catalogueList');
    if (!items.length) {
      list.innerHTML = `<div class="empty-state" style="padding:24px 0;"><div class="empty-state-icon">📋</div><div class="empty-state-title">No catalogue items yet</div><div class="empty-state-text">Items are saved automatically when you create your first offering.</div></div>`;
      return;
    }
    list.innerHTML = items.map(item => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
        ${item.photoURL ? `<img src="${item.photoURL}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0;">` : `<div style="width:44px;height:44px;border-radius:6px;background:var(--parchment-dark);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">🥐</div>`}
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.88rem;font-weight:600;color:var(--espresso);">${item.name}</div>
          <div style="font-size:0.72rem;color:var(--text-muted);">£${parseFloat(item.price||0).toFixed(2)}${item.description ? ` · ${item.description.slice(0,40)}${item.description.length>40?'…':''}` : ''}</div>
        </div>
        <button data-onclick="removeCatalogueItem" data-args='${dataArgs([item.id, bakeryName])}' style="background:none;border:none;color:#e74c3c;font-size:0.8rem;cursor:pointer;flex-shrink:0;">Remove</button>
      </div>`).join('');
  } catch(e) {
    document.getElementById('catalogueList').innerHTML = '<div style="padding:16px;color:var(--text-muted);">Could not load catalogue.</div>';
  }
}

export function closeCatalogueManager() {
  document.getElementById('catalogueManagerOverlay')?.remove();
}

export async function removeCatalogueItem(itemId, bakeryName) {
  if (!confirm('Remove this item from your catalogue?')) return;
  const { db, doc, deleteDoc } = fb;
  try {
    await deleteDoc(doc(db, 'bakeryCatalogue', itemId));
    showToast('Removed from catalogue');
    openCatalogueManager(bakeryName); // refresh
    document.getElementById('catalogueManagerOverlay')?.remove();
  } catch(e) { showToast('Could not remove'); }
}

// The full "Baker: manage offerings" cluster's own registerActions() call —
// unchanged from legacy-app.js except it now lives alongside the functions
// it registers. openManagePreordersModal/closeManagePreordersModal are new
// additions here — pulled out of two bulk registerActions() calls back in
// legacy-app.js that mix several other not-yet-extracted clusters' own
// open/close-modal functions (same pattern as authModal.js's
// closeAuthModal, Phase 1 step 6), since those two bulk calls stay behind.
registerActions({
  openManagePreordersModal, closeManagePreordersModal,
  switchMpTab, openCatalogueManager, showAddOfferingForm,
  openEditOffering, deleteOffering, markCollected, showMpDayDetail,
  closeMpDayDetail, setSlotMode, setEditSlotMode, fillFromCatalogue,
  previewOfferingPhoto, saveOffering, saveEditOffering,
  closeEditOfferingOverlay, hideAddOfferingForm, closeCatalogueManager,
  removeCatalogueItem,
});
