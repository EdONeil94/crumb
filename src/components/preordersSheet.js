// ─── MY PRE-ORDERS SHEET (burger menu) ─────────────────────────────────────
// The mobile burger-menu "🗓️ My pre-orders" bottom sheet (pages/components
// carving, Phase 7 step 31 — see CLAUDE.md): the signed-in user's pending
// reservations, each with a mini QR, plus the hamburger/menu badge counts.
// Distinct from the Pre-order *discovery* page (src/pages/preorders.js,
// step 30) and the baker-side Manage pre-orders modal
// (src/components/manageOfferingsModal.js, step 17).
//
// loadMyPreorders is exported — legacy-app.js's initFirebaseApp() (auth
// listener) and cancelReservation() both call it to refresh the badge, and
// bakeryModal.js's reserveOffering reaches it via
// getAction('loadMyPreorders')() (global registry — that keeps working
// regardless of which module registers it). openMyPreordersSheet/
// closeMyPreordersSheet/viewOrdersFromMyPreordersSheet register here too;
// all three are markup-only otherwise. updatePreorderBadge and
// myPendingPreorders are module-private.
//
// viewOrdersFromMyPreordersSheet chains openProfileModal().then(
// switchProfileTab) — both imported one-way from profileModal.js (no
// cycle; nothing there imports this file). openMyPreordersSheet's
// signed-out guard calls openAuthModal from authModal.js. QR codes use the
// global window.QRCode, same as before.

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { currentUser, fb } from '../state/appState.js';
import { openAuthModal } from './authModal.js';
import { openProfileModal, switchProfileTab } from './profileModal.js';

let myPendingPreorders = [];

// bakeryModal.js's reserveOffering (step 21) still reaches this via
// getAction('loadMyPreorders')() rather than importing it — that's a leaf
// module and importing back through here would risk a cycle; the registry
// lookup keeps working now that the registration lives in this file.
export async function loadMyPreorders() {
  if (!currentUser || !fb) return;
  const { db, collection, query, where, getDocs } = fb;
  try {
    const snap = await getDocs(query(
      collection(db, 'reservations'),
      where('userId', '==', currentUser.uid),
      where('status', '==', 'pending')
    ));
    myPendingPreorders = snap.docs.map(d => ({id: d.id, ...d.data()}))
      .filter(r => r.collectDate >= new Date().toISOString().split('T')[0])
      .sort((a,b) => a.collectDate.localeCompare(b.collectDate));
    updatePreorderBadge();
  } catch(e) { console.warn('Preorders load error:', e); }
}


function updatePreorderBadge() {
  const count = myPendingPreorders.length;
  const hamburgerBadge = document.getElementById('hamburgerPreorderBadge');
  const menuBadge = document.getElementById('mobilePreordersBadge');
  const menuBtn = document.getElementById('mobilePreordersBtn');

  if (hamburgerBadge) {
    hamburgerBadge.textContent = count > 9 ? '9+' : count;
    hamburgerBadge.style.display = count > 0 ? 'flex' : 'none';
  }
  if (menuBadge) {
    menuBadge.textContent = count;
    menuBadge.style.display = count > 0 ? 'inline' : 'none';
  }
  if (menuBtn) menuBtn.style.display = currentUser ? '' : 'none';
}

