import { BUILDINGS, BUILD_ADVANCED, BUILD_BASIC, BUILD_MENU, buildingName } from "../data/buildings";
import { UNITS, unitName } from "../data/units";
import { upgradesFor, UPGRADES } from "../data/upgrades";
import { LEVELLED, levelDef } from "../data/levels";
import type { Building, Unit } from "../sim/entities";
import { ROYAL_LICENCE, type World } from "../sim/world";
import type { PlayerId } from "../sim/types";
import { buildingIcon } from "../render/sprites";
import { WEAPON_OF } from "../sim/relic";
import { SUB } from "../sim/types";

/**
 * How tall the bottom bar is, for a given window.
 *
 * It used to be a flat 276 px, sized so a 3 x 6 command card of 40 px buttons
 * fitted with room to spare. On a desktop that is a bar; on a laptop with a
 * browser's tabs and bookmarks above the page it was half the screen, and the
 * game was playing in a letterbox. So the bar is now a share of the window with
 * a floor and a ceiling, and the buttons shrink to fit inside it. Six rows of
 * small buttons still beats three rows of big ones you cannot see the map past.
 */
export function hudH(windowH: number): number {
  return Math.round(Math.max(150, Math.min(190, windowH * 0.22)));
}

/** Kept for code that has not been handed a window height. */
export const HUD_H = 276;
export const TOP_H = 28;

export function minimapSize(windowH: number): number {
  return Math.max(90, Math.min(134, hudH(windowH) - 24));
}
export const MINIMAP = 134;

/**
 * The command card: eighteen slots, laid out to suit the window.
 *
 * Three columns by six rows on a tall screen, which is the shape a command card
 * has always been. On a short one it turns on its side -- six by three -- rather
 * than shrinking the buttons until the labels are unreadable stubs. Screens are
 * wide and short; a card that is tall and narrow spends the scarce dimension and
 * hoards the plentiful one.
 */
const CARD_GAP = 4;
const CARD_BTN_MAX = 40;

// Six by three at every size. Three columns is the shape a command card has
// traditionally had, and it is the wrong one here: at three columns a button is
// too narrow for the word on it, so "Lumber Mill" came out as "Lumbe" no matter
// how small the type went. Screens are wide and short, so the card is too.
export function cardCols(_windowH: number): number {
  return 6;
}
export function cardRows(_windowH: number): number {
  return 3;
}
export const CARD_COLS = 3;
export const CARD_ROWS = 6;

/** Button size that makes the card's rows fit the bar this window can afford. */
export function cardBtn(windowH: number): number {
  return Math.max(26, Math.min(CARD_BTN_MAX, Math.floor((hudH(windowH) - 18) / cardRows(windowH)) - CARD_GAP));
}

/**
 * Buttons are wider than they are tall on the sideways card. Height is the
 * scarce dimension on a short window and width is not, and "Lumber Mill" needs
 * the width or it reads as "Lumbe".
 */
export function cardBtnW(windowH: number): number {
  return cardCols(windowH) === 6 ? cardBtn(windowH) + 14 : cardBtn(windowH);
}

export function cardW(windowH: number): number {
  return cardCols(windowH) * (cardBtnW(windowH) + CARD_GAP) - CARD_GAP;
}

export const CARD_W = CARD_COLS * (40 + CARD_GAP) - CARD_GAP;

/** Where the minimap sits: the RIGHT end of the bar, opposite the command card. */
export function minimapRect(viewW: number, viewH: number): { x: number; y: number; size: number } {
  const size = minimapSize(viewH);
  return { x: viewW - size - 12, y: viewH - hudH(viewH) + 8, size };
}

/** Left edge of the selection panel, clear of the command card. */
export function panelX(windowH = 900): number {
  return 12 + cardW(windowH) + 24;
}

export interface HudButton {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  hotkey: string;
  enabled: boolean;
  tooltip: string;
  action:
    | { type: "build"; def: string }
    | { type: "train"; def: string }
    | { type: "cancelBuild" }
    | { type: "stop" }
    | { type: "battleRally" }
    | { type: "cancelTrain"; index: number }
    | { type: "upgrade" }
    | { type: "cancelUpgrade" }
    | { type: "page"; page: MenuPage }
    | { type: "research"; id: string }
    | { type: "cancelResearch" }
    | { type: "attack" }
    | { type: "harvest" };
}

