# AMYC Themes

Shared theme runtime and visual test harness for AMYC projects.

The package exports:

- `src/theme.js`: compact theme picker, lightness control, reset control, custom CSS editor, and shared or viewer-scoped localStorage keys.
- `src/theme.css`: shared theme tokens, picker styles, and the public-records footer.
- `src/bug-report.js`: shared bug reporter with page element annotations, browser state capture, GitHub issue draft support, optional POST endpoint support, and copy/download fallback.
- `src/bug-report.css`: bug reporter styles using the same AMYC theme tokens.
- `fixtures/theme-surface.html`: deterministic fixture for high risk surfaces, including dark shells with light document panels.
- `tests/visual-smoke.mjs`: contrast, picker, bug reporter, and screenshot smoke tests across all eight themes and several lightness stops.

The picker keeps the underlying eight theme IDs stable, but the current-theme label uses brightness aware names. For example, dragging Starlight lighter reports Daystar or Moonrise, while dragging it darker reports Midnight or Black Violet.

`theme.js` also mounts a bottom public-records footer on every page that loads it. The footer uses this wording:

```text
No claim to public records or data. Contact: db@amyc.us.
```

To suppress it on a non-viewer page, set `data-amyc-public-records-footer="off"` on the theme script, `html`, or `body`.

## Use

Vendor `src/theme.js` and `src/theme.css` into each static project, then add a compact button with `data-theme-toggle`.

```html
<link rel="stylesheet" href="theme.css">
<script src="theme.js" defer></script>
<button class="theme-toggle" type="button" data-theme-toggle aria-label="Theme spectrum" title="Theme spectrum"></button>
```

The runtime uses shared keys by default: `amyc-theme`, `amyc-lightness`, `amyc-font-system`, `amyc-font-size`, `amyc-font-line`, `amyc-font-space`, and `amyc-custom-css`. Those keys persist display settings across every AMYC viewer on the same origin, including different repos served from that origin. The picker also includes a `Sync viewers` toggle. Turning it off stores settings under `amyc-viewer:<viewer-id>:...` so one viewer can keep its own theme and font settings.

Viewer ids come from `data-amyc-viewer`, `data-viewer`, or `data-viewer-id` when present, then fall back to the page path.

## Bug Reports

Vendor `src/bug-report.js` and `src/bug-report.css` with the theme assets, then add a compact button with `data-bug-report`.

```html
<link rel="stylesheet" href="bug-report.css">
<script src="bug-report.js" defer></script>
<button
  class="hbtn"
  type="button"
  data-bug-report
  data-bug-report-app="SFSC"
  data-bug-report-repo="aimesy/sfsc"
  data-bug-report-labels="bug,site-report"
>Bug</button>
```

The reporter lets a user describe the bug, select page elements, add annotation notes, and send or preserve the captured report. The report includes URL, route/hash, viewport, browser metadata, theme state, public AMYC app storage keys, loaded scripts/stylesheets, selected element selectors/rectangles/text snippets, and recent runtime errors.

If `data-bug-report-endpoint` is set, the reporter posts JSON there first. If no endpoint is set, `data-bug-report-repo` opens a GitHub issue draft. If neither is set, the user can copy or download JSON, with `mailto:` as a final fallback.

## Test

```bash
npm install
npm run install:browsers
npm test
npm run visual
```

`npm test` fails on low contrast. `npm run visual` also writes screenshots to `test-output/screenshots/`.
