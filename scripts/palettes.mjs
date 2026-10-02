// Builds every theme palette from a small OKLCH spec and writes the results
// into src/theme.css (base tokens) and src/theme.js (brightness stops).
// Run `npm run palettes` after editing a family below, then `npm test`.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Hues are OKLCH degrees. h: surfaces and header, c: header when it differs,
// a: accent and bars, a2: second accent, l: links, x: header highlight.
// header sets the light-stop header tone; light headers get dark header text.
// depth scales surface chroma at the dark stops.
// Families appear in picker (rainbow) order.
export const families = [
  {
    id: "crimson", name: "Crimson", note: "Crimson and blush", polarity: "light",
    names: { lightest: "Petal", lighter: "Peony", base: "Crimson", darker: "Garnet", darkest: "Oxblood" },
    hue: { h: 22, a: 24, l: 252, x: 8 },
    depth: 1.25,
  },
  {
    id: "sand", name: "Sand", note: "Terracotta and turquoise", polarity: "light",
    names: { lightest: "Sunlit Sand", lighter: "Dune", base: "Sand", darker: "Umber", darkest: "Burnt Umber" },
    hue: { h: 68, c: 50, a: 60, l: 205, x: 195 },
  },
  {
    id: "ember", name: "Imperial", note: "White, black, and gold", polarity: "light", neutral: true,
    names: { lightest: "White Gold", lighter: "Champagne", base: "Imperial", darker: "Gilt", darkest: "Black Gold" },
    hue: { h: 85, a: 82, l: 78, x: 88 },
  },
  {
    id: "cypress", name: "Cypress", note: "Forest and lime", polarity: "dark",
    names: { lightest: "Fern", lighter: "Grove", base: "Cypress", darker: "Old Growth", darkest: "Blackwood" },
    hue: { h: 150, a: 128, l: 190, x: 122 },
  },
  {
    id: "tidepool", name: "Tidepool", note: "Teal and coral", polarity: "light",
    names: { lightest: "Seafoam", lighter: "Tideglass", base: "Tidepool", darker: "Kelp", darkest: "Deep Kelp" },
    hue: { h: 176, a: 180, l: 240, x: 38 },
    depth: 1.15,
  },
  {
    id: "mist", name: "Mist", note: "Bright aqua", polarity: "light",
    names: { lightest: "Whiteout", lighter: "Sea Mist", base: "Mist", darker: "Harbor Fog", darkest: "Deep Fog" },
    hue: { h: 214, a: 205, l: 250, x: 175 },
    depth: 0.8,
    header: { L: 0.8, C: 0.11 },
  },
  {
    id: "glacier", name: "Glacier", note: "Icy cobalt", polarity: "light",
    names: { lightest: "Snowcap", lighter: "Blue Ice", base: "Glacier", darker: "Crevasse", darkest: "Polar Night" },
    hue: { h: 250, a: 240, l: 262, x: 205 },
    depth: 1.15,
  },
  {
    id: "ultramarine", name: "Ultramarine", note: "Ultramarine and amber", polarity: "light",
    names: { lightest: "Porcelain", lighter: "Periwinkle", base: "Ultramarine", darker: "Lapis", darkest: "Abyss" },
    hue: { h: 272, a: 276, l: 305, x: 70 },
    depth: 1.6,
    header: { L: 0.37, C: 0.2 },
  },
  {
    id: "lilac", name: "Lilac", note: "Lavender and mint", polarity: "light",
    names: { lightest: "Pale Lilac", lighter: "Wisteria", base: "Lilac", darker: "Mauve", darkest: "Night Plum" },
    hue: { h: 298, a: 290, l: 268, x: 162 },
    depth: 0.85,
    header: { L: 0.76, C: 0.1 },
  },
  {
    id: "starlight", name: "Starlight", note: "Violet night and gold", polarity: "dark",
    names: { lightest: "Daystar", lighter: "Moonrise", base: "Starlight", darker: "Midnight", darkest: "Black Violet" },
    hue: { h: 302, a: 86, a2: 300, l: 195, x: 88 },
  },
  {
    id: "orchid", name: "Orchid", note: "Magenta and lime", polarity: "light",
    names: { lightest: "Bloom", lighter: "Mallow", base: "Orchid", darker: "Mulberry", darkest: "Aubergine" },
    hue: { h: 328, a: 330, l: 255, x: 118 },
    depth: 1.3,
  },
  {
    id: "rose", name: "Rose", note: "Rose and peach gold", polarity: "light",
    names: { lightest: "Blush", lighter: "Rosewater", base: "Rose", darker: "Mauve Rose", darkest: "Dark Rose" },
    hue: { h: 354, a: 350, l: 228, x: 62 },
    depth: 0.85,
    header: { L: 0.8, C: 0.09 },
  },
];

