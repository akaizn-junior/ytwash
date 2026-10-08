# YTWash

**watch it. clear it.**

YTWash helps you finish your YouTube playlists: group videos by creator, save your place, and optionally clear finished videos from Watch Later.

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

Click the YTWash toolbar icon to open Options, then enable **Group playlists by creator**. This works with Watch Later and other playlists, including the watch-page sidebar. Creators with multiple videos appear together; single-video creators appear under **Everything else**.

**Play all**, **Next**, **Previous**, and automatic advancement follow the creator order. Clicking a video starts from that point in the grouped order. Newly loaded videos update the order. Turn grouping off to restore YouTube’s native ordering.

Only videos YouTube has loaded or YTWash has previously indexed can be grouped. Private playlists require your existing YouTube sign-in.

## Clear

Enable **Remove completed videos from Watch Later** in Options. It is off by default.

When a video finishes, after at least five seconds of actual playback, YTWash automatically removes it from Watch Later and clears its saved position. There is no confirmation prompt. Removal happens through YouTube’s native controls; if membership cannot be established, YTWash leaves it unchanged.

Cleanup applies to Watch Later only. It does not remove videos from other playlists or close your tab. Skipping to another video does not trigger cleanup.

## Your settings and privacy

Options contains two preferences: **Group playlists by creator** and **Remove completed videos from Watch Later**. Changes apply to open YouTube tabs.

Settings, saved positions, and playlist order stay in your browser profile. They do not sync across devices. YTWash needs no separate account or backend service and uses your existing YouTube sign-in.

## Help

YTWash is an experimental alpha distributed directly through GitHub. Automated Chromium and Firefox tests use simulated YouTube pages; signed-in YouTube behavior still needs verification, and interface changes can affect features.

If something stops working, reload the extension and refresh YouTube. [Report a problem](https://github.com/akaizn-junior/ytwash/issues) with your browser, release version, and what happened. Do not include private account details.

[Project site](https://akaizn-junior.github.io/ytwash/) · [MIT license](LICENSE)

YTWash is not affiliated with or endorsed by YouTube or Google.
