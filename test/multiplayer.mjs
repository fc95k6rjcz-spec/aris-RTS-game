/**
 * Two machines, one match.
 *
 * The claim lockstep rests on is that both sides compute identical state from
 * identical orders. This is the test that actually puts two clients in a room
 * over the real network and checks it: one hosts, one joins, both are driven
 * with orders, and at the end their worlds must hash to the same number.
 *
 * Two browser pages rather than two tabs of one: they share nothing but the
 * Supabase channel, which is exactly the situation two houses are in.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe" });

const open = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.setContent(html);
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => {
    const g = window.game;
    g.settingsForTest.wildlife = false;
    g.settingsForTest.edgeScroll = false;
    g.settingsForTest.crowning = false;
    g.settingsForTest.stockade = false;
    g.settingsForTest.mapId = "lakeland-7927";
  });
  return { page, errs };
};

try {
const a = await open();
const b = await open();

// Host, and read the code off the lobby.
await a.page.evaluate((coop) => { const g=window.game; if(coop) void g.openRoom({...g.proposal(),mode:'coop',aiDifficulty:'normal'}); else g.hostForTest(); }, process.env.COOP === '1');
const code = await a.page.waitForFunction(() => {
  const c = window.game.frontNetForTest.code;
  return c && c.length === 4 ? c : null;
}, null, { timeout: 20000 }).then((h) => h.jsonValue());
console.log("room code:", code);

await b.page.evaluate((c) => window.game.joinForTest(c), code);

try { await a.page.waitForFunction(() => !!window.game.front.net.ready, null, {timeout:25000}); }
catch(error){console.log('Lobby diagnostics',await a.page.evaluate(()=>window.game.frontNetForTest),await b.page.evaluate(()=>window.game.frontNetForTest),a.errs,b.errs);throw error;}
await a.page.evaluate(() => window.game.runFront({kind:'startRoom'}));
// Both must leave the menu and land in a match.
for (const p of [a, b]) await p.page.waitForFunction(() => window.game.menu === false, null, { timeout: 25000 });
const seats = await Promise.all([a, b].map((p) => p.page.evaluate(() => window.game.player)));
console.log("seats:", seats.join(" and "));
if(process.env.COOP === '1') for(const p of [a,b]) { const ok=await p.page.evaluate(()=>{const g=window.game;return g.world.allied(1,2)&&!g.world.allied(1,3)&&g.world.units().some(u=>u.owner===3)&&!!g.ai;});if(!ok)throw new Error('Co-op setup did not reach both players'); }

for(const p of [a,b]) {
  const visible=await p.page.evaluate(()=>{const g=window.game;const own=g.world.units().find(u=>u.owner===g.player);return own&&g.world.canSee(g.player,own.pos.x,own.pos.y);});
  if(!visible)throw new Error('Starting army is hidden by fog');
}
const before = await Promise.all([a,b].map(p=>p.page.evaluate(()=>{const g=window.game;return g.world.units().filter(u=>u.owner===g.player).slice(0,2).map(u=>({id:u.id,x:u.pos.x,y:u.pos.y}));})));
// Drive both sides: each orders its own units about, and both step in step.
const drive = async (p, seat) => p.page.evaluate((s) => {
  const g = window.game, w = g.world;
  const mine = [...w.entities.values()].filter((e) => e.kind === "unit" && e.owner === s).sort((x, y) => x.id - y.id);
  if (mine[0]) g.issue({ type: "move", player: s, units: [mine[0].id], x: mine[0].pos.x + 260, y: mine[0].pos.y + 90 });
  if (mine[1]) g.issue({ type: "move", player: s, units: [mine[1].id], x: mine[1].pos.x - 200, y: mine[1].pos.y + 60 });
}, seat);

await drive(a, seats[0]);
await drive(b, seats[1]);

// Let real time carry both simulations forward together.
for(const p of [a,b])await p.page.evaluate(()=>{const g=window.game,step=g.tick.bind(g);g.tick=()=>{if(g.world.tick<160)step();};});
for(const p of [a,b])await p.page.waitForFunction(()=>window.game.world.tick===160,null,{timeout:25000});
const moved=await Promise.all([a,b].map((p,i)=>p.page.evaluate(before=>before.some(old=>{const u=window.game.world.entities.get(old.id);return u&&(u.pos.x!==old.x||u.pos.y!==old.y);}),before[i])));
if(!moved.every(Boolean))throw new Error('A player could not move their units');

const state = await Promise.all([a, b].map((p) => p.page.evaluate(() => ({
  tick: window.game.world.tick,
  sum: window.game.world.checksum(),
  net: window.game.netStateForTest,
  seed: window.game.world.seed,
  // A cheap fingerprint of the ground itself: both sides generate their own
  // map and must generate the same one.
  terrain: (() => { let h = 0; const t = window.game.world.map.tiles; for (let i = 0; i < t.length; i += 13) h = (h * 31 + t[i]) >>> 0; return h; })(),
}))));
console.log(`host : seed ${state[0].seed} terrain ${state[0].terrain} tick ${state[0].tick} sum ${state[0].sum} net ${state[0].net}`);
console.log(`guest: seed ${state[1].seed} terrain ${state[1].terrain} tick ${state[1].tick} sum ${state[1].sum} net ${state[1].net}`);
console.log("errors:", [...a.errs, ...b.errs].slice(0, 4));
await browser.close();

const fail = [];
if (state[0].tick < 40) fail.push(`the match barely advanced (${state[0].tick} ticks) -- orders are not getting through`);
if (state[0].net === "desync" || state[1].net === "desync") fail.push("the two worlds diverged");
if (state[0].seed !== state[1].seed) fail.push("the two clients used different seeds");
if (state[0].terrain !== state[1].terrain) fail.push("the two clients generated different maps");
// Compared at the same tick: they run on separate clocks, so the further-ahead
// one is asked what it looked like when it was where the other one is now.
if (state[0].tick === state[1].tick && state[0].sum !== state[1].sum) fail.push(`same tick, different worlds (${state[0].sum} vs ${state[1].sum})`);
if (fail.length) { console.log("FAIL: " + fail.join("; ")); process.exit(1); }
console.log(`PASS: two clients played ${Math.min(state[0].tick, state[1].tick)} ticks of the same match`);

} finally { await browser.close(); }
