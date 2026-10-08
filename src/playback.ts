/** Playback cursor backed by the persisted grouped playlist index. */
import { preferences, preferencesReady, preferenceKeys } from './preferences';
import { playlistId, readPlaylist, indexPlaylist, creatorOrder, type PlaylistEntry } from './playlists';
const QUEUE_KEY = 'ytwash:creator-queue:v1';
type CreatorQueue = { creator: string; ids: string[]; index: number };
let attached: HTMLVideoElement | null = null;
let advancing = false;
let lastLocation = '';
let hydrating = '';
async function hydrateNativePlaylist(): Promise<void> {
  const list = playlistId(), id = videoId(), source = location.href;
  if (!list || !id || getQueue() || hydrating === source) return;
  hydrating = source;
  try {
    await preferencesReady;
    if (!preferences.groupByCreator || !preferences.groupPlayback) return;
    const cached = await readPlaylist(list);
    const sidebar: PlaylistEntry[] = [];
    for (const row of document.querySelectorAll<HTMLElement>('ytd-playlist-panel-video-renderer')) {
      const link = row.querySelector<HTMLAnchorElement>('a[href*="/watch"]');
      const entryId = link && new URL(link.href, location.origin).searchParams.get('v');
      const creator = row.querySelector<HTMLElement>('#byline, #channel-name, ytd-channel-name')?.textContent?.trim();
      if (entryId && /^[\w-]{11}$/.test(entryId) && creator) sidebar.push({ id: entryId, creator, key: creator.toLowerCase() });
    }
    // A sidebar may contain only a window of the playlist. Do not let it
    // replace the complete order captured on the grouped playlist page.
    const entries = cached?.entries.some(entry => entry.id === id) ? cached.entries : sidebar;
    if (!cached && sidebar.length) indexPlaylist(list, sidebar);
    const ordered = creatorOrder(entries).map(entry => entry.id);
    const index = ordered.indexOf(id);
    if (location.href !== source || getQueue() || !preferences.groupByCreator || !preferences.groupPlayback || index < 0) return;
    if (saveQueue({ creator: list, ids: [...new Set(ordered.slice(index))], index: 0 })) window.setTimeout(reconcilePlayback, 0);
  } finally { hydrating = ''; }
}

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
  url.searchParams.delete('index');
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
async function refreshQueue(queue: CreatorQueue, id: string): Promise<CreatorQueue> {
  if (!preferences.groupByCreator || !preferences.groupPlayback) return queue;
  const cached = await readPlaylist(queue.creator);
  const ids = cached ? [...new Set(creatorOrder(cached.entries).map(entry => entry.id))] : queue.ids;
  const index = ids.indexOf(id);
  const current = getQueue();
  if (index < 0 || videoId() !== id || current?.creator !== queue.creator || current.ids[current.index] !== id) return queue;
  const updated = { ...queue, ids, index };
  saveQueue(updated);
  return updated;
}
async function advance(direction: number): Promise<void> {
  const initial = getQueue(), id = videoId();
  if (!initial || !id || advancing) return;
  advancing = true;
  const queue = await refreshQueue(initial, id);
  const active = getQueue();
  if (videoId() !== id || !active || active.creator !== queue.creator || active.ids[active.index] !== id) { advancing = false; return; }
  const next = queue.index + direction;
  if (next < 0 || next >= queue.ids.length) { advancing = false; return; }
  if (!saveQueue({ ...queue, index: next })) { stopCreatorPlayback(); return; }
  await navigateToVideo(queue.ids[next]);
}
function ended(event: Event): void {
  const queue = getQueue(), id = videoId();
  if (!queue || !id || queue.ids[queue.index] !== id || advancing) return;
  event.stopImmediatePropagation();
  attached?.dispatchEvent(new Event('ytwash-queued-ended'));
  void advance(1);
}
// Capture native player controls before YouTube navigates in native index order.
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
      event.shiftKey || event.altKey || !(event.target instanceof Element) ||
      !preferences.groupByCreator || !preferences.groupPlayback) return;
  const control = event.target.closest('.ytp-next-button, .ytp-prev-button');
  if (!control || !getQueue()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void advance(control.matches('.ytp-prev-button') ? -1 : 1);
}, true);

function reconcilePlayback(): void {
  let queue = getQueue();
  const id = videoId(), path = location.pathname + location.search;
  if (queue && playlistId() && playlistId() !== queue.creator) { stopCreatorPlayback(); queue = null; }
  if (path !== lastLocation) { lastLocation = path; advancing = false; }
  if (!queue || !id || queue.ids[queue.index] !== id) {
    if (queue) stopCreatorPlayback();
    if (attached) { attached.removeEventListener('ended',ended,true); attached=null; }
    void hydrateNativePlaylist();
    return;
  }
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (video && video !== attached) {
    attached?.removeEventListener('ended',ended,true);
    attached=video;video.addEventListener('ended',ended,true);
  }
}
window.addEventListener('yt-navigate-finish',reconcilePlayback);
window.addEventListener('popstate',reconcilePlayback);
window.setInterval(reconcilePlayback,1500);
reconcilePlayback();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const queue = getQueue(), id = videoId();
  if (queue && id && changes['ytwash:playlist:' + queue.creator]) void refreshQueue(queue, id);
  if (![preferenceKeys.groupByCreator, preferenceKeys.groupPlayback].some(key => changes[key])) return;
  stopCreatorPlayback();
  reconcilePlayback();
});
