/**
 * The world outlives the people in it.
 *
 * Three claims, and the third is the one that makes it a persistent world
 * rather than a long match: a client can join and be given a town; the town
 * keeps existing after that client disconnects; and the whole world -- towns,
 * ground, clock -- survives the server process being killed and started again.
 */
import { WebSocket } from "ws";
import { spawn } from "node:child_process";
import { rmSync, existsSync } from "node:fs";

const PORT = 8799;
const DIR = "server/testdata";
rmSync(DIR, { recursive: true, force: true });

const start = () =>
  spawn("node", ["server/dist/main.mjs"], { env: { ...process.env, PORT: String(PORT), WORLD_DIR: DIR }, stdio: "ignore" });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const health = async () => (await fetch(`http://localhost:${PORT}/health`)).json();

const join = (name, token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const timer = setTimeout(() => reject(new Error("no welcome")), 12000);
    ws.on("open", () => ws.send(JSON.stringify({ t: "join", name, token })));
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      if (m.t !== "welcome") return;
      clearTimeout(timer);
      resolve({ ws, welcome: m });
    });
    ws.on("error", reject);
  });

let srv = start();
await wait(2500);

// 1. Two players join and are each given a town.
const a = await join("Ari", null);
const b = await join("Friend", null);
console.log(`Ari is seat ${a.welcome.player}, Friend is seat ${b.welcome.player}, world ${a.welcome.map.width}x${a.welcome.map.height}`);

// Ari's town should be in the world: ask for a snapshot of where he is.
a.ws.send(JSON.stringify({ t: "watch", x: 0, y: 0, w: 400, h: 400 }));
const snap = await new Promise((resolve) => {
  a.ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t === "snap") resolve(m);
  });
});
const mine = snap.buildings.filter((x) => x.owner === a.welcome.player);
console.log(`Ari's town: ${mine.length} building(s), ${snap.units.filter((u) => u.owner === a.welcome.player).length} people`);

// 2. He leaves. The world carries on without him.
const tickAtLeave = (await health()).tick;
a.ws.close();
b.ws.close();
await wait(3000);
const after = await health();
console.log(`he left at tick ${tickAtLeave}; the world is at ${after.tick} with ${after.towns} towns still standing`);

// 3. Kill the server outright and start it again.
srv.kill("SIGINT");
await wait(2500);
srv = start();
await wait(3500);
const reborn = await health();
console.log(`after a restart: tick ${reborn.tick}, ${reborn.towns} towns`);

// And Ari gets HIS town back, not a new one.
const again = await join("Ari", a.welcome.token);
console.log(`Ari returned to seat ${again.welcome.player}`);
again.ws.close();
srv.kill("SIGINT");
await wait(800);

const fail = [];
if (a.welcome.player === b.welcome.player) fail.push("two players were given the same town");
if (mine.length < 1) fail.push("a new player was not given a town");
if (!(after.tick > tickAtLeave)) fail.push("the world stopped when nobody was watching");
if (after.towns !== 2) fail.push(`towns vanished when their owners left (${after.towns})`);
if (!(reborn.tick >= tickAtLeave)) fail.push(`the world forgot its clock across a restart (${reborn.tick})`);
if (reborn.towns !== 2) fail.push(`the world forgot its towns across a restart (${reborn.towns})`);
if (again.welcome.player !== a.welcome.player) fail.push(`a returning player got a different town (${again.welcome.player} not ${a.welcome.player})`);
if (fail.length) { console.log("FAIL: " + fail.join("; ")); process.exit(1); }
console.log("PASS: towns are founded, outlive their owners, and survive the server being killed");