/** Which page of the build menu a worker's command card is showing. */
export type MenuPage = "basic" | "advanced";

export interface HudState {
  buttons: HudButton[];
}

/**
 * Bottom command bar: minimap · selection panel · command card.
 * Pure drawing + layout; the Game translates button hits into commands.
 */
/** Format a cost, hiding resources the thing does not need. */
function cost(c: { gold: number; lumber: number; oil?: number }): string {
  const parts = [`${c.gold}g`, `${c.lumber}w`];
  if (c.oil) parts.push(`${c.oil} oil`);
  return parts.join(" ");
}

export function layoutButtons(world: World, player: PlayerId, selUnits: Unit[], selBuildings: Building[], viewW: number, viewH: number, page: MenuPage = "basic"): HudButton[] {
  const buttons: HudButton[] = [];
  // A 3 x 6 command card, filled in reading order. Eighteen slots is enough for the
  // whole build list at once, so the basic/advanced paging below is now a
  // convenience rather than a necessity.
  const cols = cardCols(viewH);
  const rows = cardRows(viewH);
  const gap = CARD_GAP;
  const bw = cardBtnW(viewH);
  const bh = cardBtn(viewH);
  const x0 = 12;
  const y0 = viewH - hudH(viewH) + 8;
  const put = (i: number, label: string, hotkey: string, enabled: boolean, tooltip: string, action: HudButton["action"]) => {
    if (i >= cols * rows) return; // beyond the last slot
    buttons.push({ x: x0 + (i % cols) * (bw + gap), y: y0 + Math.floor(i / cols) * (bh + gap), w: bw, h: bh, label, hotkey, enabled, tooltip, action });
  };

  const builders = selUnits.filter((u) => UNITS[u.def]!.canBuild);
  if (builders.length > 0) {
    const list = page === "advanced" ? BUILD_ADVANCED : BUILD_BASIC;
    list.forEach((id, i) => {
      const d = BUILDINGS[id]!;
      const royal = builders.some(u => !!UNITS[u.def]!.royal);
        const missing = royal && ROYAL_LICENCE.has(id) ? undefined : d.requires.find((r) => !world.hasBuilding(player, r));
      const afford = world.canAfford(player, d.cost);
      const nm = buildingName(id, world.players.get(player)!.faction);
      const tip = `${nm} — ${cost(d.cost)} · ${d.description}${missing ? ` (requires ${buildingName(missing, world.players.get(player)!.faction)})` : ""}`;
      put(i, nm, d.hotkey, !missing && afford, tip, { type: "build", def: id });
    });
    // Bottom row is fixed on both pages, so the controls never move under the
    // cursor when the page flips.
    // Workers fight — badly, but they fight — so they get the order like anyone.
    const last = cols * rows - cols; // first slot of the bottom row
    put(last + 0, "Attack", "A", true, "Attack-move: advance and engage what you meet", { type: "attack" });
    put(last + 1, "Stop", "X", true, "Stop current task", { type: "stop" });
    if (page === "basic") put(last + 2, "More", "V", true, "Further structures", { type: "page", page: "advanced" });
    else put(last + 2, "Back", "Esc", true, "Back to the main structures", { type: "page", page: "basic" });
    if (selUnits.some((u) => UNITS[u.def]!.canGather)) {
      put(last + 3, "Harvest", "Q", true, "Send to the nearest wood or gold and start working", { type: "harvest" });
    }
  } else if (selUnits.length > 0) {
    const fighters = selUnits.some((u) => UNITS[u.def]!.damage > 0);
    if (fighters) put(0, "Attack", "A", true, "Attack-move: advance and engage what you meet", { type: "attack" });
    let n = fighters ? 1 : 0;
    put(n++, "Stop", "X", true, "Stop current task", { type: "stop" });
    if (selUnits.some((u) => UNITS[u.def]!.canGather)) {
      put(n++, "Harvest", "Q", true, "Send to the nearest wood or gold and start working", { type: "harvest" });
    }
  } else if (selBuildings.length === 1 && selBuildings[0]!.owner === player) {
    const b = selBuildings[0]!;
    const d = BUILDINGS[b.def]!;
    if (!b.complete) {
      put(0, "Cancel", "Esc", true, "Cancel construction (75% refund)", { type: "cancelBuild" });
    } else {
      let n = 0;
      d.trains.forEach((uid, i) => {
        n = i + 1;
        const ud = UNITS[uid]!;
        const s = world.supply(player);
        const afford = world.canAfford(player, ud.cost);
        const nm = unitName(uid, world.players.get(player)!.faction);
        const tip = `${nm} — ${cost(ud.cost)} · ${ud.supply} supply · ${ud.description}${s.used + ud.supply > s.max ? " (need supply)" : ""}`;
        put(i, nm, ud.hotkey, afford, tip, { type: "train", def: uid });
      });
      // Levelled buildings get an Upgrade / Cancel Upgrade button.
      const table = LEVELLED[b.def];
      if (table) {
        if (b.upgrade) {
          const lv = levelDef(b.def, b.upgrade.toLevel);
          put(n, "Cancel Up.", "U", true, `Upgrading to ${lv.name} (level ${lv.level}) — cancel for a 75% refund`, { type: "cancelUpgrade" });
        } else if (b.level >= table.length) {
          put(n, "Max Level", "U", false, `${levelDef(b.def, b.level).name} — the highest tier`, { type: "upgrade" });
        } else {
          const lv = levelDef(b.def, b.level + 1);
          put(n, `Upgrade ${b.level + 1}`, "U", world.canAfford(player, lv.cost), `${lv.name} (level ${lv.level}) — ${cost(lv.cost)} · ${lv.blurb}`, { type: "upgrade" });
        }
        n += 1;
      }
      // Unit upgrades this building researches. Not necessarily for the units it
      // trains — see data/upgrades.ts.
      if (b.research) {
        const up = UPGRADES[b.research.id]!;
        put(n, "Cancel Res.", "Esc", true, `Researching ${up.name} ${b.research.toLevel} — cancel for a 75% refund`, { type: "cancelResearch" });
      } else {
        for (const up of upgradesFor(b.def)) {
          const have = world.players.get(player)!.research[up.id] ?? 0;
          const maxed = have >= up.levels.length;
          const lv = up.levels[Math.min(have, up.levels.length - 1)]!;
          const label = maxed ? `${up.name} max` : `${up.name} ${have + 1}`;
          const tip = maxed
            ? `${up.name} — fully researched`
            : `${up.name} ${have + 1} — ${cost(lv.cost)} · ${up.description}`;
          put(n, label, up.hotkey, !maxed && world.canAfford(player, lv.cost), tip, { type: "research", id: up.id });
          n += 1;
        }
      }
    }
  }
  return buttons;
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  world: World,
  player: PlayerId,
  selUnits: Unit[],
  selBuildings: Building[],
  buttons: HudButton[],
  hover: HudButton | null,
  viewW: number,
  viewH: number,
  message: { text: string; level: "info" | "error" } | null,
  mode: string | null,
): void {
  const p = world.players.get(player)!;
  const faction = p.faction;
  // Top bar.
  ctx.fillStyle = "rgba(10,12,16,0.92)";
  ctx.fillRect(0, 0, viewW, TOP_H);
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e0b93a";
  ctx.fillText(`◆ Gold ${p.gold}`, 12, TOP_H / 2);
  ctx.fillStyle = "#c9a469";
  ctx.fillText(`▲ Lumber ${p.lumber}`, 130, TOP_H / 2);
  const oil = world.oilRate(player);
  ctx.fillStyle = "#9aa7b0";
  const oilRate = Math.round(oil.crude * oil.multiplier);
  ctx.fillText(`● Oil ${p.oil}${oilRate ? ` (+${oilRate}/s)` : ""}`, 262, TOP_H / 2);
  const s = world.supply(player);
  ctx.fillStyle = s.used >= s.max ? "#ff8080" : "#cfd8dc";
  ctx.fillText(`☗ Supply ${s.used}/${s.max}`, 400, TOP_H / 2);
  ctx.fillStyle = "#8a97a3";
  ctx.font = "12px system-ui, sans-serif";
  const secs = Math.floor(world.tick / 20);
  ctx.fillText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, viewW - 50, TOP_H / 2);
  if (mode) {
    ctx.fillStyle = "#9cff9c";
    ctx.fillText(mode, viewW / 2 - 60, TOP_H / 2);
  }

  // Bottom bar.
  const y0 = viewH - hudH(viewH);
  ctx.fillStyle = "rgba(10,12,16,0.94)";
  ctx.fillRect(0, y0, viewW, hudH(viewH));
  ctx.fillStyle = "#2a2f36";
  ctx.fillRect(0, y0, viewW, 2);

  // Selection panel.
  const px = panelX(viewH);
  ctx.fillStyle = "#dfe6ea";
  ctx.font = "bold 15px system-ui, sans-serif";
  ctx.textBaseline = "top";
  if (selBuildings.length === 1 && selUnits.length === 0) {
    const b = selBuildings[0]!;
    const d = BUILDINGS[b.def]!;
    const table = LEVELLED[b.def];
    const title = table ? `${levelDef(b.def, b.level).name}  ·  ${d.name} L${b.level}` : d.name;
    ctx.fillText(title + (b.complete ? "" : "  (under construction)"), px, y0 + 14);
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "#9fb0bb";
    const lv = table ? levelDef(b.def, b.level) : null;
    const extras: string[] = [];
    if (lv?.supply) extras.push(`supply +${lv.supply}`);
    if (lv?.heal) extras.push(`heals ${lv.heal}/tick`);
    if (lv?.bonusCarry) extras.push(`+${lv.bonusCarry} per load`);
    if (lv?.trainSpeed && lv.trainSpeed > 1) extras.push(`trains ${Math.round(lv.trainSpeed * 100)}%`);
    if (lv?.radius) extras.push(`radius ${lv.radius}`);
    if (lv?.armour) extras.push(`armour +${Math.round(lv.armour * 100)}% HP`);
    if (lv?.oilPerSecond) extras.push(`${lv.oilPerSecond} crude/s`);
    if (lv?.refine) extras.push(`refining +${Math.round(lv.refine * 100)}%`);
    if (lv?.spellPower) extras.push(`spell power +${Math.round(lv.spellPower * 100)}%`);
    ctx.fillText(`HP ${b.hp}/${b.maxHp}${extras.length ? "  ·  " + extras.join("  ·  ") : ""}`, px, y0 + 38);
    if (!b.complete) ctx.fillText(`Progress ${Math.floor((b.progress / d.buildTime) * 100)}%  ·  builders: ${b.builders}`, px, y0 + 58);
    else if (b.upgrade) {
      const lv = levelDef(b.def, b.upgrade.toLevel);
      ctx.fillStyle = "#e8c547";
      ctx.fillText(`Upgrading to ${lv.name} (L${lv.level}) — ${Math.floor((1 - b.upgrade.remaining / b.upgrade.total) * 100)}%`, px, y0 + 58);
    } else ctx.fillText(table ? levelDef(b.def, b.level).blurb : d.description, px, y0 + 58);
    // Training queue.
    if (b.research) {
      const up = UPGRADES[b.research.id]!;
      ctx.fillStyle = "#9fb0bb";
      ctx.fillText(`Researching ${up.name} ${b.research.toLevel} — ${Math.ceil(b.research.remaining / 20)}s left`, px, y0 + 84);
    }
    if (b.queue.length > 0) {
      ctx.fillStyle = "#dfe6ea";
      ctx.fillText("Queue:", px, y0 + 84);
      b.queue.forEach((j, i) => {
        const qx = px + 56 + i * 64;
        ctx.fillStyle = "#1e242b";
        ctx.fillRect(qx, y0 + 80, 58, 24);
        ctx.fillStyle = "#5ab0ff";
        ctx.fillRect(qx, y0 + 80, 58 * (i === 0 ? 1 - j.remaining / j.total : 0), 24);
        ctx.fillStyle = "#fff";
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillText(unitName(j.unit, faction), qx + 4, y0 + 86);
        ctx.font = "13px system-ui, sans-serif";
      });
      ctx.fillStyle = "#6f7f8a";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText("Click a queued item to cancel", px, y0 + 110);
    }
    if (b.complete && BUILDINGS[b.def]!.trains.length > 0) {
      ctx.fillStyle = "#6f7f8a";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText("Right-click the map to set a rally point", px, y0 + 126);
    }
  } else if (selUnits.length === 1) {
    const u = selUnits[0]!;
    ctx.fillText(unitName(u.def, faction), px, y0 + 14);
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "#9fb0bb";
    ctx.fillText(`HP ${u.hp}/${u.maxHp}`, px, y0 + 38);
    ctx.fillText(describeTask(u), px, y0 + 58);
  } else if (selUnits.length > 1) {
    ctx.fillText(`${selUnits.length} units selected`, px, y0 + 14);
    const counts = new Map<string, number>();
    for (const u of selUnits) counts.set(u.def, (counts.get(u.def) ?? 0) + 1);
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "#9fb0bb";
    let i = 0;
    for (const [k, n] of counts) ctx.fillText(`${n} × ${unitName(k, faction)}`, px, y0 + 38 + i++ * 18);
  } else {
    ctx.fillStyle = "#6f7f8a";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`Left-drag to select · Right-click to order · Select a ${unitName("worker", faction)} for the build menu`, px, y0 + 14);
    ctx.fillText("Camera: WASD / arrows / edge scroll · wheel to zoom · click minimap to jump", px, y0 + 34);
    ctx.fillText("Buildings: Hall (H) · Farm (Z) · Mill (L) · Barracks (B) · Shipyard (S) · Church (C) · Tower (T)", px, y0 + 54);
    ctx.fillText("            Stables (E) · Mage Tower (M) · Foundry (F) · Oil Rig (O) · Refinery (R) · Factory (P)", px, y0 + 74);
  }

  // Command card.
  for (const b of buttons) {
    ctx.fillStyle = b.enabled ? (b === hover ? "#33414d" : "#222a32") : "#151a1f";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.enabled ? "#4c5b68" : "#2a3138";
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    const icon = b.action.type === "build" ? buildingIcon(faction, b.action.def) : null;
    if (icon) {
      ctx.save();
      if (!b.enabled) ctx.globalAlpha = 0.35;
      ctx.drawImage(icon, b.x + 3, b.y + 3, b.w - 6, b.h - 6);
      ctx.restore();
    } else {
      // No icon for this faction and building — fall back to a label, clipped to
      // the button and sized with it. The label used to be a fixed 11 px over
      // three lines, which was fine on a 40 px button and spilled clean across
      // the selection panel once the bar started shrinking to fit small screens.
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      ctx.clip();
      ctx.fillStyle = b.enabled ? "#e8eef2" : "#5d6a75";
      ctx.textBaseline = "top";
      // Shrink to fit rather than clip. A button reading "Lumbe" over "Mill" is
      // worse than a slightly smaller one reading "Lumber Mill": the player is
      // scanning for a word, and half a word is not the word.
      const words = b.label.split(" ");
      let fs = Math.min(13, Math.round(b.h * 0.3));
      for (; fs > 7; fs--) {
        ctx.font = `bold ${fs}px system-ui, sans-serif`;
        if (words.every((w) => ctx.measureText(w).width <= b.w - 8)) break;
      }
      ctx.font = `bold ${fs}px system-ui, sans-serif`;
      const lines = Math.max(1, Math.floor((b.h - 6) / (fs + 2)));
      words.slice(0, lines).forEach((word, i) => ctx.fillText(word, b.x + 4, b.y + 4 + i * (fs + 2)));
      ctx.restore();
    }
    // Hotkey in the corner, on a chip so it reads over artwork. Small buttons
    // have no room for it and are learned by position anyway.
    if (b.w >= 30) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(b.x + b.w - 15, b.y + b.h - 14, 14, 13);
      ctx.fillStyle = b.enabled ? "#e8c547" : "#5d6a75";
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(b.hotkey, b.x + b.w - 12, b.y + b.h - 12);
    }
  }
  if (hover) {
    ctx.font = "12px system-ui, sans-serif";
    ctx.textBaseline = "bottom";
    const tw = ctx.measureText(hover.tooltip).width + 16;
    const tx = Math.min(viewW - tw - 8, hover.x);
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.fillRect(tx, y0 - 30, tw, 24);
    ctx.fillStyle = "#fff";
    ctx.fillText(hover.tooltip, tx + 8, y0 - 10);
  }

  // Match over.
  if (world.winner !== null) {
    const won = world.winner === player;
    ctx.font = "bold 34px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = won ? "Victory" : "Defeat";
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(viewW / 2 - 190, viewH / 2 - 60, 380, 90);
    ctx.strokeStyle = won ? "#e8c547" : "#a04040";
    ctx.lineWidth = 2;
    ctx.strokeRect(viewW / 2 - 190, viewH / 2 - 60, 380, 90);
    ctx.fillStyle = won ? "#e8c547" : "#e08080";
    ctx.fillText(text, viewW / 2, viewH / 2 - 22);
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillStyle = "#c9d2d8";
    ctx.fillText(won ? "The enemy has no buildings left." : "You have no buildings left.", viewW / 2, viewH / 2 + 10);
    ctx.textAlign = "left";
  }

  drawObjective(ctx, world, player, viewW);

  // Toast message.
  if (message) {
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(message.text).width + 24;
    ctx.fillStyle = message.level === "error" ? "rgba(140,30,30,0.85)" : "rgba(30,90,140,0.85)";
    ctx.fillRect(viewW / 2 - tw / 2, y0 - 44, tw, 28);
    ctx.fillStyle = "#fff";
    ctx.fillText(message.text, viewW / 2 - tw / 2 + 12, y0 - 30);
  }
}

