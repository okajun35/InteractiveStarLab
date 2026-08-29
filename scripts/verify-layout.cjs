/* Layout regression test: the star canvas must fill the main area,
   not collapse to HUD width (~96×24). See docs/progress.md (canvas size bug).
   Run: node scripts/verify-layout.cjs
   Spawns `vite` dev server, drives headless Chromium, measures real DOM rects. */
const { spawn } = require("node:child_process");
const path = require("node:path");
const pw = require(path.join(
  process.env.HOME,
  ".nvm/versions/node/v22.19.0/lib/node_modules/@playwright/cli/node_modules/playwright",
));

const ROOT = path.join(__dirname, "..");
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures += 1;
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`dev server did not become ready at ${url}`);
}

async function measure(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      width: Math.round(r.width),
      height: Math.round(r.height),
      canvasWidthAttr: el.querySelector("canvas")
        ? el.querySelector("canvas").getAttribute("width")
        : null,
    };
  }, selector);
}

async function main() {
  const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort",
    "--host", "127.0.0.1"], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
  });

  const browser = await pw.chromium.launch({
    headless: true,
    executablePath: path.join(
      process.env.HOME,
      ".cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell",
    ),
    args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=1"],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    await waitForServer(BASE);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForSelector(".app-canvas canvas", { timeout: 15000 });

    // ---- G1: normal view — canvas fills the main area, not HUD width ----
    const normal = await measure(page, ".app-canvas");
    check("G1: canvas element present", normal !== null);
    check("G1: canvas width is full (not 96px)", normal && normal.width > 500,
      `width=${normal && normal.width}`);
    check("G1: canvas height is full (not 24px)", normal && normal.height > 300,
      `height=${normal && normal.height}`);

    // expected: viewport width minus 320px sidebar minus ~0 (no margin) => ~1080
    check("G1: width ≈ 1400 - 320 sidebar (1040..1088)",
      normal && normal.width >= 1040 && normal.width <= 1088,
      `width=${normal && normal.width}`);

    // ---- G2: compare mode — split area still fills width ----
    await page.click('.seg-group[aria-label="比較の種類"] button:first-child');
    await page.waitForSelector(".compare-split canvas", { timeout: 10000 });
    const comp = await measure(page, ".app-canvas");
    check("G2: compare canvas area present", comp !== null);
    check("G2: compare area width is full", comp && comp.width > 500,
      `width=${comp && comp.width}`);
    const halves = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll(".compare-half canvas"));
      return h.map((c) => ({ w: c.getBoundingClientRect().width }));
    });
    const okHalf = halves.length === 2 && halves.every((h) => h.w > 300 && h.w < 700);
    check("G2: two halves, each ~half width", okHalf,
      JSON.stringify(halves));

    // ---- C6: location compare time-basis toggle (§27 Advanced) ----
    await page.click('.seg-group[aria-label="比較の種類"] button:nth-child(3)'); // Tokyo vs Sydney
    await page.waitForSelector(".compare-split canvas", { timeout: 10000 });
    const basisGroup = await page.evaluate(() => {
      const g = document.querySelector('.seg-group[aria-label="時刻の揃え方"]');
      if (!g) return null;
      return {
        count: g.querySelectorAll("button").length,
        active: Array.from(g.querySelectorAll("button.active")).map((b) => b.textContent),
      };
    });
    check("C6: time basis control appears for location compare (2 options)",
      basisGroup !== null && basisGroup.count === 2, JSON.stringify(basisGroup));
    check("C6: default basis is Same Local Time",
      basisGroup !== null && basisGroup.active[0] && basisGroup.active[0].includes("Same Local Time"),
      JSON.stringify(basisGroup && basisGroup.active));

    // HUD local times must be EQUAL under same-local-time (both wall clocks match).
    const localTimes = () => page.evaluate(() =>
      Array.from(document.querySelectorAll(".canvas-hud-time"))
        .map((e) => (e.textContent || "").trim().replace(/^現地\s*/, "")));
    const t1 = await localTimes();
    check("C6: both sides show identical local time (same-local-time)",
      t1.length === 2 && /\d{2}:\d{2}$/.test(t1[0]) && t1[0] === t1[1],
      JSON.stringify(t1));

    // Switch to Same UTC → the two wall clocks must DIFFER by exactly the
    // UTC offset gap (Tokyo +9 vs Sydney +10 in August = 1h).
    await page.click('.seg-group[aria-label="時刻の揃え方"] button:nth-child(2)');
    await new Promise((r) => setTimeout(r, 300));
    const t2 = await localTimes();
    const hm = (s) => {
      const m = s.match(/(\d{1,2}):(\d{2})$/);
      return m ? { h: Number(m[1]), min: Number(m[2]) } : { h: 0, min: 0 };
    };
    const diffMin = (((hm(t2[1]).h - hm(t2[0]).h) * 60 + (hm(t2[1]).min - hm(t2[0]).min)) + 1440) % 1440;
    check("C6: Same UTC → local clocks differ",
      t2.length === 2 && t2[0] !== t2[1], JSON.stringify(t2));
    check("C6: offset gap is 1h (Tokyo +9 vs Sydney +10 in August)",
      diffMin === 60, `Δ=${diffMin}min ${JSON.stringify(t2)}`);

    // ---- T6: twilight stage HUD + gradual visibility (§41 将来) ----
    // (T6 runs in normal view: first close the compare mode from C6.)
    const locationBtn = await page.$('.seg-group[aria-label="比較の種類"] button:nth-child(3)');
    if (locationBtn && (await locationBtn.evaluate((b) => b.className)).includes("active")) {
      await locationBtn.click();
      await page.waitForSelector(".app-canvas canvas", { timeout: 10000 });
    }
    // Reset daylight to REAL so the stage HUD is meaningful.
    await page.click('.seg-group[aria-label="昼間モード"] button:nth-child(1)');
    // Set the app date/time via the React-bound datetime-local input
    // (container-TZ independent: compute the local value for the UTC instant).
    async function setDateUTC(utcDate) {
      await page.evaluate((iso) => {
        const local = new Date(iso);
        const pad = (n) => String(n).padStart(2, "0");
        const value = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
        const input = document.querySelector('input[type="datetime-local"]');
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value",
        ).set;
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, utcDate);
      await new Promise((r) => setTimeout(r, 300));
    }
    const stage = () =>
      page.evaluate(
        () => document.querySelector(".canvas-hud-stage")?.textContent?.trim() ?? null,
      );
    // visible + in-view counts from the HUD (e.g. "見える 4 / 視野内 21").
    const hudCounts = () =>
      page.evaluate(() => {
        const m = /\u898b\u3048\u308b (\d+) \/ \u8996\u91ce\u5185 (\d+)/.exec(
          document.querySelector(".canvas-hud-count")?.textContent ?? "",
        );
        return m ? { visible: Number(m[1]), inView: Number(m[2]) } : null;
      });

    // Tokyo 2026-08-27: sunset ≈ JST 18:05. Measured sun altitudes:
    //   JST 18:30 → -3.5° (civil), 18:55 → -7.9° (nautical),
    //   19:25 → -13.6° (astronomical), 22:00 → -38° (night).
    await setDateUTC("2026-08-27T09:30:00.000Z"); // JST 18:30 → civil
    check("T6: civil twilight stage shown", (await stage()) === "民用薄暮 Civil Twilight",
      JSON.stringify(await stage()));
    // Gradual model (cap civil 2.0 < nautical 4.0 < astro 5.5 < night none):
    // the bright-sky stages must suppress MORE of the in-view stars than the
    // clear night (limit 5.5 covers the whole catalog, so nothing is hidden).
    const civCounts = await hudCounts();
    check("T6: civil twilight suppresses most in-view stars (cap 2.0)",
      civCounts !== null && civCounts.visible < civCounts.inView
        && civCounts.inView > 5 && civCounts.visible <= 6,
      JSON.stringify(civCounts));

    await setDateUTC("2026-08-27T09:55:00.000Z"); // JST 18:55 → nautical
    check("T6: nautical stage shown", (await stage()) === "航海薄暮 Nautical Twilight",
      JSON.stringify(await stage()));
    const nauCounts = await hudCounts();
    check("T6: nautical cap (4.0) hides fewer than civil (2.0)",
      nauCounts !== null && civCounts !== null
        && nauCounts.visible >= civCounts.visible,
      JSON.stringify({ civCounts, nauCounts }));

    await setDateUTC("2026-08-27T10:25:00.000Z"); // JST 19:25 → astronomical
    check("T6: astronomical stage shown", (await stage()) === "天文薄暮 Astronomical Twilight",
      JSON.stringify(await stage()));
    const astroCounts = await hudCounts();
    check("T6: astronomical cap (5.5) hides fewer than nautical (4.0)",
      astroCounts !== null && nauCounts !== null
        && astroCounts.visible >= nauCounts.visible,
      JSON.stringify({ nauCounts, astroCounts }));

    await setDateUTC("2026-08-27T13:00:00.000Z"); // JST 22:00 → night
    check("T6: night stage shown", (await stage()) === "夜 Night",
      JSON.stringify(await stage()));

    // ---- O5: Observer Sensitivity control present, default = typical (§20) ----
    const sens = await page.evaluate(() => {
      const group = document.querySelector('.seg-group[aria-label="観察者の感受性"]');
      if (!group) return null;
      const btns = Array.from(group.querySelectorAll("button"));
      const active = btns.filter((b) => b.className.includes("active"));
      return { count: btns.length, activeLabels: active.map((b) => b.textContent) };
    });
    check("O5: observer sensitivity group present (3 presets)",
      sens !== null && sens.count === 3,
      JSON.stringify(sens));
    check("O5: default is typical (標準 / 0.0 active)",
      sens !== null && sens.activeLabels.length === 1 && sens.activeLabels[0].includes("0.0"),
      JSON.stringify(sens ? sens.activeLabels : []));
    // clicking Sharp updates the UI without crashing
    await page.click('.seg-group[aria-label="観察者の感受性"] button:last-child');
    const sharpActive = await page.evaluate(() => {
      const group = document.querySelector('.seg-group[aria-label="観察者の感受性"]');
      const active = Array.from(group.querySelectorAll("button.active"));
      return active.map((b) => b.textContent);
    });
    check("O5: clicking Sharp activates it", sharpActive.length === 1 && sharpActive[0].includes("+0.5"),
      JSON.stringify(sharpActive));

    // ---- G3: responsive (<=860px) — canvas still has area, not tiny ----
    await page.setViewportSize({ width: 800, height: 600 });
    await new Promise((r) => setTimeout(r, 300));
    const small = await measure(page, ".app-canvas");
    check("G3: responsive canvas present", small !== null);
    check("G3: responsive canvas width is full", small && small.width > 400,
      `width=${small && small.width}`);
    check("G3: responsive canvas height >= 46vh (~276px)", small && small.height > 200,
      `height=${small && small.height}`);
  } finally {
    await browser.close();
    try {
      process.kill(-server.pid);
    } catch {
      server.kill();
    }
  }

  if (failures > 0) {
    console.log(`\n${failures} layout check(s) FAILED`);
    process.exitCode = 1;
  } else {
    console.log("\nAll layout checks passed");
  }
}

main().catch((e) => {
  console.error("verify-layout error:", e.message);
  process.exitCode = 1;
});
