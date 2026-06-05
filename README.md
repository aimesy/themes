# AMYC Themes

Shared theme runtime and visual test harness for AMYC projects.

The package exports:

- `src/theme.js`: compact theme picker, lightness control, custom CSS editor, and shared localStorage keys.
- `src/theme.css`: shared theme tokens and picker styles.
- `fixtures/theme-surface.html`: deterministic fixture for high risk surfaces, including dark shells with light document panels.
- `tests/visual-smoke.mjs`: contrast and screenshot smoke tests across all eight themes and several lightness stops.

## Use

Vendor `src/theme.js` and `src/theme.css` into each static project, then add a compact button with `data-theme-toggle`.

```html
<link rel="stylesheet" href="theme.css">
<script src="theme.js" defer></script>
<button class="theme-toggle" type="button" data-theme-toggle aria-label="Theme spectrum" title="Theme spectrum"></button>
```

The runtime uses the shared keys `amyc-theme`, `amyc-lightness`, and `amyc-custom-css`.

## Test

```bash
npm install
npm run install:browsers
npm test
npm run visual
```

`npm test` fails on low contrast. `npm run visual` also writes screenshots to `test-output/screenshots/`.
