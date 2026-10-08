# YTWash V1
Chrome Manifest V3 extension integrated into YouTube Watch Later. Built with TypeScript and Vite.

## Development
Run `npm install && npm run typecheck && npm run build`. Load the `dist` directory via Chrome > Extensions > Developer mode > Load unpacked.

## Status
Initial creator-grouping prototype. Groups currently rendered playlist items by creator in a collapsible section on the native Watch Later page. No new playlists or separate dashboard. This is **not** complete V1: large-playlist indexing, creator-continuous playback, timestamp resume, auto-removal, robust channel ID resolution, and end-to-end browser testing remain to be implemented.
