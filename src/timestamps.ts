/** Persist explicit resume points locally; never write to YouTube's private APIs. */
const KEY_PREFIX = 'ytwash:resume:';
const BUTTON_ID = 'ytwash-save-position';
const STATUS_ID = 'ytwash-resume-status';
type Position = { seconds: number; savedAt: number };
let currentId = '';
let activeVideo: HTMLVideoElement | null = null;
let resumeApplied = false;
let lastUrl = '';
let retryTimer: number | undefined;

function getId(): string | null {
  if (location.pathname !== '/watch') return null;
  return new URLSearchParams(location.search).get('v');
}
function formatTime(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
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
function status(message: string): void {
  const el = document.getElementById(STATUS_ID);
  if (el) el.textContent = message;
}
function hasExplicitTime(): boolean {
  const params = new URLSearchParams(location.search);
  return params.has('t') || params.has('start') || params.has('time_continue');
}
function openNativeSaveMenu(): boolean {
  // Only activate YouTube's own save control. User must confirm Watch Later in YouTube.
  const area = document.querySelector('ytd-watch-metadata');
  const nodes = area?.querySelectorAll<HTMLElement>('button, yt-button-view-model, ytd-button-renderer') ?? [];
  for (const node of nodes) {
    const label = (node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').trim();
    if (!/^(save|guardar|salvar)(\b|$)/i.test(label)) continue;
    const button = node.matches('button') ? node : node.querySelector<HTMLElement>('button');
    if (button) { button.click(); return true; }
  }
  return false;
}
async function saveCurrent(): Promise<void> {
  const id = getId(), video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!id || !video || !Number.isFinite(video.currentTime)) { status('Video not ready.'); return; }
  const seconds = Math.floor(video.currentTime);
  const saved = await store(id, seconds);
  if (!saved) { status('Could not save position.'); return; }
  const opened = openNativeSaveMenu();
  status(opened
    ? 'Saved ' + formatTime(seconds) + ' locally. Choose Watch Later in YouTube’s Save menu.'
    : 'Saved ' + formatTime(seconds) + ' locally. Use YouTube’s Save button to add to Watch Later.');
}
async function applyResume(id: string, video: HTMLVideoElement): Promise<void> {
  const saved = await load(id);
  if (getId() !== id || activeVideo !== video || resumeApplied || !saved) return;
  if (hasExplicitTime()) { status('URL start time takes priority over saved position.'); return; }
  const seek = (): void => {
    if (getId() !== id || activeVideo !== video || resumeApplied || video.readyState < 1) return;
    if (Number.isFinite(video.duration) && saved.seconds >= video.duration - 5) {
      status('Saved position is near the end; not resuming automatically.');
      resumeApplied = true; return;
    }
    if (saved.seconds < 1) { resumeApplied = true; return; }
    video.currentTime = saved.seconds;
    resumeApplied = true;
    status('Resumed at ' + formatTime(saved.seconds) + '.');
  };
  if (video.readyState >= 1) seek();
  else video.addEventListener('loadedmetadata', seek, { once: true });
}
async function mount(): Promise<void> {
  const id = getId();
  if (!id) {
    currentId = '';
    activeVideo = null;
    document.getElementById(BUTTON_ID)?.parentElement?.remove();
    return;
  }
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!video) return;
  const changed = currentId !== id || activeVideo !== video;
  if (changed) {
    currentId = id; activeVideo = video; resumeApplied = false;
    document.getElementById(BUTTON_ID)?.parentElement?.remove();
  }
  const container = document.querySelector<HTMLElement>('ytd-watch-metadata #actions, ytd-watch-metadata #top-row');
  if (container && !document.getElementById(BUTTON_ID)) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin:8px;color:var(--yt-spec-text-primary,#eee);font:12px Arial,sans-serif;max-width:360px;';
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'YTWash · Save at current time';
    button.setAttribute('aria-label', 'Save current video timestamp for Watch Later');
    button.style.cssText = 'background:var(--yt-spec-badge-chip-background,#333);border:0;border-radius:18px;color:inherit;padding:10px 14px;cursor:pointer;font:600 13px Arial,sans-serif;';
    button.addEventListener('click', () => void saveCurrent());
    const message = document.createElement('span'); message.id = STATUS_ID;
    message.setAttribute('role', 'status');
    wrapper.append(button, message);
    container.append(wrapper);
  }
  if (changed) void applyResume(id, video);
}
function tick(): void {
  const key = location.pathname + location.search;
  if (key !== lastUrl) { lastUrl = key; currentId = ''; activeVideo = null; resumeApplied = false; }
  void mount();
}
window.addEventListener('yt-navigate-finish', tick);
window.addEventListener('popstate', tick);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
retryTimer = window.setInterval(tick, 1500);
tick();
