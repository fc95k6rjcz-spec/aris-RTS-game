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
