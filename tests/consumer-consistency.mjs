import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectsRoot = path.resolve(__dirname, "..", "..");

const themeAssets = [
  "theme.css",
  "bug-report.css",
  "font-system.css",
  "theme.js",
  "bug-report.js",
  "font-system.js",
];

const htmlConsumers = [
  "me/index.html",
  "me/fiction.html",
  "nysc/index.html",
  "tentatives/site/index.html",
  "sfsc/index.html",
  "sfsc-audit-action/index.html",
  "sfsc-ci-fix-worktree/index.html",
  "sfsc-docs-split-push/index.html",
  "sfsc-index-live-fix/index.html",
  "sfsc-litigants-fix/index.html",
  "sfsc-origin-master-sync/index.html",
  "sfsc-public-cleanup-worktree/index.html",
];

const styleConsumers = [
  "me/assets/styles.css",
  "nysc/viewer/styles.css",
  "tentatives/site/styles.css",
];

const forbiddenPatterns = [
  [/const baseNames = \{/, "inline theme label shim"],
  [/:root\[data-theme=/, "local theme palette"],
  [/body \.bug-report-trigger/, "local bug report trigger override"],
  [/^\s*\.theme-panel\b/m, "local theme panel CSS"],
  [/^\s*\.theme-toggle\b/m, "local theme toggle CSS"],
  [/^\s*\.status-strip\b/m, "local status strip CSS"],
  [/^\s*\.cs-status-strip\b/m, "local case-search status strip CSS"],
  [/^\s*\.custom-css/m, "local custom CSS panel CSS"],
  [/^\s*\.lightness-/m, "local lightness control CSS"],
  [/^\s*\.theme-choice\b/m, "local theme choice CSS"],
  [/^\s*\.theme-spectrum\b/m, "local theme spectrum CSS"],
];

const errors = [];

function readRelative(relativePath) {
  const absolutePath = path.join(projectsRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`${relativePath}: missing expected consumer file`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

for (const relativePath of htmlConsumers) {
  const text = readRelative(relativePath);
  for (const asset of themeAssets) {
    const expected = `https://cdn.jsdelivr.net/gh/aimesy/themes@master/src/${asset}`;
    if (!text.includes(expected)) {
      errors.push(`${relativePath}: missing ${asset} from shared themes package`);
    }
  }
  for (const match of text.matchAll(/aimesy\/themes@([^/]+)\//g)) {
    if (match[1] !== "master") {
      errors.push(`${relativePath}: non-master themes ref ${match[0]}`);
    }
  }
}

for (const relativePath of [...htmlConsumers, ...styleConsumers]) {
  const text = readRelative(relativePath);
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(text)) {
      errors.push(`${relativePath}: ${label}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Consumer theme consistency passed for ${htmlConsumers.length} HTML consumers and ${styleConsumers.length} stylesheets.`);
