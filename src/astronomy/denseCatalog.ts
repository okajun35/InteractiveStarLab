/**
 * Vendored deep-field catalogs (d3-celestial, BSD-3-Clause — see CREDITS.md).
 *
 * The upstream files keep right ascension in degrees; every record is
 * converted to the repository convention (sidereal hours) at load time so the
 * rest of the astronomy pipeline never handles degrees.
 */
import denseStarsJson from "../data/dense-stars.json";
import messierJson from "../data/messier.json";
import milkyWayJson from "../data/milkyway.json";
import { DEFAULT_STAR_COLOR, quantizedStarColor } from "./starColor";

const DEG_PER_HOUR = 15;

// ---------------------------------------------------------------------------
// Dense star field
// ---------------------------------------------------------------------------

/** [raDeg, decDeg, mag, bv, name, hip], brightest first. */
type DenseStarTuple = [number, number, number, number, string, number];

export interface DenseStar {
  /** J2000 right ascension in sidereal hours. */
  ra: number;
  dec: number;
  magnitude: number;
  bv: number;
  name: string;
  hip: number;
}

const tuples = denseStarsJson.stars as DenseStarTuple[];

export const DENSE_STARS: DenseStar[] = tuples.map(
  ([raDeg, dec, magnitude, bv, name, hip]) => ({
    ra: raDeg / DEG_PER_HOUR,
    dec,
    magnitude,
    bv,
    name,
    hip,
  }),
);

/** Faintest magnitude present in the dense catalog. */
export const DENSE_STAR_MAG_LIMIT: number = denseStarsJson.maxMag;

// ---------------------------------------------------------------------------
// B-V lookup for the named catalog
// ---------------------------------------------------------------------------

/**
 * The named 750-star catalog carries no B-V index. Both catalogs derive from
 * Hipparcos J2000, so a nearest-neighbour lookup on position recovers the
 * colour for any catalog star inside the tolerance below.
 */
const BV_MATCH_TOLERANCE_DEG = 0.05;
const GRID_CELL_DEG = 2;

interface GridEntry {
  raDeg: number;
  decDeg: number;
  bv: number;
}

let colorGrid: Map<string, GridEntry[]> | null = null;

function grid(): Map<string, GridEntry[]> {
  if (colorGrid) return colorGrid;
  colorGrid = new Map();
  for (let i = 0; i < tuples.length; i++) {
    const [raDeg, dec, , bv] = tuples[i];
    const key = `${Math.floor(raDeg / GRID_CELL_DEG)}|${Math.floor((dec + 90) / GRID_CELL_DEG)}`;
    const cell = colorGrid.get(key);
    if (cell) cell.push({ raDeg, decDeg: dec, bv });
    else colorGrid.set(key, [{ raDeg, decDeg: dec, bv }]);
  }
  return colorGrid;
}

/** Nearest-catalogue B-V for a J2000 position, or null when nothing is close. */
export function starBvAt(raHours: number, decDeg: number): number | null {
  const raDeg = ((raHours * DEG_PER_HOUR) % 360 + 360) % 360;
  const cells = grid();
  const cellRa = Math.floor(raDeg / GRID_CELL_DEG);
  const cellDec = Math.floor((decDeg + 90) / GRID_CELL_DEG);
  const cosDec = Math.cos((decDeg * Math.PI) / 180);
  let best: number | null = null;
  let bestDist = BV_MATCH_TOLERANCE_DEG;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const raCell = (cellRa + dr + Math.ceil(360 / GRID_CELL_DEG)) % Math.ceil(360 / GRID_CELL_DEG);
      const cell = cells.get(`${raCell}|${cellDec + dc}`);
      if (!cell) continue;
      for (const entry of cell) {
        let dRa = Math.abs(entry.raDeg - raDeg);
        if (dRa > 180) dRa = 360 - dRa;
        const dist = Math.hypot(dRa * cosDec, entry.decDeg - decDeg);
        if (dist < bestDist) {
          bestDist = dist;
          best = entry.bv;
        }
      }
    }
  }
  return best;
}

/** Display colour for a catalog position; falls back to the white default. */
export function starColorAt(raHours: number, decDeg: number): string {
  const bv = starBvAt(raHours, decDeg);
  return bv === null ? DEFAULT_STAR_COLOR : quantizedStarColor(bv);
}

// ---------------------------------------------------------------------------
// Messier objects
// ---------------------------------------------------------------------------

export type MessierType =
  | "galaxy"
  | "open_cluster"
  | "globular_cluster"
  | "planetary_nebula"
  | "diffuse_nebula"
  | "supernova_remnant"
  | "other";

export interface MessierObject {
  id: string;
  name: string;
  type: MessierType;
  /** J2000 right ascension in sidereal hours. */
  ra: number;
  dec: number;
  magnitude: number | null;
  sizeArcmin: number | null;
  constellation: string;
}

interface MessierRecord {
  id: string;
  name: string;
  type: MessierType;
  ra: number;
  dec: number;
  mag: number | null;
  sizeArcmin: number | null;
  con: string;
}

export const MESSIER_OBJECTS: MessierObject[] = (
  messierJson.objects as MessierRecord[]
).map((o) => ({
  id: o.id,
  name: o.name,
  type: o.type,
  ra: o.ra / DEG_PER_HOUR,
  dec: o.dec,
  magnitude: o.mag,
  sizeArcmin: o.sizeArcmin,
  constellation: o.con,
}));

// ---------------------------------------------------------------------------
// Milky Way isophotes
// ---------------------------------------------------------------------------

export interface MilkyWayLevel {
  /** 1 (faintest) to 5 (brightest core). */
  level: number;
  /** Rings of [raHours, decDeg]; explicitly closed, not cut at the RA seam. */
  polygons: [number, number][][];
}

interface MilkyWayRecord {
  id: string;
  polygons: [number, number][][];
}

export const MILKY_WAY_LEVELS: MilkyWayLevel[] = (
  milkyWayJson.levels as MilkyWayRecord[]
)
  .map((level, index) => ({
    level: Number.parseInt(level.id.replace(/[^0-9]/g, ""), 10) || index + 1,
    polygons: level.polygons.map((ring) =>
      ring.map(([raDeg, dec]) => [raDeg / DEG_PER_HOUR, dec] as [number, number]),
    ),
  }))
  .sort((a, b) => a.level - b.level);
