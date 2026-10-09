/** Finished videos no longer need a reminder. */
export {};
let video: HTMLVideoElement | null = null;
let current = '';
let seconds = 0;
let previous = -1;
let listeners: AbortController | null = null;
function mount(): void {
  const id = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
  const active = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!id || !/^[\w-]{11}$/.test(id)) {
    listeners?.abort(); current = ''; video = null; return;
  }
  if (current === id && video === active) return;
  listeners?.abort(); listeners = new AbortController(); current = id; video = active; seconds = 0; previous = -1;
  if (!active) return;
  const options = { signal: listeners.signal };
  active.addEventListener('timeupdate', () => {
    if (active.paused || active.seeking) return;
    const delta = active.currentTime - previous;
    if (previous >= 0 && delta >= 0 && delta <= 2.5) seconds += delta;
    previous = active.currentTime;
  }, options);
  active.addEventListener('seeking', () => { previous = -1; }, options);
}
// Run before native/player capture listeners can stop the ended event.
document.addEventListener('ended', event => {
  if (event.target !== video || seconds < 5 || location.pathname !== '/watch' ||
      new URLSearchParams(location.search).get('v') !== current) return;
  chrome.storage.local.set({ ['ytwash:watched:' + current]: true });
  chrome.storage.local.remove('ytwash:reminder:' + current);
}, true);
window.addEventListener('yt-navigate-finish', mount);
window.setInterval(mount, 1500);
mount();
