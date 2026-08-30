// ─── QR CODE ─────────────────────────────────────────────────────────────────
// Reservation QR display (diner-facing) + QR scanner (baker-facing) —
// bundled together as one file since both are small and closely related
// (pages/components carving, Phase 2 step 10 — see CLAUDE.md).
//
// Step-10 deferral resolved (Phase 4 step 17, 2026-08-25): confirmCollected()
// (+ its own closeQrConfirmOverlay() helper) call markCollected(), which now
// has a real importable home in src/components/manageOfferingsModal.js.
// Moving them here no longer risks a cycle — verified explicitly, not
// assumed, before moving: manageOfferingsModal.js's only reference to
// anything in this file is a markup data-onclick="openQRScanner" string
// (resolved via the delegated-actions registry at click time), never a real
// import, so the dependency is one-way (this file → manageOfferingsModal.js)
// same as generateOrderQRCodes()'s own dependents.
//
// generateOrderQRCodes() is called from src/components/reservations.js (the
// Profile modal's Orders tab, Phase 3 step 16) — not from legacy-app.js or
// manageOfferingsModal.js as an earlier version of this comment claimed;
// corrected while already here. Neither this file nor reservations.js
// imports anything back from the other beyond that one export, so this
// stays a normal one-way dependency, not circular.
//
// processScannedReservation() keeps its WINDOW EXPORTS entry (via
// legacy-app.js, since that's where WINDOW EXPORTS lives) even though it
// has zero raw markup call sites — tests/qr-scanner-baker.spec.js calls
// `window.processScannedReservation(id, bakeryName)` directly to bypass
// real camera/jsQR decoding, so removing it would break that spec.
// generateOrderQRCodes() no longer needs a WINDOW EXPORTS entry at all —
// legacy-app.js doesn't import it anymore (see reservations.js above).

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { fb } from '../state/appState.js';
import { showToast } from '../utils/dom.js';
import { markCollected } from './manageOfferingsModal.js';

let scannerStream = null;
let scannerAnimFrame = null;

