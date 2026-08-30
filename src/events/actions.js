// ─── ACTION REGISTRY ────────────────────────────────────────────────────────
// Replaces `window[name]` lookups for markup-driven event handlers. A handler
// attribute (e.g. data-onclick="closeAddModal") names an entry here instead
// of relying on the WINDOW EXPORTS global. Functions register themselves via
// registerActions() from wherever they're defined — for now that's still
// legacy-app.js, but once functions move into real feature modules they can
// import registerActions() and register directly, with no global needed.

const registry = Object.create(null);

export function registerActions(map) {
  for (const [name, fn] of Object.entries(map)) {
    if (typeof fn !== 'function') {
      console.warn(`[actions] "${name}" is not a function — skipped`);
      continue;
    }
    registry[name] = fn;
  }
}

export function getAction(name) {
  return registry[name];
}
