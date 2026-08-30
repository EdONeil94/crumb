import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths (./assets/…) so the same build works whatever URL
  // the site is served from — the custom domain https://crumbz.lol/
  // (served at the root) AND the legacy https://edoneil94.github.io/crumb/
  // project-pages URL (served under /crumb/). index.html is always at the
  // site root in both cases, so ./assets/ resolves correctly either way.
  // (Was '/crumb/' — an absolute prefix that only worked for the github.io
  // URL and would 404 every asset on the custom domain.)
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    open: true, // auto-opens the browser when you run `npm run dev`
  },
});
