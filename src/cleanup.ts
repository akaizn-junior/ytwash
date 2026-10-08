import { preferences, preferencesReady } from './preferences';
import { openSaveChooser, checked, closeSaveChooser } from './native-save';
/** Opt-in cleanup through native controls; unknown membership is left unchanged. */
let tracked: HTMLVideoElement | null = null;
let trackedId = '';
let listenedSeconds = 0;
let lastSample = -1;
let completed = false;

function cleanupId(): string | null {
  return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
}
async function removeViaNativeMenu(videoId: string): Promise<void> {
  if (cleanupId() !== videoId || !preferences.autoRemove) return;
  const checkbox = await openSaveChooser(videoId);
  if (cleanupId() !== videoId || !preferences.autoRemove || !checkbox) return;
  if (checked(checkbox) === true) checkbox.click();
  closeSaveChooser();
}
function onTimeUpdate(): void {
  if (!tracked || tracked.paused || tracked.seeking) return;
  const now = tracked.currentTime;
  if (lastSample >= 0 && now >= lastSample) {
    // Ignore large seeking leaps and progress while the tab is not visibly playing.
    const delta = now - lastSample;
    if (delta <= 2.5 && !document.hidden) listenedSeconds += delta;
  }
  lastSample = now;
}
function onSeek(): void { lastSample = -1; }
function onEnded(): void {
  if (!tracked || !preferences.autoRemove || completed) return;
  // Natural ended event plus some actual playback is required.
  if (listenedSeconds < 5) return;
  completed = true;
  void removeViaNativeMenu(trackedId);
}
function detach(): void {
  tracked?.removeEventListener('timeupdate',onTimeUpdate);
  tracked?.removeEventListener('seeking',onSeek);
  tracked?.removeEventListener('ended',onEnded);
}
function trackPlayback(): void {
  const id = cleanupId();
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!id || !video) {detach();tracked=null;trackedId='';return;}
  if (tracked !== video || trackedId !== id) {
    detach();tracked=video;trackedId=id;listenedSeconds=0;lastSample=-1;completed=false;
    video.addEventListener('timeupdate',onTimeUpdate);
    video.addEventListener('seeking',onSeek);
    video.addEventListener('ended',onEnded);
  }
}
void preferencesReady.then(trackPlayback);
window.addEventListener('yt-navigate-finish', trackPlayback);
window.setInterval(trackPlayback, 1600);
