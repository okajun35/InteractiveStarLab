export type CloudPersistenceMode = "local" | "cloud";

/** Selects local fallback until the anonymous Cloud Identity is ready. */
export function resolveCloudPersistenceMode(
  configured: boolean,
  userId: string | null,
): CloudPersistenceMode {
  if (!configured) return "local";
  return userId === null || userId.trim() === "" ? "local" : "cloud";
}
