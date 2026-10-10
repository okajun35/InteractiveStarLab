import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const japanesePattern = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u3005\u3007\u303b\uff0d\uff1a\uff08\uff09\u3001\u3002\u300c\u300d\u300e\u300f\u3010\u3011\u3014\u3015\uff01\uff1f]/u;

function trackedFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: root });
  return output.toString("utf8").split("\0").filter(Boolean);
}

function scanFile(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .flatMap((line, index) => japanesePattern.test(line) ? [`${relative(root, path)}:${index + 1}: ${line.trim()}`] : []);
}

/**
 * Japanese is allowed only where it is functional rather than user-facing copy:
 * the ja dictionary, the Japanese constellation-name catalog, the consult-agent
 * prompt (Japanese phrase examples teach the model relative-time and approval
 * expressions), and the agent locale test fixtures. Everything else — docs,
 * tool descriptions, generated guides — stays English-only.
 */
const exemptSourceFiles = new Set([
  "src/i18n/ja.ts",
  "src/data/constellationNamesJa.ts",
  "lambda/consult-agent.mjs",
  "scripts/verify-agent.ts",
]);

const binaryExtensions = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".icns", ".bmp",
  ".pdf", ".zip", ".gz", ".br", ".woff", ".woff2", ".ttf", ".otf",
  ".mp4", ".webm", ".mov", ".mp3", ".wav", ".db", ".sqlite",
]);

function isBinaryFile(path: string): boolean {
  if (binaryExtensions.has(path.slice(path.lastIndexOf(".")).toLowerCase())) return true;
  try {
    const head = readFileSync(path).subarray(0, 8192);
    return head.includes(0);
  } catch {
    return false;
  }
}

const targets = trackedFiles()
  .filter((file) => !exemptSourceFiles.has(file))
  .map((file) => join(root, file));
// dist/ is generated from the sources scanned above and legitimately bundles
// the ja dictionary, so it is excluded rather than exempted per line.

const findings = targets.filter((path) => !isBinaryFile(path)).flatMap(scanFile);
if (findings.length > 0) {
  console.error("Japanese characters found:");
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log(`English-only scan passed (${targets.length} files checked).`);