export function describeTask(u: Unit): string {
  const t = u.task;
  switch (t.kind) {
    case "idle":
      return "Idle";
    case "move":
      return "Moving";
    case "build":
      return "Constructing";
    case "repair":
      return "Repairing";
    case "attack":
      return "Attacking";
    case "attackMove":
      return "Advancing";
    case "gather":
      return `Gathering ${t.resource} (${t.phase === "harvest" ? "harvesting" : t.phase === "toDrop" || t.phase === "deposit" ? "returning" : "walking"})`;
  }
}

/** Eight points, which is as precise as "over that way" needs to be. */
export function compass(dx: number, dy: number): string {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  const i = Math.round(((a + 360) % 360) / 45) % 8;
  return ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"][i]!;
}

/**
 * What to do, while there is no obvious way to find out.
 *
 * The crowning opening drops you into fog as one peasant with every build
 * button greyed out and no hall, which -- with nothing on screen explaining it
 * -- reads as a broken game rather than as the premise. So for as long as the
 * weapon is still in the ground, the objective is on the screen, and it says
 * which way to walk. The weapon stays hidden and still has to be found; what
 * goes away is the player wondering whether the game has crashed.
 *
 * It removes itself the moment the weapon is lifted, because from then on the
 * game explains itself the way every other RTS does: you have a hall, and
 * buttons that work.
 */
