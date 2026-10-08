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

`brush-wordmark.svg`: red lowercase ytwash on an original black dry-brush paint stroke, transparent exterior; lettering outlined for portable SVG rendering. DejaVu font license retained in FONT-LICENSE.txt.

Favicon: `favicon.svg` uses a white painter’s brush on a red square tile, optimized for 16/32px. Exported SVG, PNG, ICO, and Apple touch assets are in `site/`; 16/32px extension icons use the same compact design.

`brush-wordmark-white.svg` and `brush-wordmark-white.png`: white-on-black alternative. The red-on-black wordmark remains available; original generated red design is `brush-wordmark-original.png`.
