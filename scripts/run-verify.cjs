/* Bundles scripts/<entry>.ts (TypeScript, imports src/) and runs it with node.
   Usage: node scripts/run-verify.cjs [entry.ts name, default verify.ts] */
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
const entry = path.join(__dirname, process.argv[2] || "verify.ts");
const out = path.join(root, "node_modules", ".verify-bundle.mjs");

esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  logLevel: "silent",
});

execFileSync(process.execPath, [out], { stdio: "inherit", cwd: root });
