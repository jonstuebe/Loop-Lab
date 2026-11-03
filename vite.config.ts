import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built game works from any sub-path (e.g. GitHub Pages).
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    // three.js alone is ~550 kB minified; that's expected for this game.
    chunkSizeWarningLimit: 800,
  },
});
