/** Account-free saves are local and do not require native playlist membership. */
export function saveForLater(id: string): void {
  if (!/^[\w-]{11}$/.test(id)) return;
  const title = document.querySelector('ytd-watch-metadata h1, #title h1')?.textContent?.trim() || document.title.replace(/ - YouTube$/, '') || 'A saved video';
  chrome.storage.local.set({ ['ytwash:later:' + id]: { title: title.slice(0, 200), savedAt: Date.now() }, ['ytwash:watched:' + id]: false });
}
let video: HTMLVideoElement | null = null;
let current = '';
let seconds = 0;
let previous = -1;
let listeners: AbortController | null = null;
function mount(): void {
  const id = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
  const active = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  const button = document.getElementById('ytwash-save-for-later');
  if (!id || !/^[\w-]{11}$/.test(id)) {
    button?.remove(); listeners?.abort(); current = ''; video = null; return;
  }
  const parent = document.querySelector('ytd-watch-metadata #actions, ytd-watch-metadata, #above-the-fold');
  if (parent && !button) {
    const save = document.createElement('button');
    save.id = 'ytwash-save-for-later'; save.textContent = 'Save for later · YTWash';
    save.style.cssText = 'padding:8px 16px;margin:8px;border-radius:18px;cursor:pointer';
    save.addEventListener('click', () => {
      const selected = new URLSearchParams(location.search).get('v');
      if (selected) { saveForLater(selected); save.textContent = 'Saved · reminders in Options'; }
    });
    parent.append(save);
  }
  if (current === id && video === active) return;
  if (button) button.textContent = 'Save for later · YTWash';
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
  active.addEventListener('ended', () => {
    if (seconds < 5 || new URLSearchParams(location.search).get('v') !== id) return;
    chrome.storage.local.set({ ['ytwash:watched:' + id]: true });
    chrome.storage.local.remove('ytwash:later:' + id);
  }, { ...options, capture: true });
}
window.addEventListener('yt-navigate-finish', mount);
window.setInterval(mount, 1500);
mount();
