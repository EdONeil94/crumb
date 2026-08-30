// ─── AUTH MODAL ──────────────────────────────────────────────────────────────
// Sign-in/sign-up modal (pages/components carving, Phase 1 step 6 — see
// CLAUDE.md). Fully self-contained — no dependency on any not-yet-extracted
// cluster, unlike nav.js's showPage(): only touches fb (appState.js),
// showToast (utils/dom.js), and lockScroll/unlockScroll (utils/dom.js), all
// already extracted. openAuthModal()/closeAuthModal() are called as plain
// JS functions from many places throughout legacy-app.js (e.g.
// `if (!currentUser) { openAuthModal(); return; }`, plus a keydown
// Escape-key listener for closeAuthModal()) — legacy-app.js imports them
// back from here for that, same ordinary one-way dependency direction as
// any other extracted module, not circular.

import { registerActions } from '../events/actions.js';
import { fb } from '../state/appState.js';
import { showToast, lockScroll, unlockScroll } from '../utils/dom.js';

export function openAuthModal() {
  switchAuthTab('signin'); // always open on the sign-in view, not a stale sub-view
  document.getElementById('authModal').classList.add('open');
  lockScroll();
}
export function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
  unlockScroll();
}
export function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-tab')[tab === 'signin' ? 0 : 1].classList.add('active');
  document.getElementById('signinForm').style.display = tab === 'signin' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('forgotForm').style.display = 'none';
  document.getElementById('authError').style.display = 'none';
}

// Forgot-password is a sub-view of the "Sign in" tab, not a third tab.
export function openForgotPassword() {
  document.getElementById('signinForm').style.display = 'none';
  document.getElementById('signupForm').style.display = 'none';
  document.getElementById('forgotForm').style.display = 'block';
  document.getElementById('authError').style.display = 'none';
  const msg = document.getElementById('forgotMsg');
  msg.style.display = 'none';
  document.getElementById('forgotEmail').value = document.getElementById('authEmail').value || '';
}
export function backToSignIn() { switchAuthTab('signin'); }

export async function sendResetEmail() {
  const email = document.getElementById('forgotEmail').value.trim();
  const btn = document.getElementById('sendResetBtn');
  const msg = document.getElementById('forgotMsg');
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
    // A continue URL is optional here (the reset link itself goes to our
    // custom action URL — a Firebase Console setting, not this argument);
    // it just gives the email a "return to Crumbz" link.
    await fb.sendPasswordResetEmail(fb.auth, email, { url: window.location.origin + '/', handleCodeInApp: false });
  } catch (err) {
    // Deliberately swallow auth/user-not-found etc. — never confirm or deny
    // whether an account exists (matches Firebase's own enumeration
    // protection). Only surface genuine transport-level failures.
    if (err.code === 'auth/too-many-requests') {
      msg.textContent = 'Too many attempts — please wait a few minutes and try again.';
      msg.style.color = '#c0392b';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = original;
      return;
    }
    console.warn('sendPasswordResetEmail:', err.code || err);
  }
  msg.textContent = "If an account exists for that email, we've sent a reset link. Check your inbox.";
  msg.style.color = 'var(--text-muted)';
  msg.style.display = 'block';
  btn.textContent = original;
  btn.disabled = false;
}

export async function signInGoogle() {
  try {
    await fb.signInWithPopup(fb.auth, fb.googleProvider);
    closeAuthModal();
    showToast('Welcome to Crumbz! 🥐');
  } catch (err) {
    showAuthError(err.message);
  }
}

export async function signInEmail() {
  const email = document.getElementById('authEmail').value;
  const pw = document.getElementById('authPassword').value;
  try {
    await fb.signInWithEmailAndPassword(fb.auth, email, pw);
    closeAuthModal();
    showToast('Welcome back!');
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
  }
}

export async function signUpEmail() {
  const name = document.getElementById('authName').value;
  const email = document.getElementById('authEmailSignup').value;
  const pw = document.getElementById('authPasswordSignup').value;
  try {
    const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, pw);
    if (name) await fb.updateProfile(cred.user, { displayName: name });
    closeAuthModal();
    showToast('Welcome to Crumbz! 🥐');
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
  }
}

export function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.style.display = 'block';
}
export function friendlyAuthError(code) {
  const map = {
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account with that email.',
    'auth/email-already-in-use': 'That email is already registered.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email.',
    'auth/expired-action-code': 'This reset link has expired. Request a new one below.',
    'auth/invalid-action-code': 'This reset link is invalid or has already been used. Request a new one below.',
    'auth/missing-password': 'Please enter a password.',
    'auth/requires-recent-login': 'Please sign out and sign back in, then try again.',
    'auth/too-many-requests': 'Too many attempts — please wait a few minutes and try again.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

registerActions({
  openAuthModal, closeAuthModal, switchAuthTab, signInGoogle, signInEmail, signUpEmail,
  openForgotPassword, backToSignIn, sendResetEmail,
});
