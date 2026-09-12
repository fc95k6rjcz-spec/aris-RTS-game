/**
 * Surrender, from the pause screen.
 *
 * It lives there and nowhere else on purpose: the pause screen is the one place
 * a player has deliberately stopped and is thinking about whether to go on, and
 * it is two clicks from anything else, so nobody concedes a match by brushing a
 * button mid-fight.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const r = await page.evaluate(async () => {
  const g = window.game;
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.settingsForTest.wildlife = false;
  g.start("normal");
  for (let i = 0; i < 60; i++) g.tick();
  const inGame = !g.menu;

  // Nothing to click while the game is running.
  const hiddenWhileRunning = g.surrenderRectForTest === null || g.paused === false;

  g.setPaused(true);
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const rect = g.surrenderRectForTest;

  // Click it exactly where it is drawn.
  const cv = g.canvas;
  const fire = (type, x, y) => cv.dispatchEvent(new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true }));
  const cx = rect ? rect.x + rect.w / 2 : 0;
  const cy = rect ? rect.y + rect.h / 2 : 0;
  // offsetX/offsetY are what the game reads; synthesise them directly.
  const ev = new MouseEvent("mousedown", { button: 0, bubbles: true });
  Object.defineProperty(ev, "offsetX", { value: cx });
  Object.defineProperty(ev, "offsetY", { value: cy });
  cv.dispatchEvent(ev);

  return { inGame, hiddenWhileRunning, rect: !!rect, backAtMenu: g.menu, winner: g.world.winner, paused: g.paused };
});
await browser.close();

console.log(`in a match: ${r.inGame}; button drawn while paused: ${r.rect}`);
console.log(`after clicking it — back at the menu: ${r.backAtMenu}, winner recorded: ${r.winner}, still paused: ${r.paused}`);

const fail = [];
if (!r.inGame) fail.push("the match never started");
if (!r.rect) fail.push("no Surrender button appeared on the pause screen");
if (!r.backAtMenu) fail.push("surrendering did not return to the main screen");
if (r.winner !== 2) fail.push(`the opponent was not recorded as the winner (got ${r.winner})`);
if (r.paused) fail.push("the game was left paused behind the menu");
if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}
console.log("PASS: you can concede, and it takes you home");
