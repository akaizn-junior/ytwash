# YTWash

**Watch it. Clear it.**

YTWash makes YouTube's **Watch Later** playlist easier to browse and finish. Find videos from the same creator, play them in sequence, and pick up where you left off—all within YouTube.

> **Alpha release:** YTWash is experimental. Features have been tested against simulated YouTube pages in Chromium and Firefox, but have not yet been fully verified in a signed-in YouTube session. YouTube interface changes may affect how it works.

## Get YTWash

**[Download the latest experimental release](https://github.com/akaizn-junior/ytwash/releases)**

### Install in Chrome or Microsoft Edge

1. Open the **Releases** link above and download the latest `ytwash-*.zip` file from **Assets**. Do not download the “Source code” archive.
2. Extract the ZIP into a folder and keep that folder somewhere permanent.
3. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
4. Enable **Developer mode**.
5. Choose **Load unpacked** and select the **extracted folder containing `manifest.json`**.
6. Open or refresh [YouTube Watch Later](https://www.youtube.com/playlist?list=WL).

YTWash is not currently distributed through a browser extension store, so it must be installed manually.

**Firefox:** YTWash is also being tested in Firefox. The GitHub ZIP is not a signed Firefox add-on and cannot be installed permanently as a regular Firefox extension. For temporary testing, open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `manifest.json` from the extracted folder. Firefox removes temporary add-ons when the browser closes.

## What you can do

### Group Watch Later videos by creator

Open [Watch Later](https://www.youtube.com/playlist?list=WL). The playlist stays in YouTube's normal view until you click **Group by creator**.

YTWash then groups the videos currently loaded in the page. Click **Grouping on · Undo** to restore the original order. Grouping is a one-time action; if YouTube loads more videos afterward, turn grouping off and on again to include them.

### Play videos in display order

Click a video's native YouTube title or thumbnail in Watch Later. YTWash plays the remaining indexed videos in their displayed order. The queue lasts for the current browsing session.

### Save to Watch Later at the current time

On a video page, open YouTube’s action menu and select **Save**. A small lightning icon to the right marks YTWash’s enhanced Save. It automatically selects Watch Later and saves the timestamp from the moment you clicked. Saving again updates the timestamp without removing a video already in Watch Later.

The next time you open that video in the same browser profile, YTWash resumes from your saved position. Watch Later playback uses YouTube’s native timestamp URL for saved positions. A start time explicitly included in the video URL takes priority. Your timestamp is saved immediately. If YouTube’s Watch Later control cannot be found or its state is unclear, the native chooser stays available so you can add the video yourself.

### Configure YTWash

Click YTWash’s toolbar icon, or open its **Options** from your browser’s extension manager (`chrome://extensions`, `edge://extensions`, or Firefox’s `about:addons`). Preferences apply to open YouTube tabs and stay local to this browser:

- **Save to Watch Later at the current time** (on by default). Turn it off to restore YouTube’s regular Save chooser.
- **Resume saved videos automatically** (on by default).
- **Remove completed videos from Watch Later** (off by default). After natural playback ends and at least five seconds of playback have been detected, YTWash attempts removal using YouTube’s controls only when Watch Later membership is confirmed. It does not close the tab.

YTWash adds no timestamp button or automatic-removal checkbox to the video page.

## What to expect from this alpha

- YTWash works inside YouTube; it does not create or manage a separate playlist.
- Creator grouping depends on videos YouTube has loaded into the page. For large playlists, load more videos in YouTube, then turn grouping off and on again.
- Saved timestamps are local to the browser profile; they do not sync across devices.
- Playback, resume, and playlist controls depend on YouTube's current interface and may stop working if YouTube changes it.
- Automated Chromium and Firefox tests use simulated YouTube pages. Real, signed-in YouTube behavior still needs validation.
- YTWash is not affiliated with or endorsed by YouTube or Google.

## Privacy

YTWash runs in your browser. It accesses YouTube pages to provide its features, stores saved playback positions and your automatic-removal preference locally, and uses YouTube's visible playlist controls. The extension does **not** require a YTWash account or run its own backend service.

## Help and feedback

Found a bug or a YouTube page that doesn't work as expected? [Report an issue](https://github.com/akaizn-junior/ytwash/issues). Include your browser, YTWash version, what you tried, and what happened. Please avoid sharing private account information.

YTWash is [open source under the MIT License](LICENSE).
