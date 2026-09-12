// Render the published artifact file exactly as the Artifact host wraps it.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const body = readFileSync("/root/artifact/openrts.html", "utf8");
const page_html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#faf9f7}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>${body}</body></html>`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
page.on("console", (m) => m.type() === "error" && errs.push("CONSOLE: " + m.text()));
await page.setContent(page_html, { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.evaluate(() => { window.game.start("none"); });
await page.waitForTimeout(1200);
await page.screenshot({ path: "test/shot-artifact-started.png" });
const state = await page.evaluate(() => {
  const c = document.getElementById("game");
  const g = window.game;
  return { hasCanvas: !!c, w: c?.width, h: c?.height, zoom: g.cam.zoom, camx: g.cam.x, camy: g.cam.y,
           viewW: g.cam.viewW, viewH: g.cam.viewH, scale: g.cam.scale, mapv: g.world.map.version, dpr: window.devicePixelRatio };
});
console.log(JSON.stringify(state), errs.length ? errs.slice(0, 5) : "no errors");
await page.screenshot({ path: "test/shot-artifact.png" });
await browser.close();
