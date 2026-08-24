#!/usr/bin/env node
// ─── DEAD REFERENCE CHECKER ─────────────────────────────────────────────────
// A pre-flight static check to run before each delegation-migration
// conversion pass on src/legacy-app.js. Catches two distinct bug classes
// found during that migration, both invisible until someone clicks the exact
// broken element:
//
//   1. Calls to functions that no longer exist:
//      a) data-onclick="name"/data-onchange="name" attributes (comma-chains
//         included) whose name isn't registered via registerActions(...) —
//         getAction() silently no-ops these at runtime (just a console.warn),
//         so nothing crashes and nothing visibly fails until you click it.
//      b) A standalone `name(args);` call statement whose `name` doesn't
//         match any function defined or imported in the file — this is
//         exactly the shape of the renderManagePreorders bug (a refactor
//         renamed a function but missed 4 other call sites).
//
//   2. Bare (non-`${}`-interpolated) references to a plain top-level
//      `let`/`const`/`var` binding inside a raw onclick=/onchange=/oninput=
//      attribute. ES module top-level bindings never attach to `window`,
//      unlike this file's functions (see the WINDOW EXPORTS block) — so a
//      raw handler with a bare variable reference (e.g. `currentUser.uid`,
//      `fb.signOut(...)`, `notifItems[i]`) throws a ReferenceError at click
//      time, regardless of whether delegation has touched that handler yet.
//      Found 5 sites broken this way in one pass; a static check is much
//      cheaper than finding these one click at a time.
//
//   3. Bare identifiers referenced inside a registerActions({...}) object
//      literal (shorthand `{ openEditModal }` or an explicit value
//      `{ save: saveHandler }`) that aren't actually defined or imported in
//      that file — evaluating the object literal throws a ReferenceError
//      before registerActions() itself is ever called, which silently halts
//      the rest of that module's top-level execution (and therefore every
//      delegated click handler in the app, not just the broken one). Added
//      2026-08-24 after this exact bug shipped past a clean check:dead-refs
//      + build in Phase 2 step 9 (src/components/editReviewModal.js) and
//      was only caught by a full E2E run — see CLAUDE.md's carving-plan
//      extraction log for that step.
//
// This is a deliberately simple, regex/line-based heuristic check, not a
// real JS parser — it trades some recall for zero new dependencies, a
// sub-second run, and (importantly) a low false-positive rate. It is not a
// substitute for judgement, just a fast first pass before each pass.
//
// Usage: node scripts/check-dead-refs.js [path-to-file...]
// Defaults to index.html + every .js file under src/ (walked recursively —
// see collectDefaultTargets) — extended 2026-08-24 from its original
// src/legacy-app.js-only default specifically because that default was a
// confirmed blind spot during the pages/components carving: a data-onclick
// in index.html (or, going forward, in any src/pages/*.js or
// src/components/*.js file) with no matching registerActions() entry
// passed clean, since the checker never saw it. Exits non-zero if anything
// is flagged, so it can be wired into a pre-commit hook or CI step if
// desired.
//
// Cross-file note: registerActions() names are collected GLOBALLY across
// every .js target before any file is checked (see collectKnownCallableNames
// vs. the registeredActions set in main()) — necessary once more than one
// file can call registerActions() (previously only src/legacy-app.js did,
// so per-file == global and this made no difference). Dead-statement-call
// and bare-variable checks stay correctly per-file, since imports and
// module-scope bindings are genuinely local to whichever file declares them.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Recursively collects every .js file under `dir` (relative to repoRoot),
// returned as repo-relative paths. No glob dependency — keeps this script's
// zero-new-dependencies design intact.
function walkJsFiles(dir) {
  const abs = path.resolve(repoRoot, dir);
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const relPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkJsFiles(relPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(relPath);
    }
  }
  return out;
}

function collectDefaultTargets() {
  return ['index.html', ...walkJsFiles('src')];
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : collectDefaultTargets();

const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof',
  'in', 'of', 'new', 'delete', 'void', 'await', 'yield', 'do', 'else',
  'try', 'finally', 'throw', 'instanceof', 'async', 'super', 'this',
]);

// Built-in JS/Web-API functions this file calls as bare statements (mainly
// timers), plus the handful of third-party globals it calls directly
// (Leaflet's `L`, the QRCode/jsQR libraries). Only needs to cover names that
// can appear as a *standalone* `name(args);` statement (see
// checkDeadStatementCalls) — extend this list rather than fighting false
// positives if the app grows a new one.
const BUILTIN_STATEMENT_CALLS = new Set([
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'alert', 'confirm',
]);

