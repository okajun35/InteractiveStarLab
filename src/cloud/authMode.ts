export type CloudPersistenceMode = "local" | "sign-in-required" | "cloud";

/** Selects the persistence mode without making authentication a startup dependency. */
export function resolveCloudPersistenceMode(
  configured: boolean,
  userId: string | null,
): CloudPersistenceMode {
  if (!configured) return "local";
  return userId === null || userId.trim() === "" ? "sign-in-required" : "cloud";
}
