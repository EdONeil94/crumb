// ─── HOME PAGE ──────────────────────────────────────────────────────────────
// The #page-home routed view — "Discover" (pages/components carving,
// Phase 7 step 28 — see CLAUDE.md). Just two render helpers: updateStats
// (the hero stat counters) and renderRecentGrid (the recent-bakes grid).
//
// Neither is reached from user-facing markup — there's no showPage('home')
// branch and no data-onclick/data-onchange for either. They render as a
// side effect of loadData() (on auth) and saveReview() (after a write).
// saveReview (legacy-app.js) imports them one-way; loadData (moved to
// appState.js at Phase 1 residual #2) reaches them via getAction() — a
// leaf module can't import a page back — so both register here purely for
// that lookup. cardHTML is imported one-way from components/reviewCard.js
// (extracted step 12); every other dependency is just allItems.

import { registerActions } from '../events/actions.js';
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

// Registered for appState.js's loadData() getAction() lookup only — neither
// has a data-onclick/data-onchange call site.
registerActions({ renderRecentGrid, updateStats });