function drawObjective(ctx: CanvasRenderingContext2D, world: World, player: PlayerId, viewW: number): void {
  const relic = world.relics.find((r) => r.owner === player && !r.taken);
  if (!relic || world.winner !== null) return;
  let man: Unit | null = null;
  for (const e of world.entities.values()) {
    if (e.owner === player && e.kind === "unit") {
      man = e;
      break;
    }
  }
  const weapon = WEAPON_OF[world.players.get(player)!.faction].name;
  const heading = man ? compass(relic.x + 0.5 - man.pos.x / SUB, relic.y + 0.5 - man.pos.y / SUB) : null;
  const far = man ? Math.round(Math.hypot(relic.x + 0.5 - man.pos.x / SUB, relic.y + 0.5 - man.pos.y / SUB)) : 0;

  const title = `FIND YOUR ${weapon.toUpperCase()}`;
  const line = heading
    ? `No king, no hall — until he takes it up. It lies ${far} paces to the ${heading}.`
    : "No king, no hall — until he takes it up.";

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = "12px system-ui, sans-serif";
  const w = Math.min(viewW - 32, Math.max(ctx.measureText(line).width + 44, 320));
  const x = Math.round(viewW / 2 - w / 2);
  const y = TOP_H + 10;
  const h = 52;
  ctx.fillStyle = "rgba(12,12,14,0.82)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(200,162,74,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = "#e8c547";
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.fillText(title, x + w / 2, y + 17);
  ctx.fillStyle = "#cbd3da";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(line, x + w / 2, y + 35);
  ctx.restore();
}


