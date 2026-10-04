/**
 * Open-Meteo sky conditions. External, advisory weather data — it never feeds
 * the geometric predictions or simulation settings, and every caller must treat
 * it as optional: network outages, malformed payloads, and missing fields all
 * surface as a thrown WeatherError, never as a crash.
 *
 * The fetch implementation is injected so verification runs fully offline.
 */

export interface WeatherSite {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface SkyConditions {
  siteId: string | null;
  siteName: string;
  /** Total cloud cover, percent. */
  cloudCoverPct: number;
  cloudCoverLow: number;
  cloudCoverMid: number;
  cloudCoverHigh: number;
  visibilityM: number | null;
  /** Stargazing score 0-100 derived from the cloud layers and visibility. */
  score: number;
  summary: string;
  fetchedAt: string;
  source: "open-meteo";
}

export class WeatherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherError";
  }
}

const API_URL = "https://api.open-meteo.com/v1/forecast";
const HOURLY = "cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility";

export interface SkyConditionInput {
  cloudCoverLow: number;
  cloudCoverMid: number;
  cloudCoverHigh: number;
  visibilityM?: number | null;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Stargazing score 0-100: low cloud hurts the most (it blocks the sky itself),
 * high thin cloud costs the least, and poor transparency costs up to 20 points.
 */
export function scoreSkyConditions(input: SkyConditionInput): number {
  const cloudPenalty =
    clamp(input.cloudCoverLow, 0, 100) * 0.5 +
    clamp(input.cloudCoverMid, 0, 100) * 0.3 +
    clamp(input.cloudCoverHigh, 0, 100) * 0.2;
  const visibility = input.visibilityM ?? null;
  const visibilityPenalty =
    visibility === null || visibility >= 20_000
      ? 0
      : (20_000 - Math.max(0, visibility)) / 1_000;
  return Math.round(clamp(100 - cloudPenalty - visibilityPenalty, 0, 100));
}

function pickNearestIndex(times: string[], atMs: number): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  times.forEach((value, index) => {
    // Open-Meteo omits the zone designator for timezone=UTC responses.
    const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
    const ms = new Date(normalized).getTime();
    if (!Number.isFinite(ms)) return;
    const distance = Math.abs(ms - atMs);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

function readHourlyNumber(payload: unknown, key: string, index: number): number | null {
  if (typeof payload !== "object" || payload === null) return null;
  const hourly = (payload as Record<string, unknown>)["hourly"];
  if (typeof hourly !== "object" || hourly === null) return null;
  const series = (hourly as Record<string, unknown>)[key];
  if (!Array.isArray(series)) return null;
  const value = series[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface FetchSkyConditionsOptions {
  fetchImpl?: FetchLike;
  at?: Date;
  signal?: AbortSignal;
}

export async function fetchSkyConditions(
  site: WeatherSite,
  options: FetchSkyConditionsOptions = {},
): Promise<SkyConditions> {
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const at = options.at ?? new Date();
  const url =
    `${API_URL}?latitude=${site.latitude}&longitude=${site.longitude}` +
    `&hourly=${HOURLY}&forecast_days=2&timezone=UTC`;

  let response: Response;
  try {
    response = await fetchImpl(url, { signal: options.signal ?? null });
  } catch (error) {
    throw new WeatherError(
      `Open-Meteo request failed: ${error instanceof Error ? error.message : "network error"}`,
    );
  }
  if (!response.ok) {
    throw new WeatherError(`Open-Meteo responded ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new WeatherError("Open-Meteo returned malformed JSON");
  }

  const hourly = (payload as Record<string, unknown>)?.["hourly"];
  const times =
    typeof hourly === "object" && hourly !== null && Array.isArray((hourly as Record<string, unknown>)["time"])
      ? ((hourly as Record<string, unknown>)["time"] as string[])
      : null;
  if (times === null) {
    throw new WeatherError("Open-Meteo payload has no hourly.time series");
  }
  const index = pickNearestIndex(times, at.getTime());
  if (index < 0) {
    throw new WeatherError("Open-Meteo payload has no usable hourly timestamps");
  }

  const cloudCoverPct = readHourlyNumber(payload, "cloud_cover", index);
  const low = readHourlyNumber(payload, "cloud_cover_low", index);
  const mid = readHourlyNumber(payload, "cloud_cover_mid", index);
  const high = readHourlyNumber(payload, "cloud_cover_high", index);
  const visibility = readHourlyNumber(payload, "visibility", index);
  if (cloudCoverPct === null) {
    throw new WeatherError("Open-Meteo payload has no cloud_cover values for the hour");
  }

  const score = scoreSkyConditions({
    cloudCoverLow: low ?? cloudCoverPct,
    cloudCoverMid: mid ?? 0,
    cloudCoverHigh: high ?? 0,
    visibilityM: visibility,
  });

  return {
    siteId: site.id ?? null,
    siteName: site.name,
    cloudCoverPct,
    cloudCoverLow: low ?? 0,
    cloudCoverMid: mid ?? 0,
    cloudCoverHigh: high ?? 0,
    visibilityM: visibility,
    score,
    summary: `${site.name}: ${cloudCoverPct}% cloud cover, stargazing score ${score}/100 (Open-Meteo).`,
    fetchedAt: new Date().toISOString(),
    source: "open-meteo",
  };
}

export interface SiteConditionEntry {
  siteId: string | null;
  siteName: string;
  conditions: SkyConditions | null;
  error: string | null;
}

export interface SiteConditionComparison {
  sites: SiteConditionEntry[];
  /** Highest-scoring site with a successful fetch, or null when all failed. */
  best: { siteId: string | null; siteName: string; score: number } | null;
}

export async function compareSitesSkyConditions(
  sites: readonly WeatherSite[],
  options: FetchSkyConditionsOptions = {},
): Promise<SiteConditionComparison> {
  const entries = await Promise.all(
    sites.map(async (site): Promise<SiteConditionEntry> => {
      try {
        const conditions = await fetchSkyConditions(site, options);
        return { siteId: site.id ?? null, siteName: site.name, conditions, error: null };
      } catch (error) {
        return {
          siteId: site.id ?? null,
          siteName: site.name,
          conditions: null,
          error: error instanceof Error ? error.message : "weather unavailable",
        };
      }
    }),
  );
  const best = entries
    .filter((entry) => entry.conditions !== null)
    .reduce<SiteConditionEntry | null>(
      (bestEntry, entry) =>
        bestEntry === null || entry.conditions!.score > bestEntry.conditions!.score ? entry : bestEntry,
      null,
    );
  return {
    sites: entries,
    best:
      best === null
        ? null
        : { siteId: best.siteId, siteName: best.siteName, score: best.conditions!.score },
  };
}
