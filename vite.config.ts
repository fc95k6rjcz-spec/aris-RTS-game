import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single-file build makes the game trivially hostable anywhere (Vercel, itch.io, a static bucket).
/**
 * Which build this is. Every computer in a shared realm must run exactly the
 * same game, tick for tick, so the realm channel is named after the build:
 * an old copy left open in a tab can never sit in a realm with a newer one.
 */
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "dev").slice(0, 7);

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [viteSingleFile()],
  build: { target: "es2022", assetsInlineLimit: 10_000_000 },
});
