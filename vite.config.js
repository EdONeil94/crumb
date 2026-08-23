import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves this project at https://edoneil94.github.io/crumb/,
  // so all built asset paths need this prefix or they'll 404 once deployed.
  base: '/crumb/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    open: true, // auto-opens the browser when you run `npm run dev`
  },
});