// [lightness, chroma, hue role] per token. Fixed numeric hues keep status
// colors recognizable across families.
const WARN = 38, OK = 150, CAUTION = 78;
const profiles = {
  lightest: {
    paper: [0.984, 0.012, "h"], "paper-2": [0.962, 0.024, "h"], "paper-3": [0.93, 0.038, "h"],
    plain: [1, 0, "h"], "plain-soft": [0.99, 0.008, "h"], "page-paper": [1, 0, "h"], "page-line": [0.89, 0.055, "h"],
    ink: [0.22, 0.035, "h"], "ink-2": [0.34, 0.04, "h"], "ink-3": [0.44, 0.045, "h"], "ink-4": [0.64, 0.04, "h"],
    rule: [0.82, 0.08, "h"], "rule-2": [0.915, 0.04, "h"],
    chrome: [0.5, 0.18, "c"], "chrome-rule": [0.4, 0.15, "c"], "chrome-ink": [0.99, 0.012, "c"], "chrome-accent": [0.93, 0.08, "x"],
    accent: [0.47, 0.19, "a"], "accent-2": [0.52, 0.17, "a2"], link: [0.45, 0.15, "l"],
    warn: [0.5, 0.17, WARN], ok: [0.5, 0.13, OK], "good-border": [0.78, 0.1, OK], "good-bg": [0.97, 0.03, OK],
    "warn-border": [0.8, 0.11, CAUTION], "warn-bg": [0.972, 0.035, CAUTION], "warn-ink": [0.46, 0.1, 60],
    "bar-fill": [0.55, 0.19, "a"], "row-hover": [0.95, 0.032, "h"],
  },
  base: {
    paper: [0.962, 0.03, "h"], "paper-2": [0.922, 0.05, "h"], "paper-3": [0.88, 0.068, "h"],
    plain: [0.99, 0.012, "h"], "plain-soft": [0.976, 0.022, "h"], "page-paper": [0.995, 0.008, "h"], "page-line": [0.855, 0.08, "h"],
    ink: [0.24, 0.04, "h"], "ink-2": [0.35, 0.045, "h"], "ink-3": [0.45, 0.05, "h"], "ink-4": [0.62, 0.045, "h"],
    rule: [0.76, 0.11, "h"], "rule-2": [0.87, 0.06, "h"],
    chrome: [0.44, 0.17, "c"], "chrome-rule": [0.34, 0.13, "c"], "chrome-ink": [0.975, 0.015, "c"], "chrome-accent": [0.89, 0.11, "x"],
    accent: [0.46, 0.19, "a"], "accent-2": [0.51, 0.17, "a2"], link: [0.44, 0.15, "l"],
    warn: [0.49, 0.17, WARN], ok: [0.49, 0.13, OK], "good-border": [0.76, 0.11, OK], "good-bg": [0.955, 0.04, OK],
    "warn-border": [0.78, 0.12, CAUTION], "warn-bg": [0.96, 0.045, CAUTION], "warn-ink": [0.45, 0.1, 60],
    "bar-fill": [0.53, 0.19, "a"], "row-hover": [0.935, 0.045, "h"],
  },
  deep: {
    paper: [0.3, 0.085, "h"], "paper-2": [0.265, 0.075, "h"], "paper-3": [0.345, 0.095, "h"],
    plain: [0.32, 0.085, "h"], "plain-soft": [0.285, 0.08, "h"], "page-paper": [0.33, 0.085, "h"], "page-line": [0.46, 0.11, "h"],
    ink: [0.97, 0.012, "h"], "ink-2": [0.9, 0.03, "h"], "ink-3": [0.83, 0.045, "h"], "ink-4": [0.66, 0.05, "h"],
    rule: [0.5, 0.12, "h"], "rule-2": [0.4, 0.1, "h"],
    chrome: [0.34, 0.13, "c"], "chrome-rule": [0.46, 0.13, "c"], "chrome-ink": [0.965, 0.02, "c"], "chrome-accent": [0.87, 0.12, "x"],
    accent: [0.8, 0.14, "a"], "accent-2": [0.75, 0.15, "a2"], link: [0.83, 0.11, "l"],
    warn: [0.79, 0.13, WARN], ok: [0.81, 0.13, OK], "good-border": [0.58, 0.11, OK], "good-bg": [0.3, 0.055, OK],
    "warn-border": [0.62, 0.11, CAUTION], "warn-bg": [0.3, 0.05, CAUTION], "warn-ink": [0.87, 0.1, CAUTION],
    "bar-fill": [0.75, 0.16, "a"], "row-hover": [0.37, 0.1, "h"],
  },
  deepest: {
    paper: [0.235, 0.07, "h"], "paper-2": [0.2, 0.06, "h"], "paper-3": [0.28, 0.08, "h"],
    plain: [0.255, 0.072, "h"], "plain-soft": [0.22, 0.065, "h"], "page-paper": [0.265, 0.072, "h"], "page-line": [0.4, 0.1, "h"],
    ink: [0.97, 0.01, "h"], "ink-2": [0.9, 0.028, "h"], "ink-3": [0.82, 0.042, "h"], "ink-4": [0.64, 0.05, "h"],
    rule: [0.44, 0.11, "h"], "rule-2": [0.34, 0.09, "h"],
    chrome: [0.28, 0.11, "c"], "chrome-rule": [0.4, 0.12, "c"], "chrome-ink": [0.96, 0.02, "c"], "chrome-accent": [0.86, 0.12, "x"],
    accent: [0.8, 0.15, "a"], "accent-2": [0.75, 0.15, "a2"], link: [0.83, 0.11, "l"],
    warn: [0.79, 0.13, WARN], ok: [0.81, 0.13, OK], "good-border": [0.56, 0.1, OK], "good-bg": [0.25, 0.045, OK],
    "warn-border": [0.6, 0.1, CAUTION], "warn-bg": [0.25, 0.045, CAUTION], "warn-ink": [0.87, 0.1, CAUTION],
    "bar-fill": [0.75, 0.16, "a"], "row-hover": [0.3, 0.085, "h"],
  },
};
const blend = (a, b, t) => Object.fromEntries(Object.keys(a).map((token) => [
  token, [a[token][0] + (b[token][0] - a[token][0]) * t, a[token][1] + (b[token][1] - a[token][1]) * t, a[token][2]],
]));
profiles.lighter = blend(profiles.base, profiles.lightest, 0.5);
// Dark-polarity families start at the deep profile and go deeper.
profiles.night = blend(profiles.deep, profiles.deepest, 0.5);
profiles.dusk = blend(profiles.base, profiles.lightest, 0.15);

