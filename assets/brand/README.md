# YTWash publishing assets

Logo: a red play button with a white triangle above three red raindrops. Slogan: **watch it. clear it.**

`logo.svg` is the vector master with outlined lettering and transparent exterior. `favicon.svg` uses the same design. Transparent extension icons are exported at 16, 32, 48, 64, 128, 256, and 512 pixels in `public/icons/`. Site favicons include SVG, PNG, ICO, and a 180px Apple touch icon.

Promotional graphics: 440×280 store tile, 1400×560 store marquee, and 1200×630 social preview. Editable HTML sources are included. Recreate exports using `node scripts/export-brand.mjs` with Playwright Chromium installed.

Palette: red `#ff0033`, white `#ffffff`. Previous outlined text concepts use DejaVu Sans Bold; see FONT-LICENSE.txt. Brush-stroke files and `wash-button.svg` are retained as previous concepts.
