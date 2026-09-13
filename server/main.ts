/**
 * The world, and the thing that keeps it turning.
 *
 * One process, one world, running whether or not anybody is looking at it. That
 * is the whole point: a raid launched at four in the afternoon lands at half
 * past seven whether its target is at school, asleep, or watching. Nothing here
 * waits for a player.
 *
 * ── Why an always-on process ──
 *
 * With upgrades measured in hours, almost everything could have been a
 * timestamp in a database and no server at all. That was offered and declined,
 * and this is the honest version of what was asked for instead: a real
 * authoritative simulation, ticking twenty times a second, that clients watch.
 * It costs a machine that never sleeps, and in exchange the world is genuinely
 * live rather than merely arithmetic -- a unit's position at any instant is a
 * fact the server knows, not a formula the client evaluates.
 *
 * ── What it sends ──
 *
 * Not the world. A slice of it: your own things wherever they are, and
 * everything else only near where you are looking. That is what keeps
 * "hundreds of players" a statement about this process rather than about a
 * browser -- a player in the north pays nothing for a war in the south.
 *
 * ── What it remembers ──
 *
 * Everything, to disk, every half minute and on the way out. A world that
 * forgets when the process restarts is not persistent, it is merely long.
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";

import { World, WILD, TICKS_PER_SECOND } from "../src/sim/world";
import { Faction, SUB, type PlayerId } from "../src/sim/types";
import { UNITS } from "../src/data/units";
import { BUILDINGS } from "../src/data/buildings";
import {
  AOI_MARGIN,
  SNAPSHOT_MS,
  type ClientMessage,
  type NetBuilding,
  type NetPlayer,
  type NetUnit,
  type ServerMessage,
} from "./protocol";

const PORT = Number(process.env.PORT ?? 8787);
const SAVE_DIR = process.env.WORLD_DIR ?? path.join(process.cwd(), "server", "data");
const SAVE_FILE = path.join(SAVE_DIR, "world.json");
const SAVE_EVERY_MS = 30_000;

/**
 * How big the world is.
 *
 * Much larger than a skirmish map, and deliberately not "as large as possible":
 * every tile is a byte in several layers and a candidate in every search, and a
 * world nobody can cross is not big, it is empty. Three hundred and eighty-four
 * tiles a side is about fifty-five times the area of a skirmish map and still
 * takes a couple of real hours to walk across, which is the number that
 * actually matters.
 */
const WORLD_SIZE = 384;

/** How many tiles a Town Hall occupies on a side. */
const HALL_SIZE = BUILDINGS.townhall!.size;

/** Milliseconds a tick is worth. The same number the client's loop uses. */
const TICK_MS = 1000 / TICKS_PER_SECOND;

/** Colours handed out to towns in the order they are founded. */
const COLOURS = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7", "#06b6d4",
  "#f97316", "#ec4899", "#14b8a6", "#84cc16", "#8b5cf6", "#f43f5e",
];

interface Town {
  player: PlayerId;
  name: string;
  token: string;
  /** Where this town was founded, so a returning player is put back there. */
  home: { x: number; y: number };
  lastSeen: number;
}

interface Client {
  socket: WebSocket;
  player: PlayerId | null;
  watch: { x: number; y: number; w: number; h: number } | null;
  /** Ids this client has already been told about, so departures can be sent. */
  known: Set<number>;
  lastSnap: number;
}

// ───────────────────────────── the world ─────────────────────────────

let world: World;
let towns = new Map<PlayerId, Town>();
let nextPlayer = 1;

function freshWorld(): World {
  // A big empty continent rather than one of the skirmish layouts: those are
  // shaped for two seats facing each other, which is the wrong shape entirely
  // for somewhere hundreds of towns have to fit.
  const seed = (Math.random() * 0x7fffffff) | 0;
  const w = new World(WORLD_SIZE, WORLD_SIZE, seed, "lakeland", 1, false);
  w.addPlayer(WILD, Faction.Human, "#8a6b3f");
  // The country is not empty. Scaled to the area like everywhere else.
  w.spawnWildlife(Math.round(6 * ((WORLD_SIZE * WORLD_SIZE) / (64 * 64))));
  return w;
}

/**
 * Somewhere to put a new town.
 *
 * Far enough from every existing town that a newcomer is not born inside
 * somebody's borders, and on ground that is actually walkable. Spirals outward
 * from a random point rather than scanning the map, so founding the four
 * hundredth town costs about what founding the fourth did.
 */
