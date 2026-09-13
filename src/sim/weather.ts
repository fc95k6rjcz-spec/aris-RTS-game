/**
 * Weather.
 *
 * It rains, and the rain ruins your roads.
 *
 * The paths your people beat into the ground are the one piece of terrain the
 * player shapes without deciding to, and they were free: walk a route enough
 * and it gets quicker, forever. Rain is the bill. A worn track with nothing
 * laid over it turns to mud, and mud is slower than the bare grass it was cut
 * from -- so a hard-won route becomes a liability precisely when you are
 * relying on it. Paved Ways is the answer, and until now it was a nice-to-have
 * that made a good thing slightly better. Now it is what stops your economy
 * bogging down every time the sky opens.
 *
 * ── Determinism ──
 *
 * This is simulation, not decoration: it changes how fast units move, so two
 * machines in a network game must agree about it to the tick. So the schedule
 * is not rolled as the game goes. It is a pure function of the map seed and the
 * tick number -- ask what the weather is at tick N and you get the same answer
 * on every machine, in any order, however many times you ask, with no state to
 * fall out of step. The renderer and the audio read the same function.
 */

/** What the sky is doing. */
export type Sky = "clear" | "overcast" | "rain" | "storm";

/**
 * How long one weather spell lasts, in ticks. 20 ticks is a second.
 *
 * Seventy seconds, and the drift below is weighted so the first rain usually
 * arrives inside the first five or six minutes. The first cut ran a 95 second
 * spell with a strong bias towards staying clear, and the sums said the first
 * rain would land around the fourteen minute mark -- which for most matches
 * means a weather system nobody ever sees.
 */
const SPELL = 20 * 70;

/**
 * The spell in force at a tick, and how far through it we are.
 *
 * Hashing the spell index rather than stepping a generator is what makes this
 * order-independent: a client that joins late, or a replay that seeks, asks the
 * same question and gets the same answer without having had to live through
 * everything before it.
 */
export function skyAt(seed: number, tick: number): { sky: Sky; spell: number; through: number } {
  const spell = Math.floor(tick / SPELL);
  const through = (tick % SPELL) / SPELL;
  return { sky: skyOf(seed, spell), spell, through };
}

function hash(a: number, b: number): number {
  let t = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35)) >>> 0;
  t ^= t >>> 15;
  t = Math.imul(t, 0x2545f491) >>> 0;
  return ((t ^ (t >>> 13)) >>> 0) / 4294967296;
}

/**
 * Weather does not flip a coin every spell; it drifts.
 *
 * A sky that jumps clear-storm-clear-storm is weather as a slot machine. Each
 * spell is drawn from a distribution that leans on the one before it, so rain
 * arrives through overcast and leaves the same way, and a storm is something
 * you saw coming. The first two spells are always dry: opening a match in a
 * downpour, before anybody has beaten a path to ruin, is atmosphere with no
 * gameplay attached and just makes the map hard to read.
 */
function skyOf(seed: number, spell: number): Sky {
  if (spell <= 1) return "clear";
  const prev = spell === 2 ? "clear" : skyOf(seed, spell - 1);
  const r = hash(seed, spell);
  switch (prev) {
    case "clear":
      return r < 0.42 ? "clear" : "overcast";
    case "overcast":
      return r < 0.22 ? "clear" : r < 0.52 ? "overcast" : "rain";
    case "rain":
      return r < 0.30 ? "overcast" : r < 0.82 ? "rain" : "storm";
    case "storm":
      return r < 0.55 ? "rain" : "storm";
  }
}

/** How hard it is coming down, 0 to 1. Drives mud, sound and the picture alike. */
export function rainfall(sky: Sky): number {
  return sky === "storm" ? 1 : sky === "rain" ? 0.55 : 0;
}

/**
 * Rain fades in and out across the first and last tenth of its spell.
 *
 * Without this the sound and the picture snap on between one tick and the next,
 * which reads as a bug rather than as weather.
 */
export function intensityAt(seed: number, tick: number): number {
  const { sky, through } = skyAt(seed, tick);
  const base = rainfall(sky);
  if (base === 0) return 0;
  const edge = Math.min(through, 1 - through);
  return base * Math.min(1, edge / 0.1);
}

