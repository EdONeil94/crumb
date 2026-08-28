// ─── HOME PAGE ──────────────────────────────────────────────────────────────
// The #page-home routed view — "Discover" (pages/components carving,
// Phase 7 step 28 — see CLAUDE.md). Just two render helpers: updateStats
// (the hero stat counters) and renderRecentGrid (the recent-bakes grid).
//
// Neither is reached from markup — there's no showPage('home') branch and
// no data-onclick/data-onchange for either. They render as a side effect
// of loadData() (on auth) and saveReview() (after a write), both of which
// stay in legacy-app.js (loadData deferred to step 29) and import these
// back one-way. cardHTML is imported one-way from components/reviewCard.js
// (extracted step 12); every other dependency is just allItems.

import { allItems } from '../state/appState.js';
import { cardHTML } from '../components/reviewCard.js';

export function updateStats() {
  document.getElementById('statItems').textContent = allItems.length;
  const bakeries = new Set(allItems.map(i => i.bakeryName).filter(Boolean));
  document.getElementById('statBakeries').textContent = bakeries.size;
  const raters = new Set(allItems.map(i => i.userId).filter(Boolean));
  document.getElementById('statRaters').textContent = raters.size;
}

export function renderRecentGrid() {
  const grid = document.getElementById('recentGrid');
  if (!allItems.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🥐</div><div class="empty-state-title">Nothing here yet</div><div class="empty-state-text">Be the first to log a pastry and start the community.</div></div>`;
    return;
  }
  grid.innerHTML = allItems.slice(0, 9).map(item => cardHTML(item)).join('');
}
