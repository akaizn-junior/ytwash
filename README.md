# YTWash

**Watch it. Clear it.**

YTWash is a Chrome extension that enhances YouTube's native **Watch Later** playlist without creating another dashboard or additional playlists.

## Stack

TypeScript · Vite · Chrome Manifest V3

## Development

```bash
npm install
npm run typecheck
npm run build
```

To try the development build, open Chrome → Extensions → Developer mode → Load unpacked, then select the generated `dist/` directory.

## Current implementation

- Chrome extension scaffold with Manifest V3.
- Initial collapsible creator-grouping view embedded into the native Watch Later page, currently based on rendered playlist entries.
- GitHub Actions build workflow.

## V1 roadmap

- [ ] Reliable creator grouping by stable channel ID, including lazy-loaded playlist entries.
- [ ] Play videos from the selected creator consecutively.
- [ ] Save and resume individual video timestamps.
- [ ] Remove completed videos from the native Watch Later playlist.
- [ ] Keep grouped content synchronized with playlist changes and navigation.
- [ ] Validate the complete workflow in a signed-in browser session.

**Status:** Initial prototype. These V1 features are not yet fully implemented or browser-tested.

## Principles

Keep everything inside YouTube, preserve the native playlist and controls, and never create duplicate playlists.

Smart prefetch and seamless transitions are deferred to V2.
