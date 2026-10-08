/** Session-only queue of videos for one creator, played using YouTube's native player. */
const QUEUE_KEY = 'ytwash:creator-queue:v1';
type CreatorQueue = { creator: string; ids: string[]; index: number };
let attached: HTMLVideoElement | null = null;
let advancing = false;
let lastLocation = '';

function getQueue(): CreatorQueue | null {
  try {
    const value = sessionStorage.getItem(QUEUE_KEY);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const q = parsed as Partial<CreatorQueue>;
    if (typeof q.creator !== 'string' || !Array.isArray(q.ids) || q.ids.length === 0 ||
      q.ids.length > 5000 || q.ids.some(id => typeof id !== 'string' || !/^[\w-]{11}$/.test(id)) ||
      typeof q.index !== 'number' || !Number.isInteger(q.index) || q.index < 0 || q.index >= q.ids.length) return null;
    return { creator: q.creator, ids: q.ids, index: q.index };
  } catch { return null; }
}
function saveQueue(queue: CreatorQueue): boolean {
  try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); return true; }
  catch { return false; }
}
export function stopCreatorPlayback(): void {
  sessionStorage.removeItem(QUEUE_KEY);
  document.getElementById('ytwash-playback-control')?.remove();
  advancing = false;
}
export function startCreatorPlayback(creator: string, ids: string[]): boolean {
  const unique = [...new Set(ids)].filter(id => /^[\w-]{11}$/.test(id));
  if (!unique.length || !saveQueue({ creator, ids: unique, index: 0 })) return false;
  location.assign('/watch?v=' + encodeURIComponent(unique[0]));
  return true;
}
function videoId(): string | null {
  return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
}
function renderControls(queue: CreatorQueue): void {
  let wrapper = document.getElementById('ytwash-playback-control');
  if (!wrapper) {
    const host = document.querySelector<HTMLElement>('ytd-watch-metadata #actions, ytd-watch-metadata #top-row');
    if (!host) return;
    wrapper = document.createElement('div'); wrapper.id = 'ytwash-playback-control';
    wrapper.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px;color:var(--yt-spec-text-primary,#eee);font:13px Arial,sans-serif';
    const label = document.createElement('span');label.id='ytwash-playback-label';
    const stop = document.createElement('button');stop.type='button';stop.textContent='Stop creator playback';
    stop.style.cssText='border:0;border-radius:18px;padding:8px 12px;cursor:pointer;background:var(--yt-spec-badge-chip-background,#333);color:inherit';
    stop.addEventListener('click',stopCreatorPlayback);wrapper.append(label,stop);host.append(wrapper);
  }
  const label = document.getElementById('ytwash-playback-label');
  if (label) label.textContent = queue.creator + ' · ' + (queue.index + 1) + '/' + queue.ids.length;
}
function ended(): void {
  const queue = getQueue(), id = videoId();
  if (!queue || !id || queue.ids[queue.index] !== id || advancing) return;
  if (queue.index + 1 === queue.ids.length) { stopCreatorPlayback(); return; }
  advancing = true;
  window.setTimeout(() => {
    const active = getQueue();
    if (!active || videoId() !== id || active.ids[active.index] !== id) { advancing = false; return; }
    const next = active.index + 1;
    if (!saveQueue({ ...active, index: next })) { stopCreatorPlayback(); return; }
    location.assign('/watch?v=' + encodeURIComponent(active.ids[next]));
  }, 1800);
}
function reconcilePlayback(): void {
  const queue = getQueue(), id = videoId(), path = location.pathname + location.search;
  if (path !== lastLocation) { lastLocation = path; advancing = false; }
  if (!queue || !id || queue.ids[queue.index] !== id) {
    if (queue) stopCreatorPlayback();
    if (attached) { attached.removeEventListener('ended',ended); attached=null; }
    return;
  }
  renderControls(queue);
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (video && video !== attached) {
    attached?.removeEventListener('ended',ended);
    attached=video;video.addEventListener('ended',ended);
  }
}
window.addEventListener('yt-navigate-finish',reconcilePlayback);
window.addEventListener('popstate',reconcilePlayback);
window.setInterval(reconcilePlayback,1500);
reconcilePlayback();
