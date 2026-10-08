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

### Find videos by creator

Open [Watch Later](https://www.youtube.com/playlist?list=WL). YTWash adds a **Group by creator** section above YouTube's original playlist.

- Expand a creator to see their videos.
- Search for a creator or video title.
- Sort groups by number of videos, creator name, or recently indexed videos.
- Choose **Index more** to scroll through the playlist and discover additional videos.
- Use **Hide groups** when you want the regular YouTube view.

YouTube loads playlist entries gradually. YTWash groups the videos it has detected, so the number shown may be smaller than your full Watch Later collection until more entries load. Your original playlist remains underneath the grouping view.

### Play one creator's videos in a row

Expand a creator and select **Play this creator**. YTWash opens the first indexed video and advances to the next when playback ends.

Use **Stop creator playback** on the video page to end the queue. The queue is temporary and applies to the current browsing session.

### Save your place in a video

On a YouTube video, select **YTWash · Save at current time**. Your playback position is saved in the extension's local browser storage.

If YouTube's Save menu opens, choose **Watch Later** yourself. Saving a timestamp **does not automatically add a video to Watch Later**.

The next time you open that video in the same browser profile, YTWash attempts to resume from your saved position. A start time explicitly included in the video URL takes priority.

### Automatically remove completed videos (optional)

On a video page, YTWash offers **Auto-remove from Watch Later after finishing (experimental)**.

**This feature is off by default.** Enable it only if you want YTWash to attempt to remove a video after it ends naturally and at least five seconds of actual playback have been detected.

YTWash uses YouTube's own controls and attempts removal **only when it can confirm that the video belongs to Watch Later**. If it cannot confirm membership, it leaves the playlist unchanged. Removal is not guaranteed; check Watch Later to verify the result.

**For your first test, keep automatic removal disabled**, especially if your Watch Later playlist contains videos you want to preserve.

## What to expect from this alpha

- YTWash works inside YouTube; it does not create or manage a separate playlist.
- Creator grouping depends on videos YouTube has loaded into the page. Very large playlists may require **Index more**.
- Saved timestamps are local to the browser profile; they do not sync across devices.
- Playback, resume, and playlist controls depend on YouTube's current interface and may stop working if YouTube changes it.
- Automated Chromium and Firefox tests use simulated YouTube pages. Real, signed-in YouTube behavior still needs validation.
- YTWash is not affiliated with or endorsed by YouTube or Google.

## Privacy

YTWash runs in your browser. It accesses YouTube pages to provide its features, stores saved playback positions and your automatic-removal preference locally, and uses YouTube's visible playlist controls. The extension does **not** require a YTWash account or run its own backend service.

## Help and feedback

Found a bug or a YouTube page that doesn't work as expected? [Report an issue](https://github.com/akaizn-junior/ytwash/issues). Include your browser, YTWash version, what you tried, and what happened. Please avoid sharing private account information.

YTWash is [open source under the MIT License](LICENSE).
