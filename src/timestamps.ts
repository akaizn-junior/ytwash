import { preferences, preferencesReady } from './preferences';
import { watchId, saveControls, waitForWatchLater, checked, closeSaveChooser } from './native-save';
/** Persist explicit resume points locally; never write to YouTube's private APIs. */
const KEY_PREFIX = 'ytwash:resume:';
const ICON_CLASS = 'ytwash-save-lightning';
let saving = false;
type Position = { seconds: number; savedAt: number };
let currentId = '';
let activeVideo: HTMLVideoElement | null = null;
let resumeApplied = false;
let lastUrl = '';

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
    if (!preferences.enhancedSave || watchId() !== id) return;
    // Let the trusted native Save click open its playlist chooser normally.
    const checkbox = await waitForWatchLater(id);
    if (!checkbox || watchId() !== id || !preferences.enhancedSave) return;
    const membership = checked(checkbox);
    if (membership === null) return;
    if (!membership) {
      checkbox.click();
      // Require confirmation from the native control before storing a timestamp.
      for (let attempt = 0; attempt < 20 && watchId() === id; attempt++) {
        if (checked(checkbox) === true) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    if (watchId() !== id || checked(checkbox) !== true) return;
    if (await store(id, seconds) && watchId() === id) closeSaveChooser();
  } finally { saving = false; }
}
function decorateSave(): void {
  const controls = new Set(preferences.enhancedSave && getId() ? saveControls() : []);
  document.querySelectorAll<HTMLElement>('.' + ICON_CLASS).forEach(icon => {
    if (!icon.parentElement || !controls.has(icon.parentElement)) icon.remove();
  });
  for (const control of controls) {
    if (control.querySelector('.' + ICON_CLASS)) continue;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.classList.add(ICON_CLASS);
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = 'width:16px;height:16px;min-width:16px;margin-left:12px;vertical-align:middle;fill:currentColor;pointer-events:none';
    const title = document.createElementNS(icon.namespaceURI, 'title');
    title.textContent = 'YTWash: save to Watch Later at the current time';
    const path = document.createElementNS(icon.namespaceURI, 'path');
    path.setAttribute('d', 'M13 2 4 14h7l-1 8 10-13h-7l1-7z');
    icon.append(title, path);
    control.append(icon);
  }
}
document.addEventListener('click', event => {
  if (!event.isTrusted || event.defaultPrevented || !preferences.enhancedSave || saving ||
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
  if (!preferences.resume) return;
  const saved = await load(id);
  if (getId() !== id || activeVideo !== video || resumeApplied || !saved) return;
  if (hasExplicitTime()) return;
  const seek = (): void => {
    if (!preferences.resume || getId() !== id || activeVideo !== video || resumeApplied || video.readyState < 1) return;
    if (Number.isFinite(video.duration) && saved.seconds >= video.duration - 5) {
      resumeApplied = true; return;
    }
    if (saved.seconds < 1) { resumeApplied = true; return; }
    video.currentTime = saved.seconds;
    resumeApplied = true;
  };
  if (video.readyState >= 1) seek();
  else video.addEventListener('loadedmetadata', seek, { once: true });
}
async function mount(): Promise<void> {
  const id = getId();
  if (!id) {
    currentId = '';
    activeVideo = null;
    return;
  }
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!video) return;
  const changed = currentId !== id || activeVideo !== video;
  if (changed) {
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
