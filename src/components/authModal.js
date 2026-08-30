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
  document.getElementById('authError').style.display = 'none';
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
  const map = { 'auth/wrong-password': 'Incorrect password.', 'auth/user-not-found': 'No account with that email.', 'auth/email-already-in-use': 'That email is already registered.', 'auth/weak-password': 'Password must be at least 6 characters.', 'auth/invalid-email': 'Please enter a valid email.' };
  return map[code] || 'Something went wrong. Please try again.';
}

registerActions({ openAuthModal, closeAuthModal, switchAuthTab, signInGoogle, signInEmail, signUpEmail });