/** Human-readable, for the top bar. */
export function skyName(sky: Sky): string {
  return sky === "storm" ? "Storm" : sky === "rain" ? "Rain" : sky === "overcast" ? "Overcast" : "Clear";
}


// ───────────────────────────── the day ─────────────────────────────

/**
 * How long a day lasts, in ticks.
 *
 * Four minutes. Long enough that a phase is a mood rather than a strobe, short
 * enough that a match of any length sees several dawns. The HUD clock reads off
 * the same number, so what the top bar says and what the sky is doing can never
 * drift apart.
 */
export const DAY = 20 * 240;

export type Phase = "night" | "sunrise" | "day" | "sunset";

/** The day number and how far through it we are, from the tick alone. */
export function dayAt(tick: number): { day: number; through: number } {
  return { day: Math.floor(tick / DAY) + 1, through: (tick % DAY) / DAY };
}

/** A clock face, for the top bar. */
export function clockAt(tick: number): string {
  const mins = Math.floor(dayAt(tick).through * 24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function phaseAt(tick: number): Phase {
  const t = dayAt(tick).through;
  if (t < 0.22) return "sunrise";
  if (t < 0.66) return "day";
  if (t < 0.80) return "sunset";
  return "night";
}

export function phaseName(p: Phase): string {
  return p === "sunrise" ? "Dawn" : p === "sunset" ? "Dusk" : p === "night" ? "Night" : "Day";
}

/**
 * The colour of the light, as something to lay over the world.
 *
 * Keyframes round the clock, interpolated, so dawn arrives over a couple of
 * minutes rather than between two frames. Night is blue and heavy because that
 * is what makes a torch worth looking at; dawn and dusk are warm and light
 * because they are brief and should be pretty rather than punishing.
 *
 * Purely a wash over the picture. It does NOT touch sight ranges or anything
 * else the simulation reads -- a night that blinded you would be a real
 * mechanic and wants designing, balancing and testing rather than arriving as a
 * side effect of a paint job.
 */
const KEYS: Array<{ at: number; r: number; g: number; b: number; a: number }> = [
  { at: 0.0, r: 12, g: 20, b: 52, a: 0.52 },
  { at: 0.16, r: 96, g: 62, b: 74, a: 0.34 },
  { at: 0.24, r: 255, g: 150, b: 80, a: 0.2 },
  { at: 0.34, r: 255, g: 214, b: 170, a: 0.06 },
  { at: 0.6, r: 255, g: 236, b: 210, a: 0.03 },
  { at: 0.72, r: 255, g: 140, b: 66, a: 0.2 },
  { at: 0.82, r: 118, g: 66, b: 88, a: 0.36 },
  { at: 0.92, r: 12, g: 20, b: 52, a: 0.52 },
  { at: 1.0, r: 12, g: 20, b: 52, a: 0.52 },
];

/**
 * How dark it is, 0 through 1.
 *
 * Read off the same keyframes as the wash, so it can never disagree with what
 * is on screen: it is the wash's own alpha, rescaled so that full night reads
 * as 1 and a bright noon as 0. What it is for is the things that only make
 * sense in the dark -- a camp fire's pool of light, a torch, a window lit from
 * inside. Those want to come up as the light goes down, and they want to do it
 * on exactly the same curve the sky does or the two will visibly disagree
 * across dusk.
 */
export function darkness(tick: number): number {
  const a = lightAt(tick).alpha;
  // 0.52 is the alpha of the night keyframes; 0.06 is broad daylight.
  return Math.min(1, Math.max(0, (a - 0.06) / (0.52 - 0.06)));
}

export function lightAt(tick: number): { css: string; alpha: number } {
  const t = dayAt(tick).through;
  let a = KEYS[0]!;
  let b = KEYS[KEYS.length - 1]!;
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (t >= KEYS[i]!.at && t <= KEYS[i + 1]!.at) {
      a = KEYS[i]!;
      b = KEYS[i + 1]!;
      break;
    }
  }
  const span = Math.max(1e-6, b.at - a.at);
  const k = Math.min(1, Math.max(0, (t - a.at) / span));
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k);
  return { css: `rgb(${mix(a.r, b.r)},${mix(a.g, b.g)},${mix(a.b, b.b)})`, alpha: a.a + (b.a - a.a) * k };
}
