import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const fixtureUrl = pathToFileURL(path.join(rootDir, "fixtures", "theme-surface.html")).href;
const writeScreenshots = process.argv.includes("--write-screenshots");
const outDir = path.join(rootDir, "test-output", "screenshots");

const themes = [
  "mist",
  "lilac",
  "glacier",
  "rose",
  "sand",
  "tidepool",
  "cypress",
  "starlight",
];

const lightnessStops = [-24, 0, 24];

const labelExpectations = [
  { theme: "sand", lightness: 0, label: "Sand" },
  { theme: "tidepool", lightness: 24, label: "Tideglass" },
  { theme: "starlight", lightness: 40, label: "Daystar" },
  { theme: "starlight", lightness: -40, label: "Black Violet" },
];

function slug(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function setTheme(page, theme, lightness) {
  await page.evaluate(
    ({ theme, lightness }) => {
      localStorage.setItem("amyc-theme", theme);
      localStorage.setItem("amyc-lightness", String(lightness));
      localStorage.removeItem("amyc-custom-css");
    },
    { theme, lightness },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    ({ theme }) => document.documentElement.dataset.theme === theme,
    { theme },
  );
}

async function contrastAudit(page) {
  return page.evaluate(() => {
    function parseColor(value) {
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(",").map((part) => part.trim());
      return {
        r: Number(parts[0]),
        g: Number(parts[1]),
        b: Number(parts[2]),
        a: parts[3] == null ? 1 : Number(parts[3]),
      };
    }

    function blend(fg, bg) {
      const alpha = Number.isFinite(fg.a) ? fg.a : 1;
      return {
        r: fg.r * alpha + bg.r * (1 - alpha),
        g: fg.g * alpha + bg.g * (1 - alpha),
        b: fg.b * alpha + bg.b * (1 - alpha),
        a: 1,
      };
    }

    function backgroundFor(el) {
      let current = el;
      let color = { r: 255, g: 255, b: 255, a: 1 };
      const chain = [];
      while (current && current.nodeType === 1) {
        chain.unshift(current);
        current = current.parentElement;
      }
      for (const node of chain) {
        const bg = parseColor(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0) color = blend(bg, color);
      }
      return color;
    }

    function luminance(color) {
      const parts = [color.r, color.g, color.b].map((component) => {
        const channel = component / 255;
        return channel <= 0.03928
          ? channel / 12.92
          : Math.pow((channel + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
    }

    function contrast(fg, bg) {
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const high = Math.max(l1, l2);
      const low = Math.min(l1, l2);
      return (high + 0.05) / (low + 0.05);
    }

    return Array.from(document.querySelectorAll("[data-contrast-check]")).map((el) => {
      const style = getComputedStyle(el);
      const fg = parseColor(style.color) || { r: 0, g: 0, b: 0, a: 1 };
      const bg = backgroundFor(el);
      const ratio = contrast(blend(fg, bg), bg);
      const min = Number(el.getAttribute("data-contrast-min") || "4.5");
      return {
        label: el.getAttribute("data-contrast-check"),
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
        color: style.color,
        background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        ratio: Number(ratio.toFixed(2)),
        min,
        ok: ratio >= min,
      };
    });
  });
}

async function pickerAudit(page) {
  const button = page.locator("[data-theme-toggle]");
  if (await button.count() !== 1) throw new Error("Expected exactly one theme toggle in fixture");
  await button.click();
  const result = await page.evaluate(() => {
    const panel = Array.from(document.querySelectorAll(".theme-panel")).find((el) => !el.hidden);
    const rect = panel?.getBoundingClientRect();
    return {
      open: !!panel,
      choices: panel ? panel.querySelectorAll(".theme-choice").length : 0,
      width: rect ? Math.round(rect.width) : 0,
      scrollWidth: panel ? Math.round(panel.scrollWidth) : 0,
      clientWidth: panel ? Math.round(panel.clientWidth) : 0,
      hasCustomCss: !!panel?.querySelector("[data-custom-css]"),
      hasLightness: !!panel?.querySelector(".lightness-input"),
    };
  });
  await page.keyboard.press("Escape");
  return result;
}

async function bugReportAudit(page) {
  const button = page.locator("[data-bug-report]");
  if (await button.count() !== 1) throw new Error("Expected exactly one bug report trigger in fixture");
  await button.click();
  await page.locator(".bug-report-modal").waitFor({ state: "visible" });
  await page.locator(".bug-report-textarea").fill("Packet title wraps incorrectly");
  await page.getByRole("button", { name: "Select Element" }).click();
  await page.locator(".packet-code").first().click();
  const result = await page.evaluate(() => {
    const modal = document.querySelector(".bug-report-modal");
    const preview = modal?.querySelector(".bug-report-preview pre");
    const report = preview?.textContent ? JSON.parse(preview.textContent) : null;
    return {
      open: !!modal,
      annotations: modal ? modal.querySelectorAll(".bug-report-annotation").length : 0,
      markers: document.querySelectorAll(".bug-report-marker").length,
      description: report?.description || "",
      app: report?.app || "",
      url: report?.page?.url || "",
      theme: report?.theme?.theme || "",
      viewportWidth: report?.browser?.viewport?.width || 0,
      selector: report?.annotations?.[0]?.selector || "",
      label: report?.annotations?.[0]?.label || "",
    };
  });
  await page.keyboard.press("Escape");
  return result;
}

async function labelAudit(page) {
  const failures = [];
  for (const expected of labelExpectations) {
    await setTheme(page, expected.theme, expected.lightness);
    const actual = await page.evaluate(() => {
      const current = document.querySelector("[data-theme-current]");
      const toggle = document.querySelector("[data-theme-toggle]");
      return {
        current: current?.textContent?.trim() || "",
        currentTitle: current?.getAttribute("title") || "",
        toggleTitle: toggle?.getAttribute("title") || "",
      };
    });
    if (actual.current !== expected.label) {
      failures.push(`${expected.theme}/${expected.lightness}: expected label ${expected.label}, saw ${actual.current || "<empty>"}`);
    }
    if (!actual.toggleTitle.includes(expected.label) || !actual.currentTitle.includes(expected.label)) {
      failures.push(`${expected.theme}/${expected.lightness}: theme titles did not include ${expected.label}: ${JSON.stringify(actual)}`);
    }
  }
  return failures;
}

const browser = await chromium.launch();
const failures = [];

try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 760 } });
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });

  const picker = await pickerAudit(page);
  if (!picker.open || picker.choices !== 8 || !picker.hasCustomCss || !picker.hasLightness) {
    failures.push(`Theme picker structure failed: ${JSON.stringify(picker)}`);
  }
  if (picker.scrollWidth > picker.clientWidth + 1 || picker.width > 300) {
    failures.push(`Theme picker overflow or width failed: ${JSON.stringify(picker)}`);
  }
  failures.push(...await labelAudit(page));

  const bugReport = await bugReportAudit(page);
  if (!bugReport.open || bugReport.annotations !== 1 || bugReport.markers !== 1) {
    failures.push(`Bug reporter structure failed: ${JSON.stringify(bugReport)}`);
  }
  if (
    bugReport.description !== "Packet title wraps incorrectly"
    || bugReport.app !== "AMYC Theme Fixture"
    || !bugReport.url.includes("theme-surface.html")
    || !bugReport.theme
    || bugReport.viewportWidth !== 1024
    || !bugReport.selector
    || !/packet-code|OSC 2/i.test(bugReport.label)
  ) {
    failures.push(`Bug reporter payload failed: ${JSON.stringify(bugReport)}`);
  }

  if (writeScreenshots) await mkdir(outDir, { recursive: true });

  for (const theme of themes) {
    for (const lightness of lightnessStops) {
      await setTheme(page, theme, lightness);
      const rows = await contrastAudit(page);
      const badRows = rows.filter((row) => !row.ok);
      for (const row of badRows) {
        failures.push(`${theme}/${lightness}: ${row.label} contrast ${row.ratio} < ${row.min} (${row.color} on ${row.background}) text="${row.text}"`);
      }
      if (writeScreenshots) {
        await page.screenshot({
          path: path.join(outDir, `${slug(theme)}-${lightness}.png`),
          fullPage: true,
        });
      }
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`visual smoke passed: ${themes.length} themes x ${lightnessStops.length} lightness stops`);
