/**
 * Mission recovery codes are capabilities, not user passwords. Keep the
 * alphabet deliberately small so a copied code is easy to read and enter.
 */
export const RECOVERY_CODE_PREFIX = "ISL";
export const RECOVERY_CODE_ENTROPY_BYTES = 16;
export const RECOVERY_CODE_LENGTH = 32;

const RECOVERY_ALPHABET = "0123456789ABCDEF";
const RECOVERY_ALPHABET_PATTERN = /^[0-9A-F]+$/;

export type RandomBytes = (length: number) => Uint8Array;

function defaultRandomBytes(length: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("A cryptographically secure random source is unavailable");
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function encodeHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => `${RECOVERY_ALPHABET[byte >>> 4]}${RECOVERY_ALPHABET[byte & 15]}`)
    .join("");
}

/** Returns the unformatted recovery-code body, or null for invalid input. */
export function normalizeRecoveryCode(value: string): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().toUpperCase().replace(/[\s-]/g, "");
  const body = compact.startsWith(RECOVERY_CODE_PREFIX)
    ? compact.slice(RECOVERY_CODE_PREFIX.length)
    : compact;
  if (body.length !== RECOVERY_CODE_LENGTH || !RECOVERY_ALPHABET_PATTERN.test(body)) return null;
  return body;
}

/** Formats a valid recovery-code body for display and manual entry. */
export function formatRecoveryCode(value: string): string {
  const body = normalizeRecoveryCode(value);
  if (body === null) throw new Error("Invalid recovery code");
  const groups = body.match(/.{1,4}/g) ?? [];
  return `${RECOVERY_CODE_PREFIX}-${groups.join("-")}`;
}

/** Generates a new code using an injectable random source for deterministic tests. */
export function generateRecoveryCode(randomBytes: RandomBytes = defaultRandomBytes): string {
  const bytes = randomBytes(RECOVERY_CODE_ENTROPY_BYTES);
  if (bytes.length !== RECOVERY_CODE_ENTROPY_BYTES) {
    throw new Error("Random source returned an invalid byte length");
  }
  return formatRecoveryCode(encodeHex(bytes));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Hashes only the normalized body; never persist or log the plain code. */
export async function hashRecoveryCode(value: string): Promise<string> {
  const body = normalizeRecoveryCode(value);
  if (body === null) throw new Error("Invalid recovery code");
  const input = new TextEncoder().encode(body);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return bytesToHex(new Uint8Array(digest));
}
