# AMYC Themes

Shared theme runtime and visual test harness for AMYC projects.

There are twelve theme families, each with five named brightness variants. Every family has its own signature hue and keeps it at both ends of the brightness slider: headers stay saturated, pages carry a visible tint, and the dark ends are deep jewel tones rather than neutral black. The pastel families (Mist, Lilac, and Rose) have light headers and darken to a softer dusk. Imperial is the exception by design and moves from white and gold to black and gold, including the header. Saved theme choices and font controls are unchanged.

The picker and spectrum slider follow a fixed rainbow order: Crimson, Sand, Imperial, Cypress, Tidepool, Mist, Glacier, Ultramarine, Lilac, Starlight, Orchid, and Rose. Imperial retains the original `ember` ID so existing saved preferences, custom CSS, and links remain compatible.

The package exports:

- `src/theme.js`: compact theme picker, lightness control, reset control, custom CSS editor, and shared or viewer-scoped localStorage keys. One contrast engine adjusts every family as brightness changes, including consumer chart fills and accent-tinted mastheads.
- `src/theme.css`: shared theme tokens, picker styles, and the public-records footer.
- `src/theme-bar.css`: opt-in shared layout and chrome styling for the compact theme bar.
- `src/bug-report.js`: shared bug reporter with page element annotations, browser state capture, GitHub issue draft support, optional POST endpoint support, and copy/download fallback.
- `src/bug-report.css`: bug reporter styles using the same AMYC theme tokens.
- `fixtures/theme-surface.html`: deterministic fixture for high risk surfaces, including dark shells with light document panels.
- `scripts/palettes.mjs`: the palette source. Each family is a few OKLCH hues; the script writes the base tokens into `src/theme.css` and the brightness stops into `src/theme.js`.
- `tests/visual-smoke.mjs`: contrast, picker, bug reporter, and screenshot smoke tests across all twelve themes and several lightness stops.
- `tests/theme-palettes.mjs`: contrast, color identity, header and page vibrancy, distinctness between families, keyboard selection, and preference checks for every family at every integer brightness setting, plus name, label, and preference parity with the original eight families.

The picker keeps the underlying theme IDs stable, but the current-theme label uses brightness aware names. For example, dragging Starlight lighter reports Daystar or Moonrise, while dragging it darker reports Midnight or Black Violet.

`theme.js` also mounts a bottom public-records footer on every page that loads it. The footer uses this wording:

```text
No claim to public records or data. Contact: db@amyc.us.
```

To suppress it on a non-viewer page, set `data-amyc-public-records-footer="off"` on the theme script, `html`, or `body`.

## Use

Every AMYC app loads the shared files from this repo's GitHub Pages site instead of keeping its own copy, so a merge to `master` updates every app at once. `.github/workflows/pages.yml` runs `npm test` on every push and pull request, and publishes `src/` and `fixtures/` only when the tests pass. The fixture is live at `https://aimesy.github.io/themes/fixtures/theme-surface.html`.

Link the hosted files, then add a compact button with `data-theme-toggle`.

```html
<link rel="stylesheet" href="https://aimesy.github.io/themes/src/theme.css">
<link rel="stylesheet" href="https://aimesy.github.io/themes/src/theme-bar.css">
<script src="https://aimesy.github.io/themes/src/theme.js" defer></script>
<div class="amyc-theme-bar">
  <strong>AMYC</strong>
  <span class="grow"></span>
  <button class="theme-toggle" type="button" data-theme-toggle aria-label="Theme spectrum" title="Theme spectrum"></button>
</div>
```

Keep app-specific labels and responsive hiding in the consumer. The shared
`amyc-theme-bar` class owns the common positioning, spacing, typography, and
theme-panel anchor without styling unrelated headers.

## Palettes

Edit a family's hues in `scripts/palettes.mjs`, then regenerate and test:

```bash
npm run palettes
npm test
```

Do not hand-edit the blocks between the `palettes:begin` and `palettes:end` markers in `src/theme.css` and `src/theme.js`; the script rewrites them.

## Persistence

The runtime uses shared keys by default: `amyc-theme`, `amyc-lightness`, `amyc-font-system`, `amyc-font-size`, `amyc-font-line`, `amyc-font-space`, and `amyc-custom-css`. Those keys persist display settings across every AMYC viewer on the same origin, including different repos served from that origin. The theme and font panels include a `Sync viewers` switch that fills with the theme's accent color while on. Turning it off stores settings under `amyc-viewer:<viewer-id>:...` so one viewer can keep its own theme and font settings.

Viewer ids come from `data-amyc-viewer`, `data-viewer`, or `data-viewer-id` when present, then fall back to the page path.

## Bug Reports

Link the hosted bug reporter files, then add a compact button with `data-bug-report`.

```html
<link rel="stylesheet" href="https://aimesy.github.io/themes/src/bug-report.css">
<script src="https://aimesy.github.io/themes/src/bug-report.js" defer></script>
<button
  class="hbtn"
  type="button"
  data-bug-report
  data-bug-report-app="SFSC"
  data-bug-report-repo="aimesy/sfsc"
  data-bug-report-labels="bug,site-report"
>Bug</button>
```

The reporter lets a user describe the bug, select page elements, add annotation notes, and send or preserve the captured report. The report includes URL, route/hash, viewport, browser metadata, theme state, public AMYC app storage keys, loaded scripts/stylesheets, selected element selectors/rectangles/text snippets, recent runtime errors, and automatically inferred public record context.

Without app-specific JavaScript, the reporter captures context from visible, focused, clicked, and annotated elements that carry `data-bug-report-context` or common public record attributes such as `data-case-number`, `data-record-id`, `data-record-title`, `data-row-hash`, `data-entity-key`, `data-bar-number`, `data-document-key`, or `data-sha256`. `data-bug-report-context` may be a plain label or a JSON object. These inferred records are included as `lastInteraction`, `annotatedRecords`, and `visibleRecords`, and can drive context-only GitHub issue titles.

Apps can attach public record identifiers and other app-specific state with an optional context provider. The provider is called when the report preview or submission is generated, so it should return the current state as a plain JSON-compatible object. Sensitive-looking keys are redacted and values are bounded before capture.

```html
<script>
  window.AMYC_BUG_REPORT = {
    context: () => ({
      activeRecord: { kind: "attorney", id: "bar:123456" },
      sourceSnapshot: "example-public-snapshot-id"
    })
  };
</script>
```

If `data-bug-report-endpoint` is set, the reporter posts JSON there first. If no endpoint is set, `data-bug-report-repo` opens a GitHub issue draft. If neither is set, the user can copy or download JSON, with `mailto:` as a final fallback.

## Test

```bash
npm install
npm run install:browsers
npm test
npm run visual
```

`npm test` fails on low contrast. `npm run visual` also writes screenshots to `test-output/screenshots/`.
