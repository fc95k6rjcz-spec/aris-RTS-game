/**
 * How big each building is drawn relative to its footprint, in one place.
 *
 * The painted sheets were cropped with different amounts of empty margin, so a
 * farm and a barracks on the same number of tiles came out at wildly different
 * sizes -- the farm looked like a toy next to a peasant, the watch tower like a
 * skyscraper. These factors even that out against a person: a man stands about
 * a fifth of the height of a barracks, a farm is a proper farmstead, and the
 * tower is tall without dwarfing the keep.
 */
export const BUILDING_DRAW_SCALE: Record<string, number> = {
  townhall: 1.36,
  barracks: 1.45, // recropped whole from the sheet (the old crops clipped corners)
  farm: 1.45,
  lumbermill: 1.45,
  golddepot: 1.25,
  stables: 1.55,
  church: 1.35,
  foundry: 1.4,
  magetower: 1.15,
  refinery: 1.35,
  shipyard: 1.35,
  oilrig: 1.25,
  airfactory: 1.15,
  gryphonaviary: 1.25,
  shelter: 1.2,
  tower: 0.92,
};

export function buildingDrawScale(def: string): number {
  return BUILDING_DRAW_SCALE[def] ?? 1;
}

/** People and horses are drawn at this fraction of their old size so buildings read at the right scale. */
export const PERSON_DRAW_SCALE = 0.8;

/**
 * Extra size for a unit on top of PERSON_DRAW_SCALE. Workers are small working
 * folk; the King and his heir used to share that shrink and ended up shorter
 * than a footman, which is backwards -- the King should stand out in a crowd.
 */
export function personShrink(def: string, gatherer: boolean, royal: boolean): number {
  if (def === "king") return 1.08;
  if (royal) return 1.0;
  return gatherer ? 0.78 : 1;
}
