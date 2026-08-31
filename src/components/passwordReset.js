// ─── PASSWORD RESET LANDING ─────────────────────────────────────────────────
// Handles the #page-reset view. Reached only via initPasswordResetFromUrl(),
// which legacy-app.js calls once on boot: if the URL carries
// ?mode=resetPassword&oobCode=… it routes here and verifies the code.
//
// Firebase's "Customize action URL" (Auth → Templates, a Console setting)
// points at the site root, so every password-reset email link lands on
// https://ohcrumbz.co.uk/?mode=resetPassword&oobCode=…&apiKey=…  — the app
// loads normally, this check runs, and we swap to #page-reset before the
// user sees the home page. The custom action URL is shared by ALL Firebase
// action emails; we only ever send resetPassword, but any other `mode` is
// sent home with a toast rather than mishandled.
//
// verifyPasswordResetCode / confirmPasswordReset are exposed on fb
// (src/services/firebase.js). showPage is reached via getAction() — nav.js
// registers it, and a leaf component never imports nav.js back.

import { registerActions, getAction } from '../events/actions.js';
import { fb, setExplicitSignOut } from '../state/appState.js';
import { showToast } from '../utils/dom.js';
import { openAuthModal, friendlyAuthError } from './authModal.js';

let activeOobCode = null;

const $ = (id) => document.getElementById(id);

function showState(state) {
  ['resetVerifying', 'resetForm', 'resetSuccess', 'resetError'].forEach((s) => {
    const el = $(s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}

// Strip the action params so a back-nav or a copied URL can't replay a
// now-consumed (or in-flight) code.
function stripUrlParams() {
  try {
    window.history.replaceState(null, '', window.location.pathname);
  } catch { /* non-critical */ }
}

export function initPasswordResetFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  if (!mode && !oobCode) return; // normal load — nothing to do

  if (mode !== 'resetPassword' || !oobCode) {
    // Custom action URL also catches verifyEmail / recoverEmail — we don't
    // send those. Bail to home rather than showing a broken reset page.
    stripUrlParams();
    if (mode) showToast('That link isn’t supported here.');
    return;
  }

  getAction('showPage')('reset');
  showState('resetVerifying');

  fb.verifyPasswordResetCode(fb.auth, oobCode)
    .then((email) => {
      activeOobCode = oobCode;
      const emailEl = $('resetEmail');
      if (emailEl) emailEl.textContent = email;
      showState('resetForm');
    })
    .catch((err) => {
      activeOobCode = null;
      $('resetErrorText').textContent = friendlyAuthError(err.code);
      showState('resetError');
    })
    .finally(stripUrlParams);
}

export async function submitNewPassword() {
  const newPw = $('resetNew').value;
  const confirmPw = $('resetConfirm').value;
  const msg = $('resetFormMsg');
  const btn = $('resetSubmitBtn');
  const fail = (text) => { msg.textContent = text; msg.style.display = 'block'; };
  msg.style.display = 'none';

  if (newPw.length < 6) return fail('Password must be at least 6 characters.');
  if (newPw !== confirmPw) return fail('Passwords don’t match.');
  if (!activeOobCode) return fail('This reset session has expired — request a new link.');

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Saving…';
  try {
    await fb.confirmPasswordReset(fb.auth, activeOobCode, newPw);
    activeOobCode = null;
    // If this browser happened to be signed in (they reset their own
    // password while logged in), drop that session so "sign in with the new
    // password" is the clean, only path forward. Mark it explicit so the
    // auth listener doesn't treat it as an involuntary session end and yank
    // them off this success screen with a toast + re-auth modal.
    if (fb.auth.currentUser) {
      setExplicitSignOut(true);
      try { await fb.signOut(fb.auth); } catch { /* fine */ }
    }
    showState('resetSuccess');
  } catch (err) {
    if (err.code === 'auth/expired-action-code' || err.code === 'auth/invalid-action-code') {
      activeOobCode = null;
      $('resetErrorText').textContent = friendlyAuthError(err.code);
      showState('resetError');
    } else {
      fail(friendlyAuthError(err.code));
      btn.disabled = false;
      btn.textContent = original;
    }
  }
}

export function goToSignIn() {
  const email = $('resetEmail')?.textContent || '';
  getAction('showPage')('home');
  openAuthModal();
  if (email) document.getElementById('authEmail').value = email;
}

export async function requestNewResetLink() {
  const email = $('resetResendEmail').value.trim();
  const msg = $('resetResendMsg');
  const btn = $('resetResendBtn');
  if (!email) {
    msg.textContent = 'Please enter your email.';
    msg.style.color = '#c0392b';
    msg.style.display = 'block';
    return;
  }
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Sending…';
  try {
    await fb.sendPasswordResetEmail(fb.auth, email, { url: window.location.origin + '/', handleCodeInApp: false });
  } catch (err) {
    if (err.code === 'auth/too-many-requests') {
      msg.textContent = friendlyAuthError(err.code);
      msg.style.color = '#c0392b';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = original;
      return;
    }
    console.warn('sendPasswordResetEmail (resend):', err.code || err);
  }
  msg.textContent = "If an account exists for that email, we've sent a new link.";
  msg.style.color = 'var(--text-muted)';
  msg.style.display = 'block';
  btn.textContent = original;
  btn.disabled = false;
}

registerActions({ submitNewPassword, goToSignIn, requestNewResetLink });
