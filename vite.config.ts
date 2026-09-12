import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single-file build makes the game trivially hostable anywhere (Vercel, itch.io, a static bucket).
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: "es2022", assetsInlineLimit: 10_000_000 },
});
