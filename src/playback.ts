/** Session-only queue of videos for one creator, played using YouTube's native player. */
import { preferences, preferencesReady } from './preferences';
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
async function navigateToVideo(id: string, originalUrl?: string): Promise<void> {
  const sourceLocation = location.href;
  const url = new URL(originalUrl || '/watch?v=' + encodeURIComponent(id), location.origin);
  const activeQueue = getQueue();
  if (!originalUrl && activeQueue) url.searchParams.set('list', activeQueue.creator);
  await preferencesReady;
  if (preferences.resume && !['t', 'start', 'time_continue'].some(key => url.searchParams.has(key))) {
    const saved = await new Promise<number | null>(resolve => {
      chrome.storage.local.get('ytwash:resume:' + id, data => {
        const seconds = data['ytwash:resume:' + id]?.seconds;
        resolve(!chrome.runtime.lastError && Number.isFinite(seconds) && seconds >= 1 ? seconds : null);
      });
    });
    if (preferences.resume && saved !== null) url.searchParams.set('t', Math.floor(saved) + 's');
  }
  const queue = getQueue();
  if (location.href !== sourceLocation || !queue || queue.ids[queue.index] !== id) return;
  location.assign(url.href);
}
export function startCreatorPlayback(creator: string, ids: string[], originalUrl?: string): boolean {
  const unique = [...new Set(ids)].filter(id => /^[\w-]{11}$/.test(id));
  if (!unique.length || !saveQueue({ creator, ids: unique, index: 0 })) return false;
  void navigateToVideo(unique[0], originalUrl);
  return true;
}
function videoId(): string | null {
  return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
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
    void navigateToVideo(active.ids[next]);
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
