import {
  RECOVERY_CODE_LENGTH,
  formatRecoveryCode,
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "../src/cloud/recoveryCode";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const randomBytes = (length: number): Uint8Array => new Uint8Array(length).fill(0xab);
const generated = generateRecoveryCode(randomBytes);
const normalized = normalizeRecoveryCode(generated);

check("RECOVERY-CODE-1: generated code has the required entropy length", normalized !== null && normalized.length === RECOVERY_CODE_LENGTH);
check("RECOVERY-CODE-1: generated code has the ISL display prefix", generated.startsWith("ISL-"));
check("RECOVERY-CODE-1: generated code uses only the recovery alphabet", normalized !== null && /^[A-HJ-NP-Z2-9]+$/.test(normalized));
check("RECOVERY-CODE-2: formatted code round-trips to normalized form", normalized !== null && normalizeRecoveryCode(formatRecoveryCode(normalized)) === normalized);
check("RECOVERY-CODE-2: prefix is optional when restoring", normalized !== null && normalizeRecoveryCode(normalized) === normalized);
check("RECOVERY-CODE-2: case and separators are normalized", normalized !== null && normalizeRecoveryCode(`  ${generated.toLowerCase().replaceAll("-", " ")}  `) === normalized);
check("RECOVERY-CODE-3: empty code is rejected", normalizeRecoveryCode("") === null);
check("RECOVERY-CODE-3: malformed characters are rejected", normalizeRecoveryCode("ISL-0000-OOOO-!!!!") === null);
check("RECOVERY-CODE-3: truncated code is rejected", normalized !== null && normalizeRecoveryCode(normalized.slice(0, -1)) === null);

const [hashA, hashB] = await Promise.all([
  hashRecoveryCode(generated),
  hashRecoveryCode(generated.toLowerCase().replaceAll("-", " ")),
]);
check("RECOVERY-CODE-4: equivalent formats produce the same SHA-256 hash", hashA === hashB && hashA.length === 64);
check("RECOVERY-CODE-4: hash does not equal the normalized code", hashA !== normalized);

if (failures > 0) process.exit(1);
console.log("\nAll recovery code checks passed.");
