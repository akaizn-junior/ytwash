<p align="center">
  <img src="public/icons/icon-128.png" width="128" height="128" alt="YTWash: red lightning inside a white button with a red border">
</p>

<h1 align="center">YTWash</h1>
<p align="center"><strong>watch it. clear it.</strong></p>
<p align="center">Save your place. Watch playlists by creator. Clear finished videos automatically.</p>
<p align="center">
  <a href="https://github.com/akaizn-junior/ytwash/releases">Download the alpha</a> ·
  <a href="https://akaizn-junior.github.io/ytwash/">Website</a> ·
  <a href="https://github.com/akaizn-junior/ytwash/issues">Get help</a>
</p>

YTWash works inside YouTube with your existing sign-in. Creator grouping and cleanup work across your playlists, including the watch-page sidebar. You choose grouping and cleanup in Options; timestamp saving and resume are built in.

| Save | Watch | Clear |
| --- | --- | --- |
| Choose **Save ⚡** to add a video to Watch Later and remember the current time. | Group by creator; **Play all**, **Next**, and **Previous** follow that order. | Enable cleanup to remove finished videos from the playlist you are watching. |

## Install

Download from [GitHub Releases](https://github.com/akaizn-junior/ytwash/releases). Under **Assets**, choose the extension ZIP for your browser:

| Browser | File |
| --- | --- |
| Chrome / Edge | `ytwash-vVERSION.zip` |
| Firefox | `ytwash-vVERSION-firefox.zip` |

The `publishing-assets` ZIP contains graphics, not the extension. “Source code” archives are not installable extension bundles.

**Chrome / Edge:** Extract the ZIP into a folder you will keep. Open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`. Refresh your YouTube tabs.

**Firefox:** Extract the Firefox ZIP. Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `manifest.json`. This unsigned alpha is for temporary testing; Firefox removes it when the browser closes.

**Update:** Extract the new browser ZIP over your existing extension folder, reload YTWash in your browser’s extension manager, and refresh YouTube. Keep the same installation to retain local settings and saved positions. For Firefox, reload or re-add the temporary add-on.

## Watch

### Save your place

On a video page, open YouTube’s menu and choose **Save**, marked with a red lightning bolt. YTWash adds the video to Watch Later and remembers the time when you clicked. Saving it again updates your position.

Open the video again in the same browser profile to resume. A timestamp already in the video link takes priority. If YouTube’s Watch Later control cannot be found, the saved position is still kept and the native chooser remains available for you to add the video.

Saving and resuming are built in; they have no switches in Options.

### Group and play

Click the YTWash toolbar icon to open Options, then enable **Group playlists by creator**. This works across your YouTube playlists, including the watch-page sidebar. Creators with multiple videos appear together; single-video creators appear under **Everything else**.

**Play all**, **Next**, **Previous**, and automatic advancement follow the creator order. Clicking a video starts from that point in the grouped order. Newly loaded videos update the order. Turn grouping off to restore YouTube’s native ordering.

Only videos YouTube has loaded or YTWash has previously indexed can be grouped. Private playlists require your existing YouTube sign-in.

## Clear

Enable **Remove completed videos from playlists** in Options.

When a video finishes, after at least five seconds of actual playback, YTWash automatically removes it from the playlist you are watching and clears its saved position. YTWash handles the native playlist dialog automatically, including its Done button when present. You do not need to confirm removal. Cleanup requires a playlist you can edit; if YouTube’s controls cannot establish membership, YTWash leaves the video unchanged.

Cleanup applies to the playlist in the current video link. Outside a playlist, it applies to Watch Later. It does not close your tab. Skipping to another video does not trigger cleanup.

## Options

Open Options by clicking the YTWash toolbar icon, or through your browser’s extension manager.

| Preference | What it does |
| --- | --- |
| **Group playlists by creator** | Groups playlist and sidebar videos, and uses that order for playback. |
| **Remove completed videos from playlists** | Removes finished videos from the current playlist and clears their saved positions. |

Save, resume, and creator-order playback are built-in features, not separate switches.

## Your settings and privacy

Preference changes apply to open YouTube tabs.

Settings, saved positions, and playlist order stay in your browser profile. They do not sync across devices. YTWash needs no separate account or backend service and uses your existing YouTube sign-in.

## Help

**Not resuming?** Use the same browser profile where you saved, refresh YouTube after updating, and check whether the link already contains a timestamp.

**Missing videos in a group?** Load more videos in YouTube. YTWash updates the groups and playback order as new rows become available.

**A finished video stays in the playlist?** Check that cleanup is enabled and that you can edit the playlist. If the native dialog remains open or requires a manual click, include that detail in your bug report.


YTWash is an experimental alpha distributed directly through GitHub. Automated Chromium and Firefox tests use simulated YouTube pages; signed-in YouTube behavior still needs verification, and interface changes can affect features.

If something stops working, reload the extension and refresh YouTube. [Report a problem](https://github.com/akaizn-junior/ytwash/issues) with your browser, release version, and what happened. Do not include private account details.

[Project site](https://akaizn-junior.github.io/ytwash/) · [MIT license](LICENSE)

YTWash is not affiliated with or endorsed by YouTube or Google.
