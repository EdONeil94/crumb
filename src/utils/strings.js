// ─── STRING UTILITIES ───────────────────────────────────────────────────────
// Extracted as-is from src/legacy-app.js (pages/components carving,
// Phase 0 step 2 — see CLAUDE.md).

export function escJS(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
}
