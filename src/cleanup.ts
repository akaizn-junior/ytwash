import { preferences, preferencesReady } from './preferences';
import { readPlaylist, indexPlaylist, playlistId } from './playlists';
import { openSaveChooser, checked, closeSaveChooser } from './native-save';
/** Opt-in cleanup through native controls; unknown membership is left unchanged. */
let tracked: HTMLVideoElement | null = null;
let trackedId = '';
let listenedSeconds = 0;
let lastSample = -1;
let completed = false;
let removal: Promise<void> | null = null;

function cleanupId(): string | null {
  return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
}
async function removeViaNativeMenu(videoId: string): Promise<void> {
  if (cleanupId() !== videoId || !preferences.autoRemove) return;
  const list = playlistId() || 'WL';
  const checkbox = await openSaveChooser(videoId, list);
  if (cleanupId() !== videoId || (playlistId() || 'WL') !== list || !preferences.autoRemove || !checkbox) return;
  if (checked(checkbox) !== true) { closeSaveChooser(list); return; }
  checkbox.click();
  // Wait for the native control to confirm removal before clearing local data.
  for (let attempt = 0; attempt < 20; attempt++) {
    if (cleanupId() !== videoId || (playlistId() || 'WL') !== list || !preferences.autoRemove) return;
    if (checked(checkbox) === false) {
      const cached = await readPlaylist(list);
      if (cached) indexPlaylist(list, cached.entries.filter(entry => entry.id !== videoId));
      chrome.storage.local.remove('ytwash:resume:' + videoId);
      closeSaveChooser(list);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  closeSaveChooser(list);
}
export function clearCompletedVideo(): Promise<void> {
  if (removal) return removal;
  if (!tracked || cleanupId() !== trackedId || !preferences.autoRemove || completed || listenedSeconds < 5) return Promise.resolve();
  completed = true;
  const id = trackedId;
  const task = removeViaNativeMenu(id).catch(() => {
    console.warn('YTWash could not confirm removal from the playlist.');
  });
  removal = task;
  void task.finally(() => { if (removal === task) removal = null; });
  return task;
}

function onTimeUpdate(): void {
  if (!tracked || tracked.paused || tracked.seeking) return;
  const now = tracked.currentTime;
  if (lastSample >= 0 && now >= lastSample) {
    // Count actual playback in foreground and background tabs; ignore seeking leaps.
    const delta = now - lastSample;
    if (delta <= 2.5) listenedSeconds += delta;
  }
  lastSample = now;
}
function onSeek(): void { lastSample = -1; }
function onEnded(event: Event): void {
  if (!tracked || !preferences.autoRemove || completed || listenedSeconds < 5) return;
  // Hold native autoplay until its own playlist control confirms cleanup.
  event.stopImmediatePropagation();
  const video = tracked, id = trackedId;
  void clearCompletedVideo().then(() => {
    if (cleanupId() === id && video.isConnected) video.dispatchEvent(new Event('ended'));
  });
}
function detach(): void {
  tracked?.removeEventListener('timeupdate',onTimeUpdate);
  tracked?.removeEventListener('seeking',onSeek);
  tracked?.removeEventListener('ended',onEnded,true);

}
function trackPlayback(): void {
  const id = cleanupId();
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!id || !video) {detach();tracked=null;trackedId='';return;}
  if (tracked !== video || trackedId !== id) {
    detach();tracked=video;trackedId=id;listenedSeconds=0;lastSample=-1;completed=false;
    video.addEventListener('timeupdate',onTimeUpdate);
    video.addEventListener('seeking',onSeek);
    video.addEventListener('ended',onEnded,true);

  }
}
void preferencesReady.then(trackPlayback);
window.addEventListener('yt-navigate-finish', trackPlayback);
window.setInterval(trackPlayback, 1600);
