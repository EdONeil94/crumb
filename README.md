# Crumbz — Phase 1 (modularized project structure)

This is the first step of moving Crumbz off a single 12,000-line HTML file
and onto a proper, maintainable project structure — **without** rewriting
any actual logic yet. Everything should behave identically to the live
site; only the plumbing around it has changed.

## What actually changed

- **CSS** moved from an inline `<style>` block into `src/styles/main.css`
- **Firebase setup** moved into `src/services/firebase.js`, using the
  `firebase` npm package instead of loading it from a CDN URL
- **All the app's JavaScript logic** moved into `src/legacy-app.js` —
  copied over as-is, not rewritten. It's still one big file on purpose;
  splitting it into proper page/component modules is later work, done
  incrementally so nothing breaks along the way
- **`index.html`** is now much smaller — just the page structure and modal
  markup, with one `<script type="module" src="/src/main.js">` tag instead
  of the old inline scripts

### Why one function list at the bottom of legacy-app.js?

The app's HTML relies heavily on inline handlers like
`onclick="openAddModal()"`. In a classic `<script>` tag, every top-level
`function` automatically becomes available that way. In an ES module (what
Vite uses), that stops being true — so the bottom of `legacy-app.js` has an
auto-generated block that explicitly exposes every function onto `window`,
preserving the exact same behaviour. This was generated mechanically from
the original file, not typed by hand, specifically to avoid missing any of
the 296 functions the HTML depends on.

## Running it locally

```bash
npm install       # first time only
npm run dev        # starts a local dev server with live reload
```

This opens the app in your browser at `http://localhost:5173/crumb/` and
reloads automatically whenever you save a file — no more upload-and-refresh
cycle for testing changes.

## Building for deployment

```bash
npm run build
```

This produces a `dist/` folder containing the final, optimized files ready
to deploy — this is what actually goes to GitHub Pages, not the raw `src/`
files.

```bash
npm run preview    # serve the built dist/ folder locally, to sanity-check
                    # the production build before deploying it for real
```

## Deploying

Since your GitHub Pages site is configured to serve directly from your
repo (not from a `dist/` folder), the deploy step is: build, then copy the
contents of `dist/` into the repo root (or wherever GitHub Pages is
currently pointed), then commit and push.

A slightly nicer long-term option — worth doing once this is stable — is a
GitHub Actions workflow that runs `npm run build` and publishes `dist/`
automatically on every push, so you never have to do this step by hand.
Happy to set that up once you're comfortable with this stage.

## Working on this safely (recommended branch approach)

Since you wanted to keep the live site untouched while this is in
progress:

```bash
git checkout -b phase-1-modularize
# copy these files into your repo, replacing the old index.html and
# removing anything now superseded by src/
git add .
git commit -m "Phase 1: modularize into Vite project structure"
git push -u origin phase-1-modularize
```

Test thoroughly on that branch (locally via `npm run dev`, and by building
+ previewing), and only merge into `main` (which is what GitHub Pages
actually serves) once you're confident everything works exactly as before.

## What's NOT done yet (future phases)

- `legacy-app.js` is still one big file — later sessions will carve it into
  `src/pages/*.js` and `src/components/*.js`, one feature at a time
- No backend/Cloud Functions yet (Phase 2 of the overall plan)
- No React yet (Phase 3, optional)
- No native app wrapper yet (Phase 4)

This phase's whole job was to get you onto real tooling (npm, a bundler,
live reload, a sane file structure) as a safe foundation for everything
after it — without the risk of a big-bang rewrite.
