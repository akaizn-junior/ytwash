# YTWash publishing assets

White rounded video button with a bold red painter’s brush silhouette. The original SVG uses paths, so it needs no external fonts. Transparent PNG icons are in `public/icons/` at 16, 32, 48, 64, 128, 256, and 512 pixels. Both browser bundles use the appropriate icons automatically.

- `logo.svg`: scalable master, transparent exterior.
- `store-tile.png`: 440 × 280 small promotional tile.
- `store-marquee.png`: 1400 × 560 promotional banner.
- `social-preview.png`: 1200 × 630 release/social graphic.
- Corresponding HTML files: editable promotional graphic sources.

Slogan: **watch it. clear it.**

Palette: red `#ff0033`, white `#ffffff`. The white button is intended for colored or dark backgrounds. Promotional copy describes creator groups and saved timestamps without claiming YouTube affiliation.

Recreate PNG exports with `PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node scripts/export-brand.mjs` after installing the Playwright Chromium browser. Review store-specific listing requirements before upload; promotional graphics do not replace screenshots of the actual extension.

The painter’s brush uses simple original SVG paths with broad bristle cuts for clarity at small sizes.
