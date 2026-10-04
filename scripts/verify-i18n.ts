/**
 * Verification: typed i18n dictionaries and locale detection.
 * Japanese may only appear in the checked-in dictionary files; the english-only
 * scan allows it there and nowhere else.
 *
 * Run with: node scripts/run-verify.cjs verify-i18n.ts
 */
import { en } from "../src/i18n/en";
import { ja } from "../src/i18n/ja";
import {
  detectLocale,
  intlLocale,
  readStoredLocale,
  writeStoredLocale,
} from "../src/i18n/locale";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL  ${name}  ${detail}`);
}

// ---- dictionaries ---------------------------------------------------------------
{
  const enKeys = Object.keys(en).sort();
  const jaKeys = Object.keys(ja).sort();
  check(
    "i18n: dictionaries cover the same keys",
    JSON.stringify(enKeys) === JSON.stringify(jaKeys),
    `en ${enKeys.length} vs ja ${jaKeys.length}`,
  );
  check(
    "i18n: every message is a non-empty string",
    enKeys.every(
      (key) =>
        typeof en[key as keyof typeof en] === "string" &&
        en[key as keyof typeof en].length > 0 &&
        typeof ja[key as keyof typeof en] === "string" &&
        ja[key as keyof typeof en].length > 0,
    ),
  );
  check("i18n: nav labels exist", en["nav.sky"] === "Sky" && ja["nav.sky"].length > 0);
  check(
    "i18n: workflow namespaces exist",
    [
      "plan.createMission",
      "plan.candidatesSelected",
      "run.save",
      "results.expected",
      "history.starsCount",
      "recovery.invalid",
      "snap.cloudBadge",
      "proposal.commit",
      "status.visible",
      "guide.pdfSaved",
      "ctx.activityAria",
    ].every(
      (key) =>
        typeof en[key as keyof typeof en] === "string" &&
        typeof ja[key as keyof typeof en] === "string",
    ),
  );
  check(
    "i18n: interpolation placeholders are non-empty after substitution",
    en["plan.upToMagnitude"].includes("{mag}") &&
      en["proposal.commit"].includes("{count}") &&
      en["recovery.invalid"].length > 0,
  );
  check(
    "i18n: intlLocale maps locales to BCP-47 tags",
    intlLocale("en") === "en-US" && intlLocale("ja") === "ja-JP",
  );
}

// ---- detection -------------------------------------------------------------------
{
  const storage = (value: string | null) => ({
    getItem: () => value,
    setItem: () => undefined,
  });
  check(
    "i18n: stored locale wins",
    detectLocale(storage("ja"), "en-US") === "ja",
  );
  check(
    "i18n: Japanese browser falls back to ja",
    detectLocale(storage(null), "ja-JP") === "ja",
  );
  check(
    "i18n: other locales fall back to en",
    detectLocale(storage(null), "fr-FR") === "en",
  );
  check(
    "i18n: malformed stored value falls back",
    detectLocale(storage("klingon"), "en-US") === "en",
  );
  check(
    "i18n: missing navigator language is safe",
    detectLocale(storage(null), undefined) === "en",
  );
  check(
    "i18n: storage write/read round-trips",
    (() => {
      let stored: string | null = null;
      const mem = {
        getItem: () => stored,
        setItem: (_key: string, value: string) => {
          stored = value;
        },
      };
      writeStoredLocale(mem, "ja");
      return readStoredLocale(mem) === "ja";
    })(),
  );
}

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll i18n checks passed.");