function stripLineComments(src) {
  // Blanks trailing `//` comments (outside strings) so they can't produce
  // false hits, while preserving line breaks so line numbers stay accurate.
  return src.split('\n').map(line => {
    let inStr = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inStr) {
        if (c === '\\') { i++; continue; }
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
    }
    return line;
  }).join('\n');
}

// Every name the runtime could actually resolve a `name(args)` statement
// call to: top-level function/arrow declarations, and anything pulled in
// via `import { a, b } from '...'`. Destructured SDK bindings (Firebase's
// `const { db, doc, getDoc } = fb;`, repeated with different subsets in
// almost every function) are collected too — they're real local bindings,
// just not top-level ones, and treating them as "known" is far safer than
// re-flagging every single one as a false positive. Also covers a dynamic-
// dispatch idiom found in src/events/delegate.js once that file started
// being scanned too (`const fn = getAction(name); ... fn(...args, el);`) —
// a local var initialized from a call expression is never the "renamed and
// forgot to update call sites" bug this checker targets, since declaration
// and usage are always co-located in the same function scope.
function collectKnownCallableNames(src) {
  const names = new Set();
  const patterns = [
    /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/gm,
    /^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/gm,
    /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?[A-Za-z_$][\w$.]*\([^)]*\)\s*;?\s*$/gm,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) names.add(m[1]);
  }
  for (const m of src.matchAll(/^\s*import\s*\{([^}]*)\}\s*from/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.split(' as ').pop().trim();
      if (name) names.add(name);
    }
  }
  for (const m of src.matchAll(/\{\s*([^{}]*)\}\s*=\s*[A-Za-z_$][\w$]*\s*;/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

function collectTopLevelVariables(src) {
  const names = new Set();
  for (const line of src.split('\n')) {
    // `export ` doesn't change window-visibility — only whether other ES
    // modules can import the binding — so an exported `let`/`const`/`var`
    // is exactly as invisible to a raw handler as an unexported one. Missing
    // this prefix meant every single export in src/state/appState.js (all
    // declared `export let ...`) was invisible to this check entirely.
    const m = line.match(/^(?:export\s+)?(let|const|var)\s+([A-Za-z_$][\w$]*)\s*(=|;)/);
    if (m) names.add(m[2]);
  }
  return names;
}

// Names registered via registerActions({ a, b, c }) or registerActions({
// spanning multiple lines }) — this is the actual runtime registry
// data-onclick/data-onchange attributes resolve against (src/events/
// actions.js's getAction()).
function collectRegisteredActionNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/registerActions\(\s*\{([\s\S]*?)\}\s*\)/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(':')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

// Every data-onclick="..."/data-onchange="..." STATIC attribute value
// (comma-chains split into individual names) — skips any built from a
// runtime expression (e.g. data-onclick="${fnName}"), which can't be
// resolved statically. Each entry also carries the source line for
// reporting.
function collectDelegatedActionUsages(src) {
  const usages = [];
  const lines = src.split('\n');
  const attrRe = /data-on(?:click|change|input)="([^"]*)"/g;
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(attrRe)) {
      const value = m[1];
      if (value.includes('${') || value.includes('`')) continue; // dynamic — can't check statically
      for (const name of value.split(',').map(s => s.trim()).filter(Boolean)) {
        usages.push({ line: i + 1, name, context: lines[i].trim().slice(0, 140) });
      }
    }
  }
  return usages;
}

// `registeredActions` is the GLOBAL set collected across every .js target
// (see main()) — not just this file's own registerActions() calls. Needed
// once more than one file can register actions; see the module header
// comment.
function checkDeadDelegatedActions(src, registeredActions) {
  const usages = collectDelegatedActionUsages(src);
  return usages.filter(u => !registeredActions.has(u.name));
}