const stopProfiles = {
  light: { lightest: "lightest", lighter: "lighter", base: "base", darker: "deep", darkest: "deepest" },
  dark: { lightest: "lighter", lighter: "dusk", base: "deep", darker: "night", darkest: "deepest" },
};

// Imperial stays neutral white or black. Gold carries the color.
const neutralTokens = new Set([
  "paper", "paper-2", "paper-3", "plain", "plain-soft", "page-paper",
  "ink", "ink-2", "ink-3", "ink-4", "chrome", "chrome-ink", "row-hover",
]);
function imperial(stop, token, [L, C, role]) {
  const dark = stop === "darker" || stop === "darkest";
  if (token === "chrome") return [dark ? (stop === "darkest" ? 0 : 0.14) : 1, 0, 0];
  if (token === "chrome-ink") return [dark ? 0.96 : 0.22, 0, 0];
  if (neutralTokens.has(token)) {
    const lift = dark ? (stop === "darkest" ? -0.09 : -0.06) : 0;
    return [Math.max(0, L + lift), 0, 0];
  }
  if (["rule", "rule-2", "page-line", "chrome-rule"].includes(token)) {
    return dark ? [{ rule: 0.66, "rule-2": 0.52, "page-line": 0.5, "chrome-rule": 0.6 }[token], 0.13, 84]
      : [{ rule: 0.7, "rule-2": 0.82, "page-line": 0.85, "chrome-rule": 0.7 }[token], 0.13, 86];
  }
  if (["accent", "accent-2", "link", "bar-fill", "chrome-accent"].includes(token)) {
    return dark ? [{ accent: 0.83, "accent-2": 0.8, link: 0.88, "bar-fill": 0.8, "chrome-accent": 0.85 }[token], 0.15, 86]
      : [{ accent: 0.5, "accent-2": 0.47, link: 0.46, "bar-fill": 0.56, "chrome-accent": 0.52 }[token], 0.12, 82];
  }
  return [L, C, role];
}

const hueFor = (family, role) => typeof role === "number" ? role
  : role === "c" ? family.hue.c ?? family.hue.h
  : role === "a2" ? family.hue.a2 ?? family.hue.a
  : family.hue[role];

