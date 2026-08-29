import type { Constellation, Star } from "../types/astronomy";
import starsJson from "../data/stars.json";
import constellationsJson from "../data/constellations.json";

export const STARS = starsJson as Star[];
export const CONSTELLATIONS = constellationsJson as Constellation[];

export const STAR_BY_ID: ReadonlyMap<string, Star> = new Map(
  STARS.map((star) => [star.id, star]),
);

export const CONSTELLATION_BY_NAME: ReadonlyMap<string, Constellation> =
  new Map(CONSTELLATIONS.map((c) => [c.name, c]));

/**
 * Stars that may show their name by default: bright stars (magnitude <= 2)
 * or the well-known named stars listed in the specification.
 */
const NOTABLE_NAMES = new Set([
  "Sirius",
  "Vega",
  "Altair",
  "Deneb",
  "Betelgeuse",
  "Rigel",
  "Polaris",
  "Antares",
  "Arcturus",
]);

export function shouldShowStarName(star: Star): boolean {
  if (NOTABLE_NAMES.has(star.name)) return true;
  return star.magnitude <= 2.0;
}
