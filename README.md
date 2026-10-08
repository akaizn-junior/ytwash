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


## Versioned releases

GitHub Actions builds the extension once for every pushed version tag such as `v0.1.0` and publishes the output to **GitHub Releases**. Before publishing, the workflow checks that the tag matches both `package.json` and `public/manifest.json`, runs TypeScript checks, and verifies the extension build.

Release assets:
- `ytwash-vX.Y.Z.zip` — unpack to a folder, then in Chrome/Edge use **Extensions → Developer mode → Load unpacked** and select that folder.
- `ytwash-vX.Y.Z.sha256` — SHA-256 checksum of the ZIP.

Firefox can load the extension temporarily for development/testing; permanent distribution in Firefox requires Mozilla add-on signing. A GitHub ZIP is not automatically a signed Firefox add-on.

Release workflow: `.github/workflows/release.yml`. To publish, update both version fields, merge the changes, then create and push the matching `vX.Y.Z` tag on the release commit. Regular branch and PR builds remain available as GitHub Actions artifacts; they are not published releases. Version tags below 1.0 are published as prereleases.
