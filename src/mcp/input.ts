import { toolFailure, toolSuccess } from "./contracts";
import { localDateTimeToInstant } from "../astronomy/timezones";

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

/**
 * Parses an agent-supplied dateTime. A value without an offset is local wall
 * time read in the site's timeZone — agents routinely mean "9 PM in Tokyo",
 * not the instant their string happens to parse to in the browser's zone.
 * A value with an explicit offset is an unambiguous instant and is honored.
 */
export function parseFlexibleDateTime(value: string, timeZone?: string): Date {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RangeError("dateTime must be an ISO string");
  }
  const trimmed = value.trim();
  if (
    timeZone !== undefined &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(trimmed)
  ) {
    return localDateTimeToInstant(trimmed, timeZone);
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("dateTime is invalid");
  }
  return date;
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

export function safeExecuteAsync<T>(operation: () => Promise<T>): Promise<string> {
  return operation()
    .then((value) => toolSuccess(value))
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Tool input is invalid";
      const code = error instanceof ToolExecutionError
        ? error.code
        : error instanceof Error && error.name === "MissionNotFoundError"
          ? "MISSION_NOT_FOUND"
          : "INVALID_ARGUMENT";
      return toolFailure(code, message);
    });
}