const lightProfiles = new Set(["lightest", "lighter", "base", "dusk"]);
function header(family, profileName, token, spec) {
  if (!family.header || !lightProfiles.has(profileName)) return spec;
  const { L, C } = family.header;
  const lift = profileName === "lightest" ? 0.04 : profileName === "lighter" ? 0.02 : 0;
  const lightHeader = L > 0.6;
  return {
    chrome: [L + lift, C, "c"],
    "chrome-rule": [L + lift - (lightHeader ? 0.14 : 0.1), C, "c"],
    "chrome-ink": lightHeader ? [0.24, 0.06, "c"] : spec,
    "chrome-accent": lightHeader ? [0.42, 0.16, "a"] : spec,
  }[token] || spec;
}

export function palette(family, stop) {
  const profileName = stopProfiles[family.polarity][stop];
  const depth = lightProfiles.has(profileName) ? 1 : family.depth ?? 1;
  return Object.fromEntries(Object.entries(profiles[profileName]).map(([token, spec]) => {
    const [L, C, role] = family.neutral ? imperial(stop, token, spec) : header(family, profileName, token, spec);
    return [token, oklchToHex(L, role === "h" || role === "c" ? C * depth : C, hueFor(family, role))];
  }));
}

// OKLCH -> sRGB with chroma reduction for out-of-gamut colors.
function oklchToLinear(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
const encode = (v) => {
  const c = Math.min(1, Math.max(0, v));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
};
export function oklchToHex(L, C, h) {
  let low = 0, high = C;
  if (!inGamut(oklchToLinear(L, C, h))) {
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToLinear(L, mid, h))) low = mid; else high = mid;
    }
    C = low;
  }
  return "#" + oklchToLinear(L, C, h).map(encode).map((v) => v.toString(16).padStart(2, "0")).join("");
}

const tokenOrder = Object.keys(profiles.base);
function cssBlock(family) {
  const selector = family.id === "sand" ? ':root,\n:root[data-theme="sand"]' : `:root[data-theme="${family.id}"]`;
  const tokens = palette(family, "base");
  return `${selector} {\n  color-scheme: var(--theme-color-scheme, ${family.polarity});\n${
    tokenOrder.map((token) => `  --${token}: ${tokens[token]};`).join("\n")}\n}`;
}

function jsTokens(tokens, indent) {
  const keys = tokenOrder.map((token) => `${/-/.test(token) ? `"${token}"` : token}: "${tokens[token]}"`);
  const lines = [];
  for (let i = 0; i < keys.length; i += 5) lines.push(`${indent}${keys.slice(i, i + 5).join(", ")},`);
  return lines.join("\n");
}

function jsStops(name, light, dark) {
  return `  const ${name} = {\n${families.map((family) => `    ${family.id}: {\n      light: {\n${
    jsTokens(palette(family, light), "        ")}\n      },\n      dark: {\n${
    jsTokens(palette(family, dark), "        ")}\n      },\n    },`).join("\n")}\n  };`;
}

function jsThemes() {
  return `  const themes = [\n${families.map((family) => {
    const base = palette(family, "base");
    const names = ["lightest", "lighter", "base", "darker", "darkest"]
      .map((stop) => `        ${stop}: ${JSON.stringify(family.names[stop])},`).join("\n");
    return `    {\n      id: "${family.id}",\n      name: "${family.name}",\n      note: "${family.note}",\n      names: {\n${names}\n      },\n` +
      // Imperial's swatch shows both ends: white, gold, and black.
      `      colors: ["${base.chrome}", "${base["paper-2"]}", "${base.accent}", "${family.neutral ? palette(family, "darkest").paper : base.plain}"],\n` +
      `      signature: "${family.neutral ? base["bar-fill"] : base.chrome}",\n    },`;
  }).join("\n")}\n  ];`;
}

function splice(text, begin, end, body) {
  const start = text.indexOf(begin), stop = text.indexOf(end);
  if (start < 0 || stop < start) throw new Error(`Missing ${begin} ... ${end}`);
  return text.slice(0, start + begin.length) + "\n" + body + "\n" + text.slice(stop);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cssPath = path.join(root, "src", "theme.css");
  const jsPath = path.join(root, "src", "theme.js");
  const css = await readFile(cssPath, "utf8");
  await writeFile(cssPath, splice(css, "/* palettes:begin (generated by scripts/palettes.mjs) */",
    "/* palettes:end */", families.map(cssBlock).join("\n\n")));
  const js = await readFile(jsPath, "utf8");
  await writeFile(jsPath, splice(js, "  // palettes:begin (generated by scripts/palettes.mjs)", "  // palettes:end",
    [jsThemes(), jsStops("themeMidpoints", "lighter", "darker"), jsStops("themeVariants", "lightest", "darkest")].join("\n")));
  console.log(`Wrote ${families.length} palettes to src/theme.css and src/theme.js`);
}
