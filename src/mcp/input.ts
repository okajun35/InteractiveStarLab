import { toolFailure, toolSuccess } from "./contracts";

export class ToolExecutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolExecutionError";
    this.code = code;
  }
}

export function assertObject(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("input must be an object");
  }
  return input as Record<string, unknown>;
}

export function assertOnlyKeys(input: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new Error("input contains an unknown property");
  }
}

export function requiredString(input: Record<string, unknown>, key: string): string {
  if (typeof input[key] !== "string" || input[key].trim() === "") {
    throw new Error(`${key} must be a non-empty string`);
  }
  return input[key] as string;
}

export function requiredNumber(input: Record<string, unknown>, key: string): number {
  if (typeof input[key] !== "number" || !Number.isFinite(input[key])) {
    throw new Error(`${key} must be a finite number`);
  }
  return input[key] as number;
}

export function optionalInteger(
  input: Record<string, unknown>,
  key: string,
): number | undefined {
  if (input[key] === undefined) return undefined;
  const value = requiredNumber(input, key);
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
}

export function requiredStringArray(
  input: Record<string, unknown>,
  key: string,
): string[] {
  if (
    !Array.isArray(input[key]) ||
    input[key].some((value) => typeof value !== "string" || value.trim() === "")
  ) {
    throw new Error(`${key} must be an array of non-empty strings`);
  }
  return [...(input[key] as string[])];
}

export function safeExecute<T>(operation: () => T): string {
  try {
    return toolSuccess(operation());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool input is invalid";
    const code = error instanceof ToolExecutionError
      ? error.code
      : error instanceof Error && error.name === "MissionNotFoundError"
        ? "MISSION_NOT_FOUND"
        : "INVALID_ARGUMENT";
    return toolFailure(code, message);
  }
}
