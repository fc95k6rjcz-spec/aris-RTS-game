/** Wars campaign: building a battle's world, judging its goals, and remembering progress. */
import { UNITS } from "../data/units";
import { BUILDINGS } from "../data/buildings";
import { type Battle, type WarGoal } from "../data/wars";
import { Faction, WILD, World } from "../sim/world";
import type { PlayerId } from "../sim/types";

const PROGRESS_KEY = "rov-wars";

/** Best stars per battle id. A battle is unlocked when the one before it has any. */
export function loadWarProgress(): Record<number, number> {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}") as Record<number, number>; } catch { return {}; }
}
export function saveWarResult(id: number, stars: number): void {
  const p = loadWarProgress();
  p[id] = Math.max(p[id] ?? 0, stars);
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* private window: progress just isn't kept */ }
}
export function battleUnlocked(id: number, progress = loadWarProgress()): boolean {
  return id === 1 || (progress[id - 1] ?? 0) > 0;
}
export function starsFor(b: Battle, seconds: number): number {
  return seconds <= b.par ? 3 : seconds <= b.par * 2 ? 2 : 1;
}

/** A small map, your hall, your people, and whatever the battle sets against you. */
export function buildBattleWorld(b: Battle, pace: number): World {
  const n = b.size ?? 64;
  const w = new World(n, n, b.seed, "plains", pace, false);
  w.war = true;
  w.hordeEnabled = false;
  w.dragonsEnabled = false;
  w.levelCap = b.cap;
  w.allowed = b.allowed;
  w.addPlayer(1, Faction.Human, "#3b82f6");
  if (b.enemy) w.addPlayer(2, Faction.Human, "#ef4444");
  w.addPlayer(WILD, Faction.Human, "#8a6b3f");
  const starts = w.map.starts;
  w.spawnStart(1, starts[0]!.x - 1, starts[0]!.y - 1);
  if (b.enemy) w.spawnStart(2, starts[1]!.x - 2, starts[1]!.y - 2);
  Object.assign(w.players.get(1)!, b.purse);
  const hall = w.buildings().find((x) => x.owner === 1 && x.def === "townhall")!;
  (b.army ?? []).forEach((def, i) => {
    w.spawnUnit(1, def, { x: (hall.tx + hall.size + 1) * 64 + 32, y: (hall.ty + i) * 64 + 32 });
  });
  if (b.wildlife) w.spawnWildlife(b.wildlife);
  w.updateVision(true);
  return w;
}

export interface GoalState { done: boolean; text: string }

/** Where one goal stands right now. */
export function goalState(w: World, me: PlayerId, g: WarGoal, seconds: number, raidsLeft: number): GoalState {
  const p = w.players.get(me)!;
  switch (g.kind) {
    case "build": {
      const n = w.buildings().filter((b) => b.owner === me && b.def === g.def && b.complete).length;
      return { done: n >= g.count, text: `${BUILDINGS[g.def]!.name} ${Math.min(n, g.count)}/${g.count}` };
    }
    case "train": {
      const n = w.units().filter((u) => u.owner === me && u.def === g.def).length;
      return { done: n >= g.count, text: `${UNITS[g.def]!.name} ${Math.min(n, g.count)}/${g.count}` };
    }
    case "stock": {
      const have = Math.floor(p[g.res]);
      return { done: have >= g.amount, text: `${g.res === "lumber" ? "Wood" : g.res[0]!.toUpperCase() + g.res.slice(1)} ${Math.min(have, g.amount)}/${g.amount}` };
    }
    case "survive": {
      const left = Math.max(0, g.seconds - seconds);
      return { done: left <= 0, text: left > 0 ? `Hold ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}` : "Held" };
    }
    case "clearHorde": {
      const orcs = w.units().filter((u) => u.horde).length;
      return { done: raidsLeft === 0 && orcs === 0, text: raidsLeft ? `Orcs coming (${raidsLeft} band${raidsLeft > 1 ? "s" : ""})` : `Orcs left ${orcs}` };
    }
    case "destroy": {
      const left = w.buildings().filter((b) => b.owner === 2).length;
      return { done: !w.seatAlive(2), text: `Enemy buildings ${left}` };
    }
    case "hallLevel": {
      const lv = Math.max(0, ...w.buildings().filter((b) => b.owner === me && b.def === "townhall" && b.complete).map((b) => b.level));
      return { done: lv >= g.level, text: `Town Hall level ${lv}/${g.level}` };
    }
  }
}