function findHome(): { x: number; y: number } | null {
  const taken = [...towns.values()].map((t) => t.home);
  for (let attempt = 0; attempt < 4000; attempt++) {
    const x = 8 + Math.floor(Math.random() * (WORLD_SIZE - 16));
    const y = 8 + Math.floor(Math.random() * (WORLD_SIZE - 16));
    // Ask the map directly whether a hall fits, rather than guessing at a
    // radius. A building's footprint runs from its corner, not around its
    // centre, and a hall is several tiles across -- a hand-rolled check that
    // was a tile short simply failed to place the hall and took the whole
    // connection down with it.
    if (!world.map.canPlace(x, y, HALL_SIZE)) continue;
    // Room to move around it, too: a town wedged into a gap is not a town.
    let clear = true;
    for (let dy = -2; dy <= HALL_SIZE + 2 && clear; dy++)
      for (let dx = -2; dx <= HALL_SIZE + 2; dx++) {
        if (!world.map.inBounds(x + dx, y + dy) || !world.map.isWalkable(x + dx, y + dy, "land")) {
          clear = false;
          break;
        }
      }
    if (!clear) continue;
    if (taken.some((t) => Math.hypot(t.x - x, t.y - y) < 26)) continue;
    return { x, y };
  }
  return null;
}

function foundTown(name: string): Town | null {
  const home = findHome();
  if (!home) return null;
  const player = nextPlayer++ as PlayerId;
  world.addPlayer(player, Faction.Human, COLOURS[(player - 1) % COLOURS.length]!);
  world.spawnStart(player, home.x, home.y);
  const town: Town = { player, name, token: randomBytes(12).toString("hex"), home, lastSeen: Date.now() };
  towns.set(player, town);
  return town;
}

// ───────────────────────────── remembering ─────────────────────────────

function b64(a: Uint8Array | Int32Array): string {
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");
}
function unb64(s: string, into: Uint8Array | Int32Array): void {
  const buf = Buffer.from(s, "base64");
  new Uint8Array(into.buffer, into.byteOffset, into.byteLength).set(buf);
}

function save(): void {
  mkdirSync(SAVE_DIR, { recursive: true });
  const blob = {
    version: 1,
    size: world.map.width,
    seed: world.seed,
    tick: world.tick,
    nextPlayer,
    // The ground, as it stands: felled trees, worn paths, mud and mined-out
    // seams are all things the world has to remember about itself.
    tiles: b64(world.map.tiles),
    amount: b64(world.map.amount),
    wear: b64(world.map.wear),
    mud: b64(world.map.mud),
    felled: b64(world.map.felled),
    towns: [...towns.values()],
    players: [...world.players.values()].map((p) => ({
      id: p.id, gold: p.gold, lumber: p.lumber, oil: p.oil, food: p.food, research: p.research, color: p.color,
    })),
    entities: [...world.entities.values()],
  };
  const tmp = SAVE_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(blob));
  // Written aside and moved into place, so a crash mid-write cannot leave the
  // world as half a file.
  renameSync(tmp, SAVE_FILE);
}

function load(): boolean {
  if (!existsSync(SAVE_FILE)) return false;
  try {
    const blob = JSON.parse(readFileSync(SAVE_FILE, "utf8"));
    world = new World(blob.size, blob.size, blob.seed, "lakeland", 1, false);
    unb64(blob.tiles, world.map.tiles);
    unb64(blob.amount, world.map.amount);
    unb64(blob.wear, world.map.wear);
    unb64(blob.mud, world.map.mud);
    unb64(blob.felled, world.map.felled);
    world.map.version++;

    nextPlayer = blob.nextPlayer;
    towns = new Map(blob.towns.map((t: Town) => [t.player, t]));
    world.players.clear();
    for (const p of blob.players) {
      const created = world.addPlayer(p.id, Faction.Human, p.color);
      created.gold = p.gold;
      created.lumber = p.lumber;
      created.oil = p.oil;
      created.food = p.food ?? 0;
      created.research = p.research ?? {};
    }
    world.entities.clear();
    let maxId = 0;
    for (const e of blob.entities) {
      world.entities.set(e.id, e);
      maxId = Math.max(maxId, e.id);
      if (e.kind === "building") world.map.occupy(e.tx, e.ty, e.size, e.id);
    }
    world.restoreClock(blob.tick, maxId + 1);
    return true;
  } catch (err) {
    console.error("could not read the saved world, starting a new one:", err);
    return false;
  }
}

// ───────────────────────────── talking ─────────────────────────────

const clients = new Set<Client>();

function send(c: Client, m: ServerMessage): void {
  if (c.socket.readyState === 1) c.socket.send(JSON.stringify(m));
}

function describeUnit(u: { id: number; owner: number; def: string; pos: { x: number; y: number }; hp: number; maxHp: number; facing: number; path: unknown[]; task: { kind: string }; carrying: { resource: string } | null }): NetUnit {
  return {
    id: u.id,
    owner: u.owner,
    def: u.def,
    x: u.pos.x,
    y: u.pos.y,
    hp: u.hp,
    maxHp: u.maxHp,
    facing: u.facing,
    moving: u.path.length > 0,
    doing: u.task.kind,
    carrying: u.carrying?.resource ?? null,
  };
}

/**
 * One client's slice of the world.
 *
 * Own things always; everyone else's only where this client is looking. The
 * `gone` list is how a client learns something left -- either it died, or it
 * walked out of view, and from the client's point of view those are the same
 * thing and should be.
 */
