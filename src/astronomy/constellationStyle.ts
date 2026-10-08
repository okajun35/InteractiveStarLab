import type { StarStatus } from "../types/astronomy";

export function statusWeight(status: StarStatus): number {
  if (status.state === "visible") return 1;
  if (status.state === "hidden") return 0.5;
  return 0;
}

export function lineStyleFactor(a: StarStatus, b: StarStatus): number {
  return statusWeight(a) * statusWeight(b);
}

export function labelStyleFactor(statuses: StarStatus[]): number {
  // Names are map annotations (like cardinal points), so they must stay
  // legible even when member stars are dimmed — the floor keeps them at
  // roughly half brightness instead of fading to an invisible 0.2.
  if (statuses.length === 0) return 0.5;
  const average = statuses.reduce((sum, status) => sum + statusWeight(status), 0) / statuses.length;
  return Math.max(0.5, average);
}