function openMyPreordersSheet() {
  if (!currentUser) { openAuthModal(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'myPreordersSheet';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:flex-end;justify-content:center;';

  const rows = myPendingPreorders.length ? myPendingPreorders.map(r => {
    const collectDate = new Date(r.collectDate + 'T12:00:00').toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'});
    const ref = r.id.slice(-6).toUpperCase();
    const qty = r.quantity > 1 ? `${r.quantity}× ` : '';
    const daysUntil = Math.ceil((new Date(r.collectDate) - new Date()) / (1000*60*60*24));
    const urgency = daysUntil === 0 ? '🔴 Today!' : daysUntil === 1 ? '🟡 Tomorrow' : `🟢 ${daysUntil} days`;
    return `
      <div style="padding:14px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px;">
          <div>
            <div style="font-size:0.92rem;font-weight:700;color:var(--espresso);">${qty}${r.offeringName}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">📍 ${r.bakeryName}</div>
          </div>
          <span style="font-size:0.7rem;font-weight:600;white-space:nowrap;">${urgency}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:0.78rem;color:var(--caramel);font-weight:600;">🕐 ${r.slot}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);">${collectDate} · Ref: <strong>${ref}</strong></div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">Pay in store · £${parseFloat(r.totalPrice || r.price || 0).toFixed(2)}</div>
          </div>
          <div id="miniQR_${r.id}" style="width:52px;height:52px;flex-shrink:0;"></div>
        </div>
      </div>`;
  }).join('') : `<div class="empty-state" style="padding:24px 0;">
    <div class="empty-state-icon">🗓️</div>
    <div class="empty-state-title">No upcoming pre-orders</div>
    <div class="empty-state-text">Browse the Pre-order page to reserve tomorrow's bakes.</div>
  </div>`;

  overlay.innerHTML = `
    <div style="background:var(--cream-white);border-radius:var(--radius) var(--radius) 0 0;width:100%;max-width:520px;max-height:80vh;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0;">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:1rem;font-weight:700;color:var(--espresso);">🗓️ My pre-orders</div>
          ${myPendingPreorders.length ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${myPendingPreorders.length} upcoming reservation${myPendingPreorders.length !== 1 ? 's' : ''}</div>` : ''}
        </div>
        <button data-onclick="closeMyPreordersSheet" style="background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text-muted);">✕</button>
      </div>
      <div style="overflow-y:auto;flex:1;padding:0 20px 24px;">${rows}</div>
      ${myPendingPreorders.length ? `
        <div style="padding:12px 20px 28px;border-top:1px solid var(--border);flex-shrink:0;display:flex;gap:10px;">
          <button class="btn-ghost" style="flex:1;" data-onclick="closeMyPreordersSheet,showPage" data-args='${dataArgs(['preorders'])}'>Browse more</button>
          <button class="btn-espresso" style="flex:1;" data-onclick="viewOrdersFromMyPreordersSheet">View all orders</button>
        </div>` : `
        <div style="padding:12px 20px 28px;border-top:1px solid var(--border);flex-shrink:0;">
          <button class="btn-espresso" style="width:100%;" data-onclick="closeMyPreordersSheet,showPage" data-args='${dataArgs(['preorders'])}'>Browse pre-orders</button>
        </div>`}
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Generate mini QR codes
  requestAnimationFrame(() => {
    myPendingPreorders.forEach(r => {
      const el = document.getElementById(`miniQR_${r.id}`);
      if (el && window.QRCode) {
        try {
          new QRCode(el, {
            text: `crumbz:reservation:${r.id}`,
            width: 52, height: 52,
            colorDark: '#2c1810', colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
          });
        } catch(e) {
          el.innerHTML = `<div style="font-size:0.5rem;font-family:monospace;font-weight:700;color:#2c1810;text-align:center;line-height:1.3;">${r.id.slice(-6).toUpperCase()}</div>`;
        }
      }
    });
  });
}

function closeMyPreordersSheet() {
  document.getElementById('myPreordersSheet')?.remove();
}

// The "View all orders" action chains a promise (switchProfileTab only once
// openProfileModal's data has loaded) rather than the plain "cleanup, then
// one call" shape delegate.js handles natively, so it needs this small named
// wrapper instead of a comma-list data-onclick.
function viewOrdersFromMyPreordersSheet() {
  closeMyPreordersSheet();
  openProfileModal(currentUser.uid).then(() => switchProfileTab('orders', currentUser.uid));
}

registerActions({
  loadMyPreorders, openMyPreordersSheet, closeMyPreordersSheet,
  viewOrdersFromMyPreordersSheet,
});