// Bare identifiers referenced inside a registerActions({ ... }) object
// literal — either as shorthand (`{ openEditModal }`, meaning both the
// registered name AND the function reference) or as an explicit value
// (`{ save: saveHandler }`, where `saveHandler` is the reference that must
// resolve). registerActions() itself only guards against a non-function
// *value* (`typeof fn !== 'function'` → console.warn) — it can't guard
// against the identifier not existing at all, because evaluating the object
// literal throws a ReferenceError before registerActions() is ever called.
// That's a second, distinct dead-reference bug class from
// checkDeadStatementCalls above: this one is a bare identifier used as an
// object-shorthand/value inside a call, not a standalone `name(args);`
// statement — found in practice (Phase 2 step 9, src/components/
// editReviewModal.js, 2026-08-24): a moved function's name stayed behind in
// its old file's registerActions({...}) call as a dangling shorthand
// property, throwing a ReferenceError during module evaluation that
// silently halted the whole file's script execution (and therefore every
// delegated click handler in the app) before initDelegatedEvents() ever
// ran. Neither check:dead-refs nor `npm run build` caught it — only a real
// E2E run did, once auth.setup.js's sign-in click timed out. Checked
// against the same per-file `knownNames` (function/arrow declarations,
// imports, destructured SDK bindings) as checkDeadStatementCalls, since the
// underlying question is identical: "is this identifier actually resolvable
// in this file's scope?"
function checkDeadRegisterActionsRefs(src, knownNames) {
  const findings = [];
  const callRe = /registerActions\(\s*\{([\s\S]*?)\}\s*\)/g;
  for (const m of src.matchAll(callRe)) {
    const inner = m[1];
    const innerStart = m.index + m[0].indexOf('{') + 1;
    let offset = 0;
    for (const rawPart of inner.split(',')) {
      const partStart = innerStart + offset;
      offset += rawPart.length + 1; // +1 accounts for the comma split() ate
      const part = rawPart.trim();
      if (!part) continue;
      const colonIdx = part.indexOf(':');
      const ref = (colonIdx === -1 ? part : part.slice(colonIdx + 1)).trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(ref)) continue; // not a simple identifier (inline fn, spread, etc.) — can't check statically
      if (KEYWORDS.has(ref) || knownNames.has(ref)) continue;
      const refIdx = rawPart.indexOf(ref);
      const absIdx = partStart + (refIdx === -1 ? 0 : refIdx);
      const line = src.slice(0, absIdx).split('\n').length;
      findings.push({ line, name: ref, context: part.slice(0, 140) });
    }
  }
  return findings;
}

// Narrow, line-anchored heuristic: only matches a call that IS the entire
// (trimmed) line — `[await ]name(args);` — which is how the actual
// renderManagePreorders bug looked at every one of its 4 call sites. This
// deliberately misses dead calls embedded inside a larger expression or
// template-literal HTML string (the overwhelming majority of `word(` matches
// in this file are exactly that, and a naive whole-file scan for `word(`
// drowns in false positives from CSS function syntax like var()/rgba()/
// translateX() and English prose like "reviews (${n})" — both far more
// common here than real dead calls).
function checkDeadStatementCalls(src, knownNames) {
  const findings = [];
  const lines = src.split('\n');
  const stmtRe = /^(?:await\s+)?([A-Za-z_$][\w$]*)\(([^;{}]*)\);?$/;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const m = trimmed.match(stmtRe);
    if (!m) continue;
    const name = m[1];
    if (KEYWORDS.has(name) || knownNames.has(name) || BUILTIN_STATEMENT_CALLS.has(name)) continue;
    findings.push({ line: i + 1, name, context: trimmed.slice(0, 140) });
  }
  return findings;
}

// `topLevelVars` is the GLOBAL set collected across every .js target (see
// main()) — not just this file's own top-level bindings. A raw handler's
// bare-variable bug is inherently about window-exposure, which is a
// cross-file question: since state now lives in src/state/appState.js
// rather than solely in src/legacy-app.js, a raw handler anywhere
// referencing e.g. `currentUser` needs checking against appState.js's
// top-level vars too, not just whichever file happens to contain the
// handler itself.
function checkBareVariablesInRawHandlers(src, topLevelVars) {
  const findings = [];
  const attrRe = / on(click|change|input)="((?:[^"\\]|\\.)*)"/g;
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const m of line.matchAll(attrRe)) {
      const attr = m[2];
      for (const varName of topLevelVars) {
        const wordRe = new RegExp(`\\b${varName}\\b`, 'g');
        for (const wm of attr.matchAll(wordRe)) {
          const preceding = attr.slice(0, wm.index).trimEnd();
          if (preceding.endsWith('${')) continue; // safely inside a template-literal interpolation
          findings.push({ line: i + 1, name: varName, context: line.trim().slice(0, 140) });
        }
      }
    }
  }
  return findings;
}

// Best-effort, informational only: flags a simple (non-destructured)
// parameter that never appears again in its own function body. Skipped for
// destructured/default-heavy signatures — too easy to false-positive there.
function checkUnusedParams(src) {
  const findings = [];
  const fnRe = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/gm;
  for (const m of src.matchAll(fnRe)) {
    const fnName = m[1];
    const paramsRaw = m[2].trim();
    if (!paramsRaw) continue;
    const params = paramsRaw.split(',').map(p => p.trim().split('=')[0].trim());
    if (params.some(p => !/^[A-Za-z_$][\w$]*$/.test(p))) continue;

    const bodyStart = m.index + m[0].length;
    const body = extractBraceBody(src, bodyStart - 1);
    if (body == null) continue;

    for (const p of params) {
      const useRe = new RegExp(`\\b${p}\\b`, 'g');
      const count = (body.match(useRe) || []).length;
      if (count === 0) {
        const line = src.slice(0, m.index).split('\n').length;
        findings.push({ line, name: p, context: `function ${fnName}(${paramsRaw})` });
      }
    }
  }
  return findings;
}