export function generateOrderQRCodes(reservations) {
  reservations.forEach(r => {
    if (r.status === 'cancelled') return;
    const el = document.getElementById(`qr_${r.id}`);
    if (!el) return;
    el.innerHTML = '';
    if (window.QRCode) {
      try {
        new QRCode(el, {
          text: `crumbz:reservation:${r.id}`,
          width: 90, height: 90,
          colorDark: '#2c1810', colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
      } catch(e) {
        el.innerHTML = `<div style="font-size:0.65rem;font-weight:700;color:#2c1810;padding:6px;text-align:center;font-family:monospace;line-height:1.4;">🥐<br>${r.id.slice(-6).toUpperCase()}</div>`;
      }
    } else {
      // QRCode.js not loaded yet — retry once
      setTimeout(() => generateOrderQRCodes([r]), 1000);
    }
  });
}

export function expandQR(reservationId, itemName, ref) {
  // Show a full-screen QR for easy scanning
  const overlay = document.createElement('div');
  overlay.id = 'expandedQRModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;text-align:center;">
      <div id="expandedQR"></div>
      <div style="font-family:serif;font-size:1rem;font-weight:700;color:#2c1810;margin-top:14px;">${itemName}</div>
      <div style="font-size:0.75rem;color:#888;margin-top:4px;font-family:monospace;">Ref: ${ref}</div>
      <div style="font-size:0.72rem;color:#aaa;margin-top:8px;">Show this to the baker at collection</div>
    </div>
    <button style="color:white;background:none;border:1.5px solid rgba(255,255,255,0.4);border-radius:100px;padding:10px 28px;font-size:0.85rem;cursor:pointer;" data-onclick="closeExpandedQR">Close</button>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  requestAnimationFrame(() => {
    const el = document.getElementById('expandedQR');
    if (el && window.QRCode) {
      new QRCode(el, {
        text: `crumbz:reservation:${reservationId}`,
        width: 220, height: 220,
        colorDark: '#2c1810', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    }
  });
}

export function closeExpandedQR() {
  document.getElementById('expandedQRModal')?.remove();
}

export async function openQRScanner(bakeryName) {
  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'qr-scanner-overlay';
  overlay.id = 'qrScannerOverlay';
  overlay.innerHTML = `
    <div class="qr-scanner-frame">
      <video id="qrVideo" autoplay playsinline muted></video>
      <canvas id="qrCanvas" style="display:none;"></canvas>
      <div class="qr-scanner-corners"></div>
      <div class="qr-scanner-line"></div>
    </div>
    <div class="qr-scanner-status" id="qrStatus">Point camera at customer's QR code</div>
    <button style="color:white;background:none;border:1.5px solid rgba(255,255,255,0.4);border-radius:100px;padding:10px 28px;font-size:0.85rem;cursor:pointer;" data-onclick="closeQRScanner">Cancel</button>`;
  document.body.appendChild(overlay);

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const video = document.getElementById('qrVideo');
    video.srcObject = scannerStream;
    await video.play();
    scanFrame(bakeryName);
  } catch(e) {
    document.getElementById('qrStatus').textContent = 'Camera access denied. Please allow camera and try again.';
  }
}

function scanFrame(bakeryName) {
  const video = document.getElementById('qrVideo');
  const canvas = document.getElementById('qrCanvas');
  const status = document.getElementById('qrStatus');
  if (!video || !canvas || video.readyState < 2) {
    scannerAnimFrame = requestAnimationFrame(() => scanFrame(bakeryName));
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (window.jsQR) {
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code?.data?.startsWith('crumbz:reservation:')) {
      const reservationId = code.data.replace('crumbz:reservation:', '');
      closeQRScanner();
      processScannedReservation(reservationId, bakeryName);
      return;
    }
  }
  scannerAnimFrame = requestAnimationFrame(() => scanFrame(bakeryName));
}

export function closeQRScanner() {
  if (scannerStream) { scannerStream.getTracks().forEach(t => t.stop()); scannerStream = null; }
  if (scannerAnimFrame) { cancelAnimationFrame(scannerAnimFrame); scannerAnimFrame = null; }
  document.getElementById('qrScannerOverlay')?.remove();
}

export async function processScannedReservation(reservationId, bakeryName) {
  if (!fb) return;
  const { db, doc, getDoc, updateDoc } = fb;
  showToast('🔍 Looking up reservation…');
  try {
    const snap = await getDoc(doc(db, 'reservations', reservationId));
    if (!snap.exists()) { showToast('❌ Reservation not found'); return; }
    const r = snap.data();

    // Verify it's for this bakery
    if (r.bakeryName !== bakeryName) { showToast('❌ This reservation is for a different bakery'); return; }
    if (r.status === 'collected') { showToast('⚠️ Already marked as collected'); return; }
    if (r.status === 'cancelled') { showToast('⚠️ This reservation was cancelled'); return; }

    // Show confirmation before marking collected
    const ref = reservationId.slice(-6).toUpperCase();
    const confirmOverlay = document.createElement('div');
    // A dedicated class to close by, rather than the generic `div[style]`
    // this used to close by — every element in this overlay has an inline
    // style attribute, including the immediate parent of the buttons
    // themselves, so `closest('div[style]')` from a button matched that
    // inner row instead of the overlay: Cancel only ever removed the
    // button row, leaving a headless dialog stuck on screen (confirmed by
    // reading the actual markup, not just suspected — fixed here rather
    // than converted as-is).
    confirmOverlay.className = 'qr-confirm-overlay';
    confirmOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:flex-end;justify-content:center;';
    confirmOverlay.innerHTML = `
      <div style="background:var(--cream-white);border-radius:var(--radius) var(--radius) 0 0;width:100%;max-width:480px;padding:24px;">
        <div style="font-family:serif;font-size:1.1rem;font-weight:700;color:var(--espresso);margin-bottom:4px;">✅ Reservation found</div>
        <div style="font-size:0.85rem;color:var(--text-body);margin-bottom:16px;line-height:1.6;">
          <strong>${r.userName}</strong> · ${r.offeringName}<br>
          🕐 ${r.slot} · Ref: <code>${ref}</code>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-ghost" style="flex:1;" data-onclick="closeQrConfirmOverlay">Cancel</button>
          <button class="btn-espresso" style="flex:2;" data-onclick="confirmCollected" data-args='${dataArgs([reservationId, bakeryName])}'>✓ Mark as collected</button>
        </div>
      </div>`;
    document.body.appendChild(confirmOverlay);
    confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) confirmOverlay.remove(); });

  } catch(e) { showToast('Could not look up reservation'); console.error(e); }
}

function closeQrConfirmOverlay(el) {
  el.closest('.qr-confirm-overlay')?.remove();
}

async function confirmCollected(reservationId, bakeryName, btn) {
  btn.disabled = true; btn.textContent = 'Saving…';
  await markCollected(reservationId, bakeryName);
  btn.closest('.qr-confirm-overlay')?.remove();
}

registerActions({
  closeQRScanner, closeExpandedQR, openQRScanner, expandQR,
  closeQrConfirmOverlay, confirmCollected,
});
