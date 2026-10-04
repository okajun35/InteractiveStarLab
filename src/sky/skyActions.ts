/**
 * A bounded, chronological log of the human's recent interactions with the
 * sky viewer. Read by `describe_current_view` so an agent can see what the
 * person just did before answering (mirrors Roque Nights' action buffer).
 */

export interface SkyAction {
  /** Machine-friendly category: "pan" | "zoom" | "select" | "mode" | ... */
  type: string;
  /** Human-readable one-line description of what happened. */
  label: string;
  /** Unix epoch milliseconds. */
  at: number;
}

/** How many recent actions are retained. */
export const SKY_ACTION_LIMIT = 20;

/**
 * Append an action, dropping the oldest entries beyond the cap.
 * Returns a new array; the input log is never mutated.
 */
export function pushSkyAction(
  log: readonly SkyAction[],
  type: string,
  label: string,
  at: number = Date.now(),
): SkyAction[] {
  const next = [...log, { type, label, at }];
  return next.length > SKY_ACTION_LIMIT
    ? next.slice(next.length - SKY_ACTION_LIMIT)
    : next;
}
