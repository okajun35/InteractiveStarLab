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

const targets = trackedFiles().map((file) => join(root, file));
if (existsSync(join(root, "dist"))) {
  const distFiles = execFileSync("find", [join(root, "dist"), "-type", "f"], { cwd: root })
    .toString("utf8").split(/\r?\n/).filter(Boolean);
  targets.push(...distFiles);
}

const findings = targets.flatMap(scanFile);
if (findings.length > 0) {
  console.error("Japanese characters found:");
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log(`English-only scan passed (${targets.length} files checked).`);
