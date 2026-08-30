// ─── DOM / UI UTILITIES ─────────────────────────────────────────────────────
// Extracted as-is from src/legacy-app.js (pages/components carving,
// Phase 0 step 2 — see CLAUDE.md). lockScroll/unlockScroll's scrollY was a
// module-level `let` in the original file but is verified private to these
// two functions only — kept as private module state here, not promoted to
// the shared appState.js store.

let scrollY = 0;

export function lockScroll() {
  scrollY = window.scrollY;
  document.body.style.top = `-${scrollY}px`;
  document.body.classList.add('scroll-locked');
}

export function unlockScroll() {
  document.body.classList.remove('scroll-locked');
  document.body.style.top = '';
  window.scrollTo(0, scrollY);
}

export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

export function timeAgo(date) {
  const s = Math.round((Date.now() - date) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  if (s < 604800) return Math.round(s / 86400) + 'd ago';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