// src[openBraceIdx] must be '{'. Returns the substring between the matching
// braces (exclusive), or null if unbalanced (shouldn't happen in valid JS,
// but this script has no real parser to fall back on).
function extractBraceBody(src, openBraceIdx) {
  let depth = 0;
  for (let i = openBraceIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(openBraceIdx + 1, i);
    }
  }
  return null;
}

function main() {
  let exitCode = 0;

  // Pass 1: read every target once, and build the two GLOBAL sets
  // (registered actions, top-level vars) that checkDeadDelegatedActions and
  // checkBareVariablesInRawHandlers need — see their own comments for why
  // these must be cross-file rather than per-target. Sources are cached so
  // pass 2 doesn't re-read/re-strip anything.
  const sourcesByTarget = new Map();
  const registeredActions = new Set();
  const topLevelVars = new Set();
  for (const target of targets) {
    const abs = path.resolve(repoRoot, target);
    const raw = readFileSync(abs, 'utf8');
    const src = stripLineComments(raw);
    sourcesByTarget.set(target, src);
    for (const name of collectRegisteredActionNames(src)) registeredActions.add(name);
    for (const name of collectTopLevelVariables(src)) topLevelVars.add(name);
  }

  // Pass 2: check each target against the global sets above, plus its own
  // local knownNames (imports/local declarations — genuinely per-file).
  for (const target of targets) {
    const src = sourcesByTarget.get(target);
    const knownNames = collectKnownCallableNames(src);

    const deadActions = checkDeadDelegatedActions(src, registeredActions);
    const deadRegisterActionsRefs = checkDeadRegisterActionsRefs(src, knownNames);
    const deadStatementCalls = checkDeadStatementCalls(src, knownNames);
    const bareVars = checkBareVariablesInRawHandlers(src, topLevelVars);
    const unusedParams = checkUnusedParams(src);

    console.log(`\n${target}`);
    console.log('='.repeat(target.length));

    if (deadActions.length) {
      exitCode = 1;
      console.log(`\n[dead data-onclick/data-onchange] ${deadActions.length} name(s) not registered via registerActions — getAction() will silently no-op these:`);
      for (const f of deadActions) {
        console.log(`  ${target}:${f.line}  "${f.name}"  —  ${f.context}`);
      }
    } else {
      console.log('\n[dead data-onclick/data-onchange] none found.');
    }

    if (deadRegisterActionsRefs.length) {
      exitCode = 1;
      console.log(`\n[dead registerActions() reference] ${deadRegisterActionsRefs.length} identifier(s) inside a registerActions({...}) call aren't defined/imported in this file — evaluating the object literal throws a ReferenceError before registerActions() is ever called, silently halting the rest of this module's execution:`);
      for (const f of deadRegisterActionsRefs) {
        console.log(`  ${target}:${f.line}  '${f.name}'  —  ${f.context}`);
      }
    } else {
      console.log('\n[dead registerActions() reference] none found.');
    }

    if (deadStatementCalls.length) {
      exitCode = 1;
      console.log(`\n[dead statement calls] ${deadStatementCalls.length} standalone call(s) whose function isn't defined/imported anywhere:`);
      for (const f of deadStatementCalls) {
        console.log(`  ${target}:${f.line}  ${f.context}`);
      }
    } else {
      console.log('\n[dead statement calls] none found.');
    }

    if (bareVars.length) {
      exitCode = 1;
      console.log(`\n[bare variables in raw handlers] ${bareVars.length} site(s) reference a module-scope variable directly — these throw ReferenceError at click time, since only functions (WINDOW EXPORTS) are re-attached to window:`);
      for (const f of bareVars) {
        console.log(`  ${target}:${f.line}  bare '${f.name}'  —  ${f.context}`);
      }
    } else {
      console.log('\n[bare variables in raw handlers] none found.');
    }

    if (unusedParams.length) {
      console.log(`\n[unused parameters] ${unusedParams.length} (informational — not a failure; verify before removing, some are kept for call-site symmetry):`);
      for (const f of unusedParams) {
        console.log(`  ${target}:${f.line}  '${f.name}' unused in  ${f.context}`);
      }
    } else {
      console.log('\n[unused parameters] none found.');
    }
  }

  console.log('');
  console.log(exitCode !== 0
    ? 'FAILED — see [dead data-onclick/data-onchange] / [dead registerActions() reference] / [dead statement calls] / [bare variables] above.'
    : 'OK — no dead references or bare-variable scope leaks found.');
  process.exit(exitCode);
}

main();
