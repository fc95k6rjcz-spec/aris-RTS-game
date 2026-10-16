// Naming your King: pressing Enter the Realm brings up the name box at once,
// the name goes into the shared world (so everyone sees it), it is cleaned up,
// remembered for next time, and shown above the King and in his panel.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

// ── the simulation: the command, the cleaning, and the save ──
const out = await build({ stdin: { contents: `export * from "./src/sim/world"; export * from "./src/game/saveGame";`, resolveDir: ".", loader: "ts" }, bundle: true, write: false, platform: "node", format: "esm", logLevel: "error", external: ["@supabase/supabase-js"] });
const M = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
assert.equal(M.cleanKingName("  Ari \n  the\tBold  "), "Ari the Bold");
assert.equal(M.cleanKingName("x".repeat(40)).length, M.KING_NAME_MAX);
const w = new M.World(32, 32, 7, "plains", 1, false);
w.addPlayer(1, "human", "#36c");
w.step([{ type: "nameKing", player: 1, name: "  Justin   the Wise " }]);
assert.equal(w.players.get(1).kingName, "Justin the Wise");
const back = await M.unpackSave(await M.packSave(M.encodeSave({ version: 1, world: w, map: { id: "t" }, player: 1, multiplayer: true, setup: null, difficulty: "none", ai: null, camera: { x: 0, y: 0, zoom: 1 }, selected: [] })));
assert.equal(back.world.players.get(1).kingName, "Justin the Wise", "name survives a save");
w.step([{ type: "nameKing", player: 1, name: "   " }]);
assert.equal(w.players.get(1).kingName, undefined, "blank name clears it");

// ── the game, as a player uses it ──
// Served from a made-up address (not setContent) so the page has localStorage.
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
await ctx.route(/supabase/, (r) => r.abort()); // stay out of the real shared realm
await ctx.route("http://game.test/", (r) => r.fulfill({ contentType: "text/html", body: html }));
const BOX = "input[aria-label=\"Your King's name\"]";
async function toNameBox(page) {
  await page.goto("http://game.test/");
  await page.waitForFunction(() => !!window.game);
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForSelector(BOX, { timeout: 3000 });
}

const page = await ctx.newPage();
await toNameBox(page);
assert.equal(await page.evaluate(() => window.game.menu), true, "the box comes up before the realm");
// An empty name does not start the game.
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
assert.equal(await page.evaluate(() => window.game.menu), true, "an empty name does not start the game");
// Typing "s" or "w" goes into the box, not the menu behind it.
await page.keyboard.type("Ari the Swift");
await page.screenshot({ path: "test/shot-king-name.png" });
await page.keyboard.press("Enter");
await page.waitForFunction(() => !window.game.menu, null, { timeout: 30000 });
await page.waitForFunction(() => window.game.world.players.get(window.game.player)?.kingName === "Ari the Swift", null, { timeout: 20000 });
assert.equal(await page.evaluate(() => localStorage.getItem("rov-king-name")), "Ari the Swift", "remembered for next time");
// Crown him on the spot and check the label draws.
await page.evaluate(() => { const g = window.game; const u = g.world.units().find((x) => x.owner === g.player); u.def = "king"; g.cam.centerOn(u.pos.x, u.pos.y); g.selected = new Set([u.id]); });
await page.waitForTimeout(800);
await page.screenshot({ path: "test/shot-king-label.png" });
await page.close();

// Next visit: the box is already filled in, and Escape backs out.
const again = await ctx.newPage();
await toNameBox(again);
assert.equal(await again.inputValue(BOX), "Ari the Swift", "last name filled in");
await again.keyboard.press("Escape");
assert.equal(await again.locator(BOX).count(), 0, "Escape closes the box");
assert.equal(await again.evaluate(() => window.game.menu), true, "and stays on the menu");
await browser.close();
console.log("PASS: name box on Enter the Realm, name shared through the ledger, cleaned, saved, remembered, shown");
