import type { Unit } from "../sim/entities";

const GIVEN = ["Alden", "Rowan", "Edric", "Bram", "Oswin", "Tomas", "Wren", "Gareth", "Corin", "Emrys", "Finn", "Hugh", "Ivo", "Jory", "Leof", "Merrick"];
const FAMILY = ["Ashford", "Brook", "Hale", "Reed", "Fenwick", "Oakley", "Moss", "Whitford", "Vale", "Thorne", "Wells", "Hart"];

/** Identity follows the entity, including the peasant who becomes king. */
export function personName(u: Unit): string {
  const seed = (Math.imul(u.id, 2654435761) + Math.imul(u.owner, 1013904223)) >>> 0;
  return `${GIVEN[seed % GIVEN.length]} ${FAMILY[Math.floor(seed / GIVEN.length) % FAMILY.length]}`;
}
