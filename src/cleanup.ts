/** Remove completed videos using the YouTube UI, never private APIs.
 * Opt-in required. Fail closed whenever Watch Later membership is uncertain.
 */
const CLEANUP_PREF = 'ytwash:auto-remove-completed';
const CLEANUP_CONTROL = 'ytwash-auto-remove-toggle';
const CLEANUP_MESSAGE = 'ytwash-auto-remove-message';
let tracked: HTMLVideoElement | null = null;
let trackedId = '';
let listenedSeconds = 0;
let lastSample = -1;
let completed = false;
let optIn = false;

function cleanupId(): string | null {
  return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
}
function notifyCleanup(message: string): void {
  const node = document.getElementById(CLEANUP_MESSAGE);
  if (node) node.textContent = message;
}
function cleanupPrefs(): Promise<boolean> {
  return new Promise(resolve => chrome.storage.local.get(CLEANUP_PREF, value => {
    resolve(!chrome.runtime.lastError && value[CLEANUP_PREF] === true);
  }));
}
function setCleanupPref(value: boolean): Promise<boolean> {
  return new Promise(resolve => chrome.storage.local.set({ [CLEANUP_PREF]: value }, () => {
    resolve(!chrome.runtime.lastError);
  }));
}
function visibleSaveButton(): HTMLButtonElement | null {
  const area = document.querySelector('ytd-watch-metadata');
  for (const button of area?.querySelectorAll<HTMLButtonElement>('button') || []) {
    const name = [button.getAttribute('aria-label'),button.title,button.textContent].filter(Boolean).join(' ').trim();
    if (/^(save|guardar|salvar)\b/i.test(name)) return button;
  }
  return null;
}
function watchLaterRow(): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>('ytd-add-to-playlist-renderer, ytd-playlist-add-to-option-renderer, tp-yt-paper-item');
  for (const node of nodes) {
    if (!node.getClientRects().length) continue;
    const name = (node.querySelector('#label, #title, .title')?.textContent || node.textContent || '').trim();
    if (/^(watch later|ver mais tarde|assistir mais tarde)(\s|$)/i.test(name)) return node;
  }
  return null;
}
function isChecked(row: HTMLElement): boolean {
  const checkbox = row.querySelector<HTMLElement>('[role="checkbox"], tp-yt-paper-checkbox, input[type="checkbox"]');
  return checkbox?.getAttribute('aria-checked') === 'true' ||
    checkbox?.getAttribute('checked') !== null && checkbox?.hasAttribute('checked') === true ||
    checkbox instanceof HTMLInputElement && checkbox.checked;
}
async function removeViaNativeMenu(videoId: string): Promise<void> {
  if (cleanupId() !== videoId || !optIn) return;
  const button = visibleSaveButton();
  if (!button) { notifyCleanup('Completed. Could not find YouTube’s Save control; Watch Later unchanged.'); return; }
  button.click();
  // Give YouTube time to render its native playlist chooser.
  await new Promise(resolve => setTimeout(resolve, 400));
  if (cleanupId() !== videoId) return;
  const row = watchLaterRow();
  if (!row || !isChecked(row)) {
    notifyCleanup('Completed. Watch Later membership could not be confirmed; nothing removed.');
    return;
  }
  const target = row.querySelector<HTMLElement>('[role="checkbox"], tp-yt-paper-checkbox, input[type="checkbox"]') || row;
  target.click();
  notifyCleanup('Removal requested in YouTube. Check Watch Later to confirm it was removed.');
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
  if (!tracked || !optIn || completed) return;
  // Natural ended event plus some actual playback is required.
  if (listenedSeconds < 5) { notifyCleanup('Video ended, but playback was too short to auto-remove.'); return; }
  completed = true;
  void removeViaNativeMenu(trackedId);
}
function detach(): void {
  tracked?.removeEventListener('timeupdate',onTimeUpdate);
  tracked?.removeEventListener('seeking',onSeek);
  tracked?.removeEventListener('ended',onEnded);
}
async function renderCleanupControl(): Promise<void> {
  const id = cleanupId();
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!id || !video) {detach();tracked=null;trackedId='';document.getElementById(CLEANUP_CONTROL)?.parentElement?.remove();return;}
  if (tracked !== video || trackedId !== id) {
    detach();tracked=video;trackedId=id;listenedSeconds=0;lastSample=-1;completed=false;
    video.addEventListener('timeupdate',onTimeUpdate);
    video.addEventListener('seeking',onSeek);
    video.addEventListener('ended',onEnded);
  }
  if (document.getElementById(CLEANUP_CONTROL)) return;
  const host = document.querySelector<HTMLElement>('ytd-watch-metadata #actions, ytd-watch-metadata #top-row');
  if (!host) return;
  const wrapper=document.createElement('div');
  wrapper.style.cssText='display:flex;flex-direction:column;gap:4px;margin:8px;color:var(--yt-spec-text-primary,#eee);font:12px Arial,sans-serif;max-width:340px';
  const label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:8px;cursor:pointer';
  const input=document.createElement('input');input.type='checkbox';input.id=CLEANUP_CONTROL;input.checked=optIn;
  const description=document.createElement('span');description.textContent='Auto-remove from Watch Later after finishing (experimental)';
  label.append(input,description);
  const message=document.createElement('span');message.id=CLEANUP_MESSAGE;message.setAttribute('role','status');
  input.addEventListener('change',async()=>{
    const ok=await setCleanupPref(input.checked);
    if (!ok){input.checked=optIn;notifyCleanup('Could not save preference.');return;}
    optIn=input.checked;
    notifyCleanup(optIn?'Auto-removal enabled. Only confirmed Watch Later entries will be changed.':'Auto-removal disabled.');
  });
  wrapper.append(label,message);host.append(wrapper);
}
void cleanupPrefs().then(value=>{optIn=value;void renderCleanupControl();});
window.addEventListener('yt-navigate-finish',()=>void renderCleanupControl());
window.setInterval(()=>void renderCleanupControl(),1600);
