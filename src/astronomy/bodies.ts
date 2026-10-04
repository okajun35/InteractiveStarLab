/**
 * Solar-system bodies for the sky scene: the Moon (with phase) and the seven
 * naked-eye planets. Positions reuse the same astronomy-engine path as the
 * existing Sun position so scene numbers always agree.
 */
import { Body, Equator, Horizon, Illumination } from "astronomy-engine";
import type { AstronomyContext } from "./observer";

export interface MoonPosition {
  azimuth: number;
  altitude: number;
  illuminationPct: number;
  phaseAngleDeg: number;
  magnitude: number;
}

export interface PlanetPosition {
  id: string;
  name: string;
  azimuth: number;
  altitude: number;
  magnitude: number | null;
}

const PLANET_BODIES: { body: Body; id: string; name: string }[] = [
  { body: Body.Mercury, id: "mercury", name: "Mercury" },
  { body: Body.Venus, id: "venus", name: "Venus" },
  { body: Body.Mars, id: "mars", name: "Mars" },
  { body: Body.Jupiter, id: "jupiter", name: "Jupiter" },
  { body: Body.Saturn, id: "saturn", name: "Saturn" },
  { body: Body.Uranus, id: "uranus", name: "Uranus" },
  { body: Body.Neptune, id: "neptune", name: "Neptune" },
];

function horizontalOf(
  ctx: AstronomyContext,
  body: Body,
): { azimuth: number; altitude: number } {
  const equator = Equator(body, ctx.time, ctx.observer, true, true);
  const horizontal = Horizon(
    ctx.time,
    ctx.observer,
    equator.ra,
    equator.dec,
    "normal",
  );
  return {
    azimuth: ((horizontal.azimuth % 360) + 360) % 360,
    altitude: horizontal.altitude,
  };
}

function magnitudeOf(body: Body, date: Date): number | null {
  try {
    const illumination = Illumination(body, date);
    return illumination.mag;
  } catch {
    return null;
  }
}

export function moonPosition(ctx: AstronomyContext): MoonPosition {
  const horizontal = horizontalOf(ctx, Body.Moon);
  const light = Illumination(Body.Moon, ctx.time.date);
  return {
    azimuth: horizontal.azimuth,
    altitude: horizontal.altitude,
    illuminationPct: light.phase_fraction * 100,
    phaseAngleDeg: light.phase_angle,
    magnitude: light.mag,
  };
}

export function planetPositions(ctx: AstronomyContext): PlanetPosition[] {
  return PLANET_BODIES.map(({ body, id, name }) => ({
    id,
    name,
    ...horizontalOf(ctx, body),
    magnitude: magnitudeOf(body, ctx.time.date),
  }));
}