function snapshotFor(c: Client): ServerMessage {
  const units: NetUnit[] = [];
  const buildings: NetBuilding[] = [];
  const seen = new Set<number>();
  const w = c.watch;
  const inView = (tx: number, ty: number): boolean =>
    !!w && tx >= w.x - AOI_MARGIN && tx <= w.x + w.w + AOI_MARGIN && ty >= w.y - AOI_MARGIN && ty <= w.y + w.h + AOI_MARGIN;

  for (const e of world.entities.values()) {
    const mine = e.owner === c.player;
    if (e.kind === "unit") {
      const tx = Math.floor(e.pos.x / SUB);
      const ty = Math.floor(e.pos.y / SUB);
      if (!mine && !inView(tx, ty)) continue;
      units.push(describeUnit(e as never));
    } else {
      if (!mine && !inView(e.tx, e.ty)) continue;
      buildings.push({
        id: e.id, owner: e.owner, def: e.def, tx: e.tx, ty: e.ty, size: e.size,
        hp: e.hp, maxHp: e.maxHp, complete: e.complete, progress: e.progress,
      });
    }
    seen.add(e.id);
  }

  const gone: number[] = [];
  for (const id of c.known) if (!seen.has(id)) gone.push(id);
  c.known = seen;

  const players: NetPlayer[] = [...world.players.values()]
    .filter((p) => p.id !== WILD)
    .map((p) => ({
      id: p.id,
      name: towns.get(p.id)?.name ?? `Town ${p.id}`,
      color: p.color,
      gold: p.gold, lumber: p.lumber, food: p.food, oil: p.oil,
      gear: { weapon: null, armour: null, shield: null },
    }));

  return { t: "snap", tick: world.tick, units, buildings, players, gone };
}

// ───────────────────────────── the loop ─────────────────────────────

function boot(): void {
  if (load()) {
    console.log(`world restored: ${towns.size} towns, tick ${world.tick}`);
  } else {
    world = freshWorld();
    console.log(`new world: ${WORLD_SIZE}x${WORLD_SIZE}, seed ${world.seed}`);
  }
}

boot();

let lastSave = Date.now();
let behind = 0;
let last = Date.now();

setInterval(() => {
  const now = Date.now();
  behind += now - last;
  last = now;
  // Catch up if the process was starved, but never spiral: a server that tries
  // to make up ten minutes in one go blocks for ten minutes.
  let ran = 0;
  while (behind >= TICK_MS && ran < 200) {
    behind -= TICK_MS;
    world.step([]);
    ran++;
  }
  if (ran >= 200) behind = 0;

  for (const c of clients) {
    if (c.player === null) continue;
    if (now - c.lastSnap < SNAPSHOT_MS) continue;
    c.lastSnap = now;
    send(c, snapshotFor(c));
  }

  if (now - lastSave > SAVE_EVERY_MS) {
    lastSave = now;
    try {
      save();
    } catch (err) {
      console.error("could not save the world:", err);
    }
  }
}, TICK_MS);

// ───────────────────────────── connections ─────────────────────────────

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, tick: world.tick, towns: towns.size, clients: clients.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: http });

wss.on("connection", (socket) => {
  const c: Client = { socket, player: null, watch: null, known: new Set(), lastSnap: 0 };
  clients.add(c);

  socket.on("message", (raw) => {
    let m: ClientMessage;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (m.t === "join") {
      // A token is how you get your own town back rather than a new one.
      const existing = m.token ? [...towns.values()].find((t) => t.token === m.token) : undefined;
      let town: Town | null | undefined = existing;
      if (!town) {
        // A world this size should always have room, but "should" is not a
        // guarantee, and a throw in here used to take the whole process down
        // with it -- every other player included.
        try {
          town = foundTown(m.name?.slice(0, 24) || "Wanderer");
        } catch (err) {
          console.error("could not found a town:", err);
          town = null;
        }
      }
      if (!town) {
        send(c, { t: "full" });
        return;
      }
      town.lastSeen = Date.now();
      c.player = town.player;
      send(c, {
        t: "welcome",
        player: town.player,
        token: town.token,
        tick: world.tick,
        map: { width: world.map.width, height: world.map.height, seed: world.seed, kind: "lakeland" },
        terrain: b64(world.map.tiles),
      });
      console.log(`${town.name} (${town.player}) ${existing ? "returned" : "founded a town"}`);
      return;
    }
    if (c.player === null) return;
    if (m.t === "watch") {
      c.watch = { x: m.x, y: m.y, w: m.w, h: m.h };
      return;
    }
    if (m.t === "cmd") {
      // The client may ask for anything; it only gets to ask for things on
      // behalf of itself. Everything else about whether the order is legal is
      // the simulation's business, as it already was.
      const cmd = { ...m.cmd, player: c.player } as typeof m.cmd;
      world.step([cmd]);
      return;
    }
  });

  socket.on("close", () => {
    clients.delete(c);
    if (c.player !== null) {
      const t = towns.get(c.player);
      if (t) t.lastSeen = Date.now();
      console.log(`${t?.name ?? c.player} left; their town carries on`);
    }
  });
});

http.listen(PORT, () => console.log(`realms server listening on :${PORT}`));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log("saving the world before shutting down");
    try {
      save();
    } catch (err) {
      console.error(err);
    }
    process.exit(0);
  });
}
