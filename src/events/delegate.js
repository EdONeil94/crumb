// ─── EVENT DELEGATION ───────────────────────────────────────────────────────
// One listener per event type on `document`, instead of inline onclick/
// onchange/... attributes. Works for both static markup (index.html) and
// markup injected later via innerHTML, since nothing needs re-binding after
// a re-render.
//
// Usage in markup: data-onclick="closeAddModal" (attribute name mirrors the
// onclick="closeAddModal()" it replaces). Args, when needed, go in a JSON
// array on data-args: data-onclick="reserveOffering" data-args='["abc123"]'.
//
// A single element can chain multiple actions with a comma-separated list,
// run in order: data-onclick="openFeatureRequestModal,closeMobileMenu"
// replaces onclick="openFeatureRequestModal(); closeMobileMenu();". data-args
// applies only to the LAST action in the list — every earlier one is called
// zero-arg. This matches the recurring "cleanup step(s), then one
// parameterized action" shape (e.g. data-onclick="closeDetailModal,openBakeryProfile"
// data-args='["name"]' replaces onclick="closeDetailModal(); openBakeryProfile('name')").
// Anything that doesn't fit that shape — a *conditional* trailing action, a
// setTimeout delay, more than one action needing its own argument — still
// needs a small named wrapper function registered instead.
//
// click, change, and input are wired up as data-onclick/data-onchange/
// data-oninput. onfocus isn't — there's exactly one onfocus site in the
// whole app, not worth it. The trailing-element argument (see below) is the
// same for every event type: a change/input handler that wants the live
// value reads el.value itself rather than receiving it as a parameter —
// this matters for file inputs in particular, which need the element (for
// .files) rather than its .value.
//
// For args built from runtime data (e.g. a Firestore doc id embedded in a
// template literal, rather than a literal we typed by hand), build the
// attribute value with dataArgs() instead of writing JSON.stringify(...)
// directly — it HTML-attribute-escapes the result so values containing `&`
// or `'` can't break out of the data-args='...' attribute.
//
// The clicked element itself is always appended as a final argument, after
// data-args — this replaces the old onclick="fn(...args, this)" pattern
// (e.g. a button that flips its own class after an action succeeds, instead
// of triggering a full re-render). Functions that don't declare a parameter
// for it are unaffected, since JS silently drops extra arguments.
//
// A nested clickable inside a clickable row (e.g. a bookmark icon inside a
// card that's itself clickable) needs no special handling here: closest()
// below always resolves to the innermost matching element, so only its
// action ever runs — never the outer row's too. That's what the original
// onclick="event.stopPropagation(); ..." handlers were achieving; delegation
// gets it for free.

import { getAction } from './actions.js';

export function dataArgs(args) {
  return JSON.stringify(args).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
}

const ATTR_BY_EVENT = {
  click: 'onclick',
  change: 'onchange',
  input: 'oninput',
};

function readArgs(el) {
  const raw = el.dataset.args;
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[delegate] bad data-args on', el, e);
    return [];
  }
}

function runOne(name, args, el) {
  const fn = getAction(name);
  if (!fn) {
    console.warn(`[delegate] no action registered for "${name}"`);
    return;
  }
  fn(...args, el);
}

function handle(eventType, event) {
  const attr = `data-${ATTR_BY_EVENT[eventType]}`;
  const el = event.target.closest(`[${attr}]`);
  if (!el) return;

  const names = el.dataset[ATTR_BY_EVENT[eventType]].split(',');
  const args = readArgs(el);
  const lastIndex = names.length - 1;
  names.forEach((name, i) => runOne(name, i === lastIndex ? args : [], el));
}

export function initDelegatedEvents(root = document) {
  for (const eventType of Object.keys(ATTR_BY_EVENT)) {
    root.addEventListener(eventType, e => handle(eventType, e));
  }
}
