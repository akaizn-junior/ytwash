import { readPlaylist, indexPlaylist } from './playlists';
import { preferences, preferencesReady } from './preferences';
import { watchId, saveControls, waitForWatchLater, checked, closeSaveChooser } from './native-save';
/** Persist explicit resume points locally; never write to YouTube's private APIs. */
const KEY_PREFIX = 'ytwash:resume:';
const ICON_CLASS = 'ytwash-save-lightning';
const saveLayouts = new Map<HTMLElement, {
  position: string; positionPriority: string; padding: string; paddingPriority: string; reservedPadding: string;
}>();
let saving = false;
type Position = { seconds: number; savedAt: number };
let currentId = '';
let activeVideo: HTMLVideoElement | null = null;
let resumeApplied = false;
let lastUrl = '';
let resumeListeners: AbortController | null = null;

function getId(): string | null {
  if (location.pathname !== '/watch') return null;
  return new URLSearchParams(location.search).get('v');
}
function load(id: string): Promise<Position | null> {
  return new Promise(resolve => {
    chrome.storage.local.get(KEY_PREFIX + id, data => {
      if (chrome.runtime.lastError) { console.warn('YTWash storage read failed', chrome.runtime.lastError.message); resolve(null); return; }
      const value = data[KEY_PREFIX + id] as Position | undefined;
      resolve(value && Number.isFinite(value.seconds) && value.seconds >= 0 ? value : null);
    });
  });
}
function store(id: string, seconds: number): Promise<boolean> {
  return new Promise(resolve => {
    chrome.storage.local.set({ [KEY_PREFIX + id]: { seconds, savedAt: Date.now() } satisfies Position }, () => {
      const error = chrome.runtime.lastError;
      if (error) console.warn('YTWash storage write failed', error.message);
      resolve(!error);
    });
  });
}
function hasExplicitTime(): boolean {
  const params = new URLSearchParams(location.search);
  return params.has('t') || params.has('start') || params.has('time_continue');
}
async function saveCurrent(id: string, seconds: number): Promise<void> {
  if (saving) return;
  saving = true;
  try {
    await preferencesReady;
    if (watchId() !== id) return;
    // Persist the user's explicit Save action even when YouTube's chooser
    // changes markup or cannot expose a confirmed Watch Later state.
    if (!await store(id, seconds)) return;
    if (watchId() !== id) return;
    // Let the trusted native Save click open its playlist chooser normally.
    const checkbox = await waitForWatchLater(id);
    if (!checkbox || watchId() !== id) return;
    const membership = checked(checkbox);
    if (membership === null) return;
    if (!membership) {
      checkbox.click();
      // Confirm the native control changed before dismissing its chooser.
      for (let attempt = 0; attempt < 20 && watchId() === id; attempt++) {
        if (checked(checkbox) === true) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    if (watchId() !== id || checked(checkbox) !== true) return;
    // Confirmed additions immediately update the stored Watch Later order.
    const channel = document.querySelector<HTMLAnchorElement>('ytd-watch-metadata ytd-channel-name a[href], #owner #channel-name a[href]');
    const creator = channel?.textContent?.trim();
    if (creator) {
      const cached = await readPlaylist('WL');
      if (!cached?.entries.some(entry => entry.id === id)) {
        const path = channel!.getAttribute('href')?.split('?')[0] || '';
        const key = cached?.entries.find(entry => entry.creator === creator)?.key ||
          (path.startsWith('/channel/') ? path : path.startsWith('/@') ? path.toLowerCase() : 'name:' + creator.toLowerCase());
        indexPlaylist('WL', [{ id, creator, key }, ...(cached?.entries || [])]);
      }
    }
    closeSaveChooser();
  } finally { saving = false; }
}
function decorateSave(): void {
  const controls = new Set(getId() ? saveControls().map(control =>
    control.querySelector<HTMLElement>('tp-yt-paper-item, [role="menuitem"], .yt-list-item-view-model__container, button') || control
  ) : []);
  for (const [control, original] of saveLayouts) {
    if (controls.has(control)) continue;
    control.querySelectorAll('.' + ICON_CLASS).forEach(icon => icon.remove());
    if (control.style.position === 'relative') control.style.setProperty('position', original.position, original.positionPriority);
    if (control.style.paddingRight === original.reservedPadding) control.style.setProperty('padding-right', original.padding, original.paddingPriority);
    saveLayouts.delete(control);
  }
  document.querySelectorAll<HTMLElement>('.' + ICON_CLASS).forEach(icon => {
    if (!icon.parentElement || !controls.has(icon.parentElement)) icon.remove();
  });
  for (const control of controls) {
    if (control.querySelector('.' + ICON_CLASS)) continue;
    const computed = getComputedStyle(control);
    const inset = parseFloat(computed.paddingRight) || 0;
    const reservedPadding = inset + 28 + 'px';
    saveLayouts.set(control, {
      position: control.style.position, positionPriority: control.style.getPropertyPriority('position'),
      padding: control.style.paddingRight, paddingPriority: control.style.getPropertyPriority('padding-right'), reservedPadding,
    });
    if (computed.position === 'static') control.style.setProperty('position', 'relative', 'important');
    control.style.setProperty('padding-right', reservedPadding, 'important');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.classList.add(ICON_CLASS);
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    // Out of flow: never becomes another grid cell or wraps in a flex row.
    icon.style.cssText = `position:absolute!important;right:${inset}px!important;top:50%!important;transform:translateY(-50%)!important;width:16px!important;height:16px!important;fill:#ff0033!important;pointer-events:none`;
    const title = document.createElementNS(icon.namespaceURI, 'title');
    title.textContent = 'YTWash: save to Watch Later at the current time';
    const path = document.createElementNS(icon.namespaceURI, 'path');
    path.setAttribute('d', 'M13 2 4 14h7l-1 8 10-13h-7l1-7z');
    icon.append(title, path);
    control.append(icon);
  }
}
document.addEventListener('click', event => {
  if (!event.isTrusted || event.defaultPrevented || saving ||
      !(event.target instanceof Element)) return;
  const control = saveControls().find(node => node.contains(event.target as Node));
  const id = getId();
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (control && id && video && Number.isFinite(video.currentTime)) void saveCurrent(id, Math.floor(video.currentTime));
}, true);
let decorationScheduled = false;
new MutationObserver(() => {
  if (decorationScheduled) return;
  decorationScheduled = true;
  window.setTimeout(() => { decorationScheduled = false; decorateSave(); }, 100);
}).observe(document.documentElement, { childList: true, subtree: true });
void preferencesReady.then(decorateSave);
async function applyResume(id: string, video: HTMLVideoElement): Promise<void> {
  await preferencesReady;
  const saved = await load(id);
  if (getId() !== id || activeVideo !== video || resumeApplied || !saved) return;
  if (hasExplicitTime()) return;
  const seek = (): void => {
    if (getId() !== id || activeVideo !== video || resumeApplied || video.readyState < 1) return;
    if (Number.isFinite(video.duration) && saved.seconds >= video.duration - 5) {
      resumeApplied = true; return;
    }
    if (saved.seconds < 1) { resumeApplied = true; return; }
    video.currentTime = saved.seconds;
    resumeApplied = true;
  };
  // YouTube reuses its video element during client-side navigation. Metadata
  // for the previous video can still be present when navigation finishes.
  const controller = resumeListeners;
  video.addEventListener('loadedmetadata', () => {
    if (getId() !== id || activeVideo !== video || hasExplicitTime()) return;
    resumeApplied = false;
    seek();
  }, { signal: controller?.signal });
  if (video.readyState >= 1) seek();
}
async function mount(): Promise<void> {
  const id = getId();
  if (!id) {
    resumeListeners?.abort();
    currentId = '';
    activeVideo = null;
    return;
  }
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!video) return;
  const changed = currentId !== id || activeVideo !== video;
  if (changed) {
    resumeListeners?.abort();
    resumeListeners = new AbortController();
    currentId = id; activeVideo = video; resumeApplied = false;
  }
  if (changed) void applyResume(id, video);
}
function tick(): void {
  const key = location.pathname + location.search;
  if (key !== lastUrl) { lastUrl = key; currentId = ''; activeVideo = null; resumeApplied = false; }
  decorateSave();
  void mount();
}
window.addEventListener('yt-navigate-finish', tick);
window.addEventListener('popstate', tick);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
window.setInterval(tick, 1500);
tick();
