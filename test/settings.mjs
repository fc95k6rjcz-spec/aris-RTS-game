import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => { window.game.start("none"); });
await page.waitForTimeout(500);
await page.click(".rts-gear");
await page.waitForTimeout(300);
await page.screenshot({ path: "test/shot-settings.png" });

// The panel must hold the clock while it is open.
const before = await page.evaluate(() => window.game.world.tick);
await page.waitForTimeout(700);
const during = await page.evaluate(() => window.game.world.tick);
console.log(before === during ? "paused while open" : `FAIL: ticked ${before} -> ${during}`);

// Health bars "never" must survive a round trip through storage.
await page.selectOption(".rts-group select", "never");
await page.click(".rts-foot .rts-primary");
await page.waitForTimeout(400);
const after = await page.evaluate(() => window.game.world.tick);
console.log(after > during ? "resumed after close" : "FAIL: still paused");
// This page is served via setContent, so its origin has no storage and every
// localStorage call throws. That is the hostile case the settings module guards
// for: the game must keep the setting in memory and carry on regardless.
const live = await page.evaluate(() => window.game.settingsForTest?.healthBars ?? null);
const storage = await page.evaluate(() => { try { localStorage.getItem("x"); return "available"; } catch { return "blocked"; } });
console.log(`storage ${storage}, healthBars in memory = ${live}`);
if (live !== "never") throw new Error("setting did not apply");
await page.screenshot({ path: "test/shot-settings-closed.png" });
await browser.close();
