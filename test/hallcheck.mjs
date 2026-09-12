import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 720 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
const out = await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  const p = w.players.get(1);
  const log = [];
  log.push(`start resources: ${p.gold}g ${p.lumber}w — Town Hall costs 400g 250w`);
  // What does the build menu say about it?
  const worker = w.units().find(u => u.def === "worker" && u.owner === 1);
  g.select([worker.id]);
  // Try every nearby tile and report the first error we hit.
  const errors = {};
  let site = null;
  for (let r = 3; r < 14 && !site; r++)
    for (let dy = -r; dy <= r && !site; dy++)
      for (let dx = -r; dx <= r && !site; dx++) {
        const x = 11 + dx, y = 11 + dy;
        const e = w.placementError(1, "townhall", x, y);
        if (e === null) site = [x, y];
        else errors[e] = (errors[e] || 0) + 1;
      }
  log.push(`placement errors seen: ${JSON.stringify(errors)}`);
  log.push(site ? `first legal site: ${site}` : "NO legal site found near the base");
  if (site) {
    g.issue({ type: "build", player: 1, units: [worker.id], building: "townhall", tx: site[0], ty: site[1] });
    for (let i = 0; i < 5; i++) g.tick();
    const placed = w.buildings().filter(b => b.owner === 1 && b.def === "townhall").length;
    log.push(`town halls after order: ${placed} (started with 1)`);
    for (let i = 0; i < 20 * 90; i++) g.tick();
    const done = w.buildings().filter(b => b.owner === 1 && b.def === "townhall" && b.complete).length;
    log.push(`completed town halls: ${done}`);
    log.push(`supply now: ${JSON.stringify(w.supply(1))}`);
  }
  return log;
});
console.log(out.join("\n"));
await browser.close();
