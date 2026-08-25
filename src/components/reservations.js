// ─── RESERVATIONS ───────────────────────────────────────────────────────────
// The Profile modal's own "Orders" tab — a signed-in diner's pending/past
// pre-order reservations, the 12-hour cancel cutoff, and the tap-to-enlarge
// QR trigger (pages/components carving, Phase 3 step 16, closing out Phase
// 3 — see CLAUDE.md). Covered by tests/reservations.spec.js.
//
// Split, not clean — flagged before writing any code: cancelReservation()
// calls loadMyPreorders(), part of the not-yet-extracted "MY PRE-ORDERS
// (burger menu)" cluster (future src/components/preordersSheet.js, Phase 7
// step 31 — a distant step, unlike most of this plan's imminent-step
// deferrals). Moving cancelReservation() here would mean this file
// importing loadMyPreorders() back from legacy-app.js, while legacy-app.js
// already needs renderOrdersTab() imported the normal direction (from
// switchProfileTab, itself staying in legacy-app.js — the Profile modal,
// future src/components/profileModal.js, Phase 5 step 22) — a genuine
// two-file cycle. cancelReservation() stays in legacy-app.js instead,
// importing parseSlotStartTime() back from here (its only dependency this
// file owns) — an ordinary one-way import, not circular, since nothing
// here calls back into legacy-app.js.
//
// Explicitly out of scope for this step, despite also reading/writing the
// 'reservations' Firestore collection: reserveOffering()/openReserveModal()/
// closeReserveModal()/renderPreorderTab() — the "Reserve" flow reached from
// a bakery profile's own Pre-order tab. That's bakery-profile-modal
// internals (future src/components/bakeryModal.js, Phase 5 step 21), a
// different call path from the Orders-tab flow this file owns, and
// genuinely untouched by tests/reservations.spec.js itself (only used
// indirectly, as tests/utils/preorders.js's own setup helper, to create a
// reservation to then cancel/view). Not moved here to avoid conflating two
// different future clusters' scope.

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { currentUser, fb } from '../state/appState.js';
import { generateOrderQRCodes } from './qrCode.js';

// Extracts the first "H:MMam/pm" time token from a slot string — works for
// both slot formats getSlotValue()/getEditSlotValue() can produce, "7:00am –
// 11:00am" (range: takes the start time) and "Collect by 5:00pm" (takes that
// time) — and converts it to zero-padded 24h "HH:MM" for use in a Date
// string. Returns null if no time token is found (e.g. missing/malformed
// slot), so callers can fall back to a default.
//
// Bug fix: the previous logic built the cutoff Date from
// `collectDate + 'T' + slot.replace('am','').replace('pm','')` directly —
// for every real slot format this produces a string like "...T7:00 – 11:00"
// or "...TCollect by 7:00", which `new Date(...)` parses as Invalid Date.
// Since `NaN > anything` is always false, this made the 12-hour cancel
// cutoff check (both the Cancel button's own visibility and the actual
// enforcement in cancelReservation) permanently return false — the Cancel
// button never rendered at all, for any reservation, regardless of timing.
export function parseSlotStartTime(slot) {
  const m = slot?.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const ap = m[3].toLowerCase();
  if (ap === 'pm' && hh !== 12) hh += 12;
  if (ap === 'am' && hh === 12) hh = 0;
  return `${String(hh).padStart(2, '0')}:${mm}`;
}

// ── Customer: view orders in profile ──────────────────────────────────────────
export async function renderOrdersTab(container) {
  if (!currentUser || !fb) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗓️</div><div class="empty-state-title">Sign in to see your orders</div></div>';
    return;
  }
  const { db, collection, query, where, getDocs, orderBy } = fb;
  try {
    const snap = await getDocs(query(collection(db, 'reservations'), where('userId','==',currentUser.uid)));
    const reservations = snap.docs.map(d => ({id:d.id,...d.data()}))
      .sort((a,b) => {
        const ta = a.createdAt?.toDate?.() || new Date(a.createdAt||0);
        const tb = b.createdAt?.toDate?.() || new Date(b.createdAt||0);
        return tb - ta;
      });

    if (!reservations.length) {
      container.innerHTML = `<div class="empty-state" style="padding:32px 0;">
        <div class="empty-state-icon">🗓️</div>
        <div class="empty-state-title">No pre-orders yet</div>
        <div class="empty-state-text">Browse a bakery's Pre-order tab to reserve tomorrow's bakes.</div>
      </div>`;
      return;
    }

    container.innerHTML = reservations.map(r => {
      const ref = r.id.slice(-6).toUpperCase();
      const collectDate = r.collectDate ? new Date(r.collectDate).toLocaleDateString('en-GB', {weekday:'short',day:'numeric',month:'short'}) : '';
      const canCancel = r.status === 'pending' && r.collectDate && (() => {
        const collect = new Date(r.collectDate + 'T' + (parseSlotStartTime(r.slot) || '09:00'));
        return (collect - new Date()) > 12 * 60 * 60 * 1000;
      })();

      // QR code block — generated after render
      const qrBlock = r.status !== 'cancelled' ? `<div class="order-qr" id="qr_${r.id}" data-onclick="expandQR" data-args='${dataArgs([r.id, r.offeringName, ref])}' title="Tap to enlarge"></div>` : '';

      return `<div class="order-card${r.status === 'collected' ? ' collected' : ''}" id="ordercard_${r.id}">
        <div class="order-card-header">
          <div>
            <div class="order-card-name">${r.offeringName}</div>
            <div class="order-card-bakery">📍 ${r.bakeryName}</div>
          </div>
          <span class="order-status ${r.status||'pending'}">${r.status === 'collected' ? '✓ Collected' : r.status === 'cancelled' ? 'Cancelled' : 'Pending'}</span>
        </div>
        <div class="order-details">
          <div class="order-info">
            <div class="order-slot">🕐 ${r.slot} · ${collectDate}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">
              ${r.quantity > 1 ? `${r.quantity}× · ` : ''}Pay in store · £${parseFloat(r.totalPrice || r.price || 0).toFixed(2)}
            </div>
            <div class="order-id">Ref: ${ref}</div>
            ${canCancel ? `<button data-onclick="cancelReservation" data-args='${dataArgs([r.id, r.offeringId])}' style="margin-top:8px;background:none;border:none;color:#e74c3c;font-size:0.75rem;cursor:pointer;padding:0;">Cancel reservation</button>` : ''}
          </div>
          ${r.status !== 'cancelled' ? qrBlock : ''}
        </div>
      </div>`;
    }).join('');

    // Generate real QR codes after DOM is painted
    requestAnimationFrame(() => generateOrderQRCodes(reservations));

  } catch(e) {
    container.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Could not load orders.</div>';
    console.error(e);
  }
}
