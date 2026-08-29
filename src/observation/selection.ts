const DEFAULT_MAX_TARGETS = 5;

function validateMaxTargets(maxTargets: number): void {
  if (!Number.isInteger(maxTargets) || maxTargets < 1) {
    throw new RangeError("maxTargets must be a positive integer");
  }
}

/** Toggles one candidate while preserving insertion order and the target cap. */
export function toggleTargetSelection(
  selectedIds: readonly string[],
  starId: string,
  maxTargets = DEFAULT_MAX_TARGETS,
): string[] {
  validateMaxTargets(maxTargets);
  if (!starId) return [...selectedIds];
  if (selectedIds.includes(starId)) {
    return selectedIds.filter((id) => id !== starId);
  }
  if (selectedIds.length >= maxTargets) return [...selectedIds];
  return [...selectedIds, starId];
}

/** Removes candidates that are no longer available and enforces the cap. */
export function reconcileSelection(
  selectedIds: readonly string[],
  candidateIds: readonly string[],
  maxTargets = DEFAULT_MAX_TARGETS,
): string[] {
  validateMaxTargets(maxTargets);
  const candidates = new Set(candidateIds);
  const seen = new Set<string>();
  return selectedIds.filter((id) => {
    if (!candidates.has(id) || seen.has(id) || seen.size >= maxTargets) return false;
    seen.add(id);
    return true;
  });
}
