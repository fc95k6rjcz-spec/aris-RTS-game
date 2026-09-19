import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: ["src/render/anim.ts"], bundle: true, write: false,
  platform: "node", format: "esm",
});
const { AnimationClock, frameAt, stateFor } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
const unit = (def = "footman") => ({
  def, id: 7, task: { kind: "idle" }, cooldown: 0, engaging: null, carrying: null,
});
const u = unit();
u.task = { kind: "move" };
assert.equal(stateFor(u, false), "idle", "blocked units must not walk in place");
assert.match(stateFor(u, true), /walk|run/);
u.task = { kind: "attackMove" };
assert.equal(stateFor(u, false), "idle", "attack-move alone must not trigger swings");
u.task = { kind: "idle" };
u.engaging = 12;
u.cooldown = 20;
assert.equal(stateFor(u, false), "attack", "automatic retaliation must animate");
const mage = { ...u, def: "mage" };
assert.equal(stateFor(mage, false), "cast");
assert.equal(stateFor({ ...u, def: "priest" }, false), "heal");
const worker = unit("worker");
worker.task = { kind: "gather", phase: "toDrop", resource: "lumber" };
worker.carrying = { resource: "lumber", amount: 10 };
assert.equal(stateFor(worker, false), "idle");
assert.equal(stateFor(worker, true), "carry");
worker.task.phase = "harvest";
assert.equal(stateFor(worker, false), "chop");
assert.equal(stateFor(unit("scout"), true), "fly");
assert.equal(stateFor(unit("longboat"), true), "sail");

const clock = new AnimationClock();
const clip = { srcs: ["start", "middle", "end"], fps: 10, loop: false };
assert.equal(frameAt(clip, clock.elapsed(u, "attack", 300), u.id), "start");
u.cooldown--;
assert.equal(frameAt(clip, clock.elapsed(u, "attack", 300.11), u.id), "middle");
assert.equal(frameAt(clip, clock.elapsed(u, "attack", 301), u.id), "end");
u.cooldown = 20;
assert.equal(frameAt(clip, clock.elapsed(u, "attack", 302), u.id), "start", "repeat attacks restart clips");
assert.equal(clock.elapsed(u, "idle", 303), 0, "state transitions reset time");
assert.equal(clock.elapsed(u, "idle", 303), 0, "paused time stays fixed");
assert.equal(frameAt({ ...clip, loop: true }, 0.31, 0), "start");
console.log("PASS: movement, work, retaliation, casting, healing and action clip timing");
