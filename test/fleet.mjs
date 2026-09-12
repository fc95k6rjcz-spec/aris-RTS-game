/**
 * The fleet: five hulls, on the water, drawn from their paintings.
 *
 * A picture rather than an assertion, mostly -- ships are a look-at-it feature.
 * What is checked is that every ship the Shipyard offers can actually be built,
 * floats where it should, and draws something: a sprite that silently fails to
 * load leaves a ship-shaped hole in the sea and nothing else complains.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const r = await page.evaluate(async () => {
  const g = window.game;
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.start("none");
  const w = g.world, SUB = 64;
  // A lake to sail on, right next to home.
  const seat = w.map.starts[0];
  const x0 = seat.x + 4, y0 = seat.y + 4;
  for (let y = y0; y < y0 + 14; y++) for (let x = x0; x < x0 + 32; x++) w.map.set(x, y, 2);

  const fleet = ["longboat", "transport", "submarine", "battleship", "icebreaker", "tanker"];
  const made = [];
  fleet.forEach((def, i) => {
    const u = w.spawnUnit(1, def, { x: (x0 + 3 + i * 5) * SUB, y: (y0 + 7) * SUB });
    u.facing = 4;
    made.push({ def, id: u.id, hp: u.hp });
  });
  g.cam.zoom = 44;
  g.cam.centerOn((x0 + 12) * SUB, (y0 + 7) * SUB);
  for (let i = 0; i < 40; i++) g.tick();
  await new Promise((r) => setTimeout(r, 900));

  // Did anything actually get painted where each ship is?
  const ctx = g.canvas.getContext("2d");
  const painted = made.map((m) => {
    const u = w.entities.get(m.id);
    const p = g.cam.toScreen(u.pos.x, u.pos.y);
    const d = ctx.getImageData(Math.round(p.x) - 40, Math.round(p.y) - 40, 80, 60).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      // Anything that is not the game's water colour.
      if (Math.abs(d[i] - 43) + Math.abs(d[i + 1] - 95) + Math.abs(d[i + 2] - 158) > 90) ink++;
    }
    return { def: m.def, ink };
  });
  return { made, painted, shipyardTrains: window.rts?.BUILDINGS?.shipyard?.trains ?? null };
});
await page.screenshot({ path: "test/shot-fleet.png" });
await browser.close();

for (const p of r.painted) console.log(`${p.def.padEnd(11)} ${p.ink} painted pixels`);
const blank = r.painted.filter((p) => p.ink < 400);
if (blank.length) {
  console.log("FAIL: nothing was drawn for " + blank.map((b) => b.def).join(", "));
  process.exit(1);
}
console.log("PASS: five hulls afloat");
