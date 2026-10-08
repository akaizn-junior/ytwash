/** Group sidebar rows visually without reparenting YouTube custom elements. */
import { preferences, preferencesReady, preferenceKeys } from './preferences';
import { playlistId, readPlaylist, indexPlaylist, creatorOrder, type PlaylistEntry } from './playlists';
import { startCreatorPlayback } from './playback';
const selector = 'ytd-playlist-panel-video-renderer';
const rows = new Map<HTMLElement, string>();
const parents = new Map<HTMLElement, string>();
let scheduled: number | undefined;
let running = false;
let pending = false;
let currentList: string | null = null;
let currentOrder: string[] = [];
const style = document.createElement('style');
style.textContent = `.ytwash-sidebar-heading {position:relative!important;padding-top:32px!important;box-sizing:border-box}
.ytwash-sidebar-heading::before {content:attr(data-ytwash-heading);position:absolute;top:6px;left:8px;right:8px;
height:20px;line-height:20px;font-size:13px;font-weight:600;color:var(--yt-spec-text-primary);
overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none}`;
(document.head || document.documentElement).append(style);
function restore(): void {
  for (const [row, css] of rows) {
    row.style.cssText = css;
    row.classList.remove('ytwash-sidebar-heading');
    delete row.dataset.ytwashHeading;
  }
  for (const [parent, css] of parents) parent.style.cssText = css;
  rows.clear(); parents.clear(); currentOrder = [];
}
async function reconcile(): Promise<void> {
  if (running) { pending = true; return; }
  running = true;
  try {
    await preferencesReady;
    const list = location.pathname === '/watch' ? playlistId() : null;
    if (list !== currentList || !preferences.groupByCreator) restore();
    currentList = list;
    if (!list || !preferences.groupByCreator) return;
    const source = location.href;
    const cached = await readPlaylist(list);
    if (location.href !== source || !preferences.groupByCreator) return;
    const visible: (PlaylistEntry & { element: HTMLElement })[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const link = element.querySelector<HTMLAnchorElement>('a[href*="/watch"]');
      const url = link && new URL(link.href, location.origin);
      const id = url?.searchParams.get('v');
      const creator = element.querySelector('#byline, #channel-name, ytd-channel-name')?.textContent?.trim();
      if (!id || !/^[\w-]{11}$/.test(id) || !creator || (url?.searchParams.get('list') && url.searchParams.get('list') !== list)) continue;
      const known = cached?.entries.find(entry => entry.id === id || entry.creator.toLowerCase() === creator.toLowerCase());
      visible.push({ element, id, creator, key: known?.key || 'name:' + creator.toLowerCase() });
    }
    if (!visible.length) return;
    const entries = [...(cached?.entries || [])];
    for (const { id, creator, key } of visible) {
      if (!entries.some(entry => entry.id === id)) entries.push({ id, creator, key });
    }
    indexPlaylist(list, entries);
    const ordered = creatorOrder(entries);
    currentOrder = [...new Set(ordered.map(entry => entry.id))];
    const rank = new Map(currentOrder.map((id, index) => [id, index]));
    const sorted = [...visible].sort((a,b) => rank.get(a.id)! - rank.get(b.id)!);
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.key, (counts.get(entry.key) || 0) + 1);
    let previous = '', everythingElse = false;
    for (const entry of sorted) {
      const row = entry.element, parent = row.parentElement;
      if (!parent) continue;
      if (!parents.has(parent)) parents.set(parent, parent.style.cssText);
      parent.style.display = 'flex'; parent.style.flexDirection = 'column';
      if (!rows.has(row)) rows.set(row, row.style.cssText);
      row.style.order = String(rank.get(entry.id)! - currentOrder.length);
      row.classList.remove('ytwash-sidebar-heading'); delete row.dataset.ytwashHeading;
      const count = counts.get(entry.key)!;
      if (count > 1 && previous !== entry.key) {
        row.classList.add('ytwash-sidebar-heading'); row.dataset.ytwashHeading = entry.creator + ' · ' + count + ' videos';
      } else if (count === 1 && !everythingElse) {
        row.classList.add('ytwash-sidebar-heading'); row.dataset.ytwashHeading = 'Everything else'; everythingElse = true;
      }
      previous = entry.key;
    }
  } finally { running = false; if (pending) { pending = false; schedule(); } }
}
function schedule(): void {
  if (scheduled !== undefined) clearTimeout(scheduled);
  scheduled = window.setTimeout(() => { scheduled = undefined; void reconcile(); }, 100);
}
new MutationObserver(mutations => {
  if (mutations.some(m => (m.target instanceof Element && m.target.closest(selector)) ||
    [...m.addedNodes, ...m.removedNodes].some(n => n instanceof Element && (n.matches(selector) || n.querySelector(selector))))) schedule();
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('yt-navigate-finish', schedule);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[preferenceKeys.groupByCreator] || changes['ytwash:playlist:' + currentList])) schedule();
});
document.addEventListener('click', event => {
  if (!preferences.groupByCreator || !preferences.groupPlayback || !currentList || event.defaultPrevented ||
    event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('a[href*="/watch"]');
  if (!link?.closest(selector)) return;
  const url = new URL(link.href), id = url.searchParams.get('v');
  const index = id ? currentOrder.indexOf(id) : -1;
  if (index < 0) return;
  url.searchParams.set('list', currentList);
  if (startCreatorPlayback(currentList, currentOrder.slice(index), url.href)) {
    event.preventDefault(); event.stopImmediatePropagation();
  }
}, true);
void preferencesReady.then(schedule);
