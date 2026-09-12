import { defineConfig } from "vite";

/**
 * Build for a real web host (Vercel), as opposed to the single-file build.
 *
 * The default build inlines every sprite as a base64 data URL so the game is one
 * self-contained HTML file you can drop anywhere -- which is what the headless
 * tests load, since they have no server to fetch assets from. That is the wrong
 * shape for a hosted site: it is a 9.7MB HTML document with nothing cacheable in
 * it, so every visit re-downloads all the art, and changing one line of code
 * makes the browser fetch the whole lot again.
 *
 * Here the assets stay separate files with hashed names. The browser caches them
 * forever and a code change costs a few kilobytes instead of ten megabytes.
 */
export default defineConfig({
  build: {
    target: "es2022",
    outDir: "dist-web",
    // Only tiny files inline; everything else becomes a cacheable asset.
    assetsInlineLimit: 4096,
  },
});
