import type {
  ObservationResult,
  ObservationStatus,
  ObservationTarget,
} from "../types/observation";

export type DraftObservationResults = Readonly<
  Record<string, ObservationStatus | undefined>
>;

export function countCompletedResults(
  targets: readonly ObservationTarget[],
  draftResults: DraftObservationResults,
): number {
  return targets.reduce(
    (count, target) => count + (draftResults[target.starId] === undefined ? 0 : 1),
    0,
  );
}

/** Returns results in mission order, or null until every target is answered. */
export function buildObservationResults(
  targets: readonly ObservationTarget[],
  draftResults: DraftObservationResults,
): ObservationResult[] | null {
  const results: ObservationResult[] = [];
  for (const target of targets) {
    const status = draftResults[target.starId];
    if (status === undefined) return null;
    results.push({ starId: target.starId, status });
  }
  return results;
}
