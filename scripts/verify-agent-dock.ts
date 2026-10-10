// Agent dock: the floating, always-mounted surface that presents the two
// agent doors separately — the in-app consult (Bedrock) tab and the
// external-integration (WebMCP) tab. Verifies the structural split:
// dock mounted at App level, sidebar slimmed to sky context, WebMCP
// status confined to the external tab, and door-neutral activity labels.
// Run: node scripts/run-verify.cjs verify-agent-dock.ts
import { readFileSync, existsSync } from "node:fs";
import { en } from "../src/i18n/en";
import { ja } from "../src/i18n/ja";

const enDict = en as unknown as Record<string, string>;
const jaDict = ja as unknown as Record<string, string>;

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    console.log(`FAIL  ${name} ${detail}`);
    failures += 1;
  }
}

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readSafe = (path: string) =>
  existsSync(new URL(`../${path}`, import.meta.url)) ? read(path) : "";

const app = read("src/App.tsx");
const sidebar = read("src/components/SkySidebar.tsx");
const ctxPanel = read("src/components/SkyContextPanel.tsx");
const consult = read("src/components/ConsultPanel.tsx");
const dock = readSafe("src/components/AgentDock.tsx");
const styles = read("src/styles.css");

// ---- D1: AgentDock exists and wires both doors -----------------------------
{
  check("D1: AgentDock component exists", dock.length > 0);
  check("D1: dock renders the consult panel", dock.includes("ConsultPanel"));
  check("D1: dock renders the WebMCP harness", dock.includes("AgentHarness"));
  check("D1: dock reads WebMCP availability for the external door",
    dock.includes("useWebMcp") && dock.includes("availability"));
  check("D1: dock reads the in-app agent URL for the consult door",
    dock.includes("agentApiUrl"));
  check("D1: dock has a collapsible open state",
    /useState|open/.test(dock) && dock.includes("dock.open"));
  check("D1: dock exposes the external-integration tab",
    dock.includes("dock.tabExternal"));
  check("D1: dock explains what WebMCP is for",
    dock.includes("dock.webmcp.about"));
}

// ---- D2: dock is mounted at App level, outside the view switch -------------
{
  check("D2: App imports AgentDock", app.includes("AgentDock"));
  const dockAt = app.indexOf("<AgentDock");
  const planBranchAt = app.indexOf('view === "plan"');
  check("D2: dock mounts after the view branches (global, not per-view)",
    dockAt > planBranchAt && planBranchAt >= 0,
    `dock@${dockAt} plan@${planBranchAt}`);
}

// ---- D3: sidebar is slimmed to sky context ---------------------------------
{
  check("D3: sidebar no longer hosts the consult panel",
    !sidebar.includes("ConsultPanel"));
  check("D3: sidebar no longer hosts the harness",
    !sidebar.includes("AgentHarness"));
  check("D3: sidebar still hosts the sky context panel",
    sidebar.includes("SkyContextPanel"));
  check("D3: sidebar is titled as sky state, not agent",
    sidebar.includes("ctx.eyebrow") && !sidebar.includes("agent.panel."));
}

// ---- D4: WebMCP status badge is out of the sky context panel ---------------
{
  check("D4: context panel drops the WebMCP status badge",
    !ctxPanel.includes("sky-status-badge"));
  check("D4: context panel drops WebMCP badge labels",
    !ctxPanel.includes("webmcp.ready") && !ctxPanel.includes("webmcp.unavailable"));
}

// ---- D5: activity labels are door-neutral ----------------------------------
{
  const neutralKeys = ["ctx.updatedVia", "ctx.activityAria", "ctx.announcement", "ctx.announcementOne"] as const;
  for (const key of neutralKeys) {
    check(`D5: ${key} is door-neutral in en`, !enDict[key].includes("WebMCP"), enDict[key]);
    check(`D5: ${key} is door-neutral in ja`, !jaDict[key].includes("WebMCP"), jaDict[key]);
  }
}

// ---- D6: new dock keys exist in both dictionaries --------------------------
{
  const required = [
    "dock.tabExternal",
    "dock.webmcp.about",
    "dock.open",
    "dock.close",
    "dock.doorInapp",
    "dock.doorExternal",
    "dock.doorOn",
    "dock.doorOff",
    "ctx.eyebrow",
    "ctx.close",
    "ctx.reopen",
  ] as const;
  for (const key of required) {
    check(`D6: ${key} defined in en and ja`,
      typeof enDict[key] === "string" && enDict[key].length > 0 &&
      typeof jaDict[key] === "string" && jaDict[key].length > 0);
  }
}

// ---- D7: retired agent-umbrella keys are gone -------------------------------
{
  const retired = ["agent.panel.title", "agent.panel.eyebrow", "agent.close", "agent.reopen"] as const;
  for (const key of retired) {
    check(`D7: ${key} removed from en and ja`,
      !(key in enDict) && !(key in jaDict));
  }
}

// ---- D8: consult panel is chromeless inside the dock ------------------------
{
  check("D8: consult panel no longer carries its own expand toggle",
    !consult.includes("consult-toggle"));
}

// ---- D9: dock styling exists ------------------------------------------------
{
  check("D9: styles define .agent-dock", styles.includes(".agent-dock"));
  check("D9: styles define the collapsed dock button", styles.includes(".agent-dock-fab"));
}

if (failures > 0) {
  console.log(`\n${failures} agent-dock check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\nAll agent-dock checks passed");
}