// ───────────────────────── command sets, for the DOM shell ─────────────────────────

/** One tile's worth of command, with no geometry: the shell lays it out. */
export interface CommandEntry {
  label: string;
  cost: string | null;
  hotkey: string;
  enabled: boolean;
  description: string;
  action: HudButton["action"];
}

export interface CommandSets {
  tabs: Array<{ id: string; label: string }>;
  byTab: Record<string, CommandEntry[]>;
}

function costLine(c: { gold: number; lumber: number; oil?: number; food?: number }): string {
  const parts = [String(c.gold), String(c.lumber)];
  if (c.food) parts.push(`${c.food}f`);
  if (c.oil) parts.push(`${c.oil}o`);
  return parts.join(" · ");
}

/**
 * What the current selection can be told to do, grouped into tabs.
 *
 * The same rules as the old command card, minus the geometry. Splitting build
 * options across BUILD and ADVANCED tabs rather than paging them means the
 * thirteen-button wall is gone and every tile can afford to carry its cost and
 * its key without shrinking to an illegible square.
 */
export function commandSets(world: World, player: PlayerId, selUnits: Unit[], selBuildings: Building[]): CommandSets {
  const faction = world.players.get(player)!.faction;
  const orders: CommandEntry[] = [];
  const king = selUnits.find(u => u.def === "king" && u.owner === player);
  if (king) {
    const left = Math.max(0, Math.ceil(((king.rallyReadyAt ?? 0) - world.tick) / 20));
    orders.push({ label: left ? 'Rally (' + left + 's)' : "Rally the Men", cost: null, hotkey: "R", enabled: !left, description: "Nearby troops gain 25% damage for 12 seconds. Range: 6 tiles. Cooldown: 60 seconds.", action: { type: "battleRally" } });
  }
  const builders = selUnits.filter((u) => UNITS[u.def]!.canBuild);

  if (selUnits.length > 0) {
    if (selUnits.some((u) => UNITS[u.def]!.damage > 0)) {
      orders.push({ label: "Attack", cost: null, hotkey: "A", enabled: true, description: "Attack-move to a point. Engages what it meets on the way.", action: { type: "attack" } });
    }
    orders.push({ label: "Stop", cost: null, hotkey: "X", enabled: true, description: "Cancel current orders and hold.", action: { type: "stop" } });
    if (selUnits.some((u) => UNITS[u.def]!.canGather)) {
      orders.push({ label: "Harvest", cost: null, hotkey: "Q", enabled: true, description: "Send each worker to the nearest wood or gold and start working.", action: { type: "harvest" } });
    }
  }

  if (builders.length > 0) {
    const list = (ids: readonly string[]): CommandEntry[] =>
      ids.map((id) => {
        const d = BUILDINGS[id]!;
        const royal = builders.some(u => !!UNITS[u.def]!.royal);
        const missing = royal && ROYAL_LICENCE.has(id) ? undefined : d.requires.find((r) => !world.hasBuilding(player, r));
        const afford = world.canAfford(player, d.cost);
        const nm = buildingName(id, faction);
        const why = missing
          ? `Requires ${buildingName(missing, faction)}.`
          : !afford
            ? "Not enough resources yet."
            : "";
        return {
          label: nm,
          cost: costLine(d.cost),
          hotkey: d.hotkey,
          enabled: !missing && afford,
          description: `${d.description}${why ? " " + why : ""}`,
          action: { type: "build", def: id } as HudButton["action"],
        };
      });
    return {
      tabs: [
        { id: "build", label: "Build" },
        { id: "advanced", label: "Advanced" },
        { id: "orders", label: "Orders" },
      ],
      byTab: { build: list(BUILD_BASIC), advanced: list(BUILD_ADVANCED), orders },
    };
  }

  if (selBuildings.length === 1 && selBuildings[0]!.owner === player) {
    const b = selBuildings[0]!;
    const d = BUILDINGS[b.def]!;
    const out: CommandEntry[] = [];
    if (!b.complete) {
      out.push({ label: "Cancel", cost: null, hotkey: "Esc", enabled: true, description: "Cancel construction. Three quarters of the cost comes back.", action: { type: "cancelBuild" } });
    } else {
      for (const uid of d.trains) {
        const u = UNITS[uid]!;
        out.push({
          label: unitName(uid, faction),
          cost: costLine(u.cost),
          hotkey: u.hotkey,
          enabled: world.canAfford(player, u.cost),
          description: u.description,
          action: { type: "train", def: uid },
        });
      }
      for (const up of upgradesFor(b.def)) {
        const have = world.players.get(player)!.research[up.id] ?? 0;
        const next = up.levels[have];
        if (!next) continue;
        out.push({
          label: `${up.name} ${have + 1}`,
          cost: costLine(next.cost),
          hotkey: up.hotkey,
          enabled: world.canAfford(player, next.cost) && b.research === null,
          description: up.description,
          action: { type: "research", id: up.id },
        });
      }
    }
    return { tabs: [{ id: "build", label: d.name }], byTab: { build: out, advanced: [], orders: [] } };
  }

  return { tabs: [{ id: "orders", label: "Orders" }], byTab: { build: [], advanced: [], orders } };
}

