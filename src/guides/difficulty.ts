import type { GuideDifficulty } from "./types";

export function guideDifficulty(magnitude: number, altitude: number): GuideDifficulty {
  if (magnitude <= 1.5 && altitude >= 25) return "easy";
  if (magnitude > 3 || altitude < 15) return "hard";
  return "medium";
}

export function guideDifficultyLabel(value: GuideDifficulty): string {
  switch (value) {
    case "easy": return "Easy";
    case "hard": return "Hard";
    case "medium": return "Medium";
  }
}

