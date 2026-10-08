import { startCreatorPlayback } from './playback';
import './cleanup';
import './timestamps';
import { preferences, preferencesReady, preferenceKeys } from './preferences';
import { playlistId, indexPlaylist, creatorOrder } from './playlists';

/** Apply the stored grouping preference without adding page controls. */
const VIDEO_SELECTOR = 'ytd-playlist-video-renderer';
const GROUP_CLASS = 'ytwash-native-group';
type Entry = { element: HTMLElement; id: string; creator: string; key: string; index: number };

const originalOrder = new Map<HTMLElement, number>();
let nextIndex = 0;
let observer: MutationObserver;
let scheduled: number | undefined;
let rendering = false;
let groupingEnabled = false;
let lastPage = '';
let groupedSignature = '';

function onPlaylist(): boolean {
  return location.pathname === '/playlist' && playlistId() !== null;
}

function entryFor(el: HTMLElement): Entry | null {
  const title = el.querySelector<HTMLAnchorElement>('a#video-title');
  if (!title) return null;
  const id = new URL(title.href, location.origin).searchParams.get('v');
  if (!id) return null;
  const channel = el.querySelector<HTMLAnchorElement>(
    'ytd-channel-name a[href], #channel-name a[href], a[href^="/channel/"], a[href^="/@"]'
  );
  const creator = channel?.textContent?.trim() || el.querySelector('#channel-name')?.textContent?.trim() || '';
  if (!creator) return null;
  const path = channel?.getAttribute('href')?.split('?')[0] || '';
  const key = path.startsWith('/channel/') ? path : path.startsWith('/@') ? path.toLowerCase() : 'name:' + creator.toLowerCase();
  if (!originalOrder.has(el)) originalOrder.set(el, nextIndex++);
  return { element: el, id, creator, key, index: originalOrder.get(el)! };
}

function playlistParent(): HTMLElement | null {
  const row = document.querySelector<HTMLElement>(VIDEO_SELECTOR);
  if (!row) return null;
  return row.closest<HTMLElement>('.' + GROUP_CLASS)?.parentElement || row.parentElement;
}

function reconcileGrouping(): void {
  if (!onPlaylist()) return;
  const indexed = [...document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR)]
    .map(entryFor).filter((entry): entry is Entry => entry !== null).sort((a,b) => a.index - b.index);
  indexPlaylist(playlistId()!, indexed);
  if (!preferences.groupByCreator) {
    if (groupingEnabled) restoreRows();
    groupingEnabled = false;
    groupedSignature = '';
    return;
  }
  const signature = [...document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR)]
    .map(entryFor).filter((entry): entry is Entry => entry !== null)
    .sort((a,b) => a.index - b.index).map(entry => entry.id + ':' + entry.key).join('|');
  if (!signature || signature === groupedSignature) return;
  if (groupingEnabled) restoreRows();
  groupRows();
  groupedSignature = signature;
}

function restoreRows(): void {
  rendering = true;
  observer?.disconnect();
  try {
    for (const box of document.querySelectorAll<HTMLElement>('.' + GROUP_CLASS)) {
      box.replaceWith(...Array.from(box.querySelectorAll<HTMLElement>(VIDEO_SELECTOR)));
    }
    const entries = [...originalOrder.entries()]
      .filter(([el]) => el.isConnected)
      .sort((a, b) => a[1] - b[1]);
    const byParent = new Map<HTMLElement, HTMLElement[]>();
    for (const [el] of entries) {
      if (!el.parentElement) continue;
      const list = byParent.get(el.parentElement) || [];
      list.push(el);
      byParent.set(el.parentElement, list);
    }
    for (const [parent, list] of byParent) {
      for (const el of list) parent.appendChild(el);
    }
  } finally {
    rendering = false;
    observer?.observe(document.documentElement, { subtree: true, childList: true });
  }
}

function makeGroup(creator: string, key: string, entries: Entry[]): HTMLElement {
  const box = document.createElement('div');
  box.className = GROUP_CLASS;
  box.dataset.creator = key;
  box.setAttribute('aria-label', creator + ' · ' + entries.length + ' videos');
  box.style.cssText = 'box-sizing:border-box;width:100%;margin:4px 0 10px;padding:4px 6px;border:0;background:transparent';
  const heading = document.createElement('div');
  heading.textContent = creator + ' · ' + entries.length + ' videos';
  heading.style.cssText = 'font:600 14px Arial,sans-serif;color:var(--yt-spec-text-primary,#0f0f0f);margin:0 0 4px';
  box.append(heading);
  return box;
}

function groupRows(): void {
  if (!onPlaylist() || rendering) return;
  const nodes = [...document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR)];
  const entries = nodes.map(entryFor).filter((entry): entry is Entry => entry !== null)
    .sort((a, b) => a.index - b.index);
  const parent = playlistParent();
  if (!parent || entries.length === 0) return;

  rendering = true;
  observer?.disconnect();
  try {
    const groups = new Map<string, Entry[]>();
    for (const entry of entries) {
      const list = groups.get(entry.key) || [];
      list.push(entry);
      groups.set(entry.key, list);
    }
    const multiple = [...groups.entries()].filter(([, list]) => list.length >= 2);
    const grouped = new Set(multiple.flatMap(([, list]) => list.map(entry => entry.element)));

    for (const [key, list] of multiple.sort((a, b) => a[1][0].index - b[1][0].index)) {
      const box = makeGroup(list[0].creator, key, list);
      parent.appendChild(box);
      for (const entry of list) box.appendChild(entry.element);
    }
    // Creators with one video remain ordinary YouTube rows.
    for (const entry of entries) {
      if (!grouped.has(entry.element)) parent.appendChild(entry.element);
    }
    groupingEnabled = true;
  } finally {
    rendering = false;
    observer?.observe(document.documentElement, { subtree: true, childList: true });
  }
}

function resetForNavigation(): void {
  if (groupingEnabled) restoreRows();
  groupingEnabled = false;
  originalOrder.clear();
  nextIndex = 0;
  groupedSignature = '';
}

function scheduleControl(): void {
  if (scheduled !== undefined) clearTimeout(scheduled);
  scheduled = window.setTimeout(() => {
    scheduled = undefined;
    reconcileGrouping();
  }, 150);
}

// Reconcile only when loaded entries change; our own row moves are disconnected.
observer = new MutationObserver(mutations => {
  if (rendering || !onPlaylist()) return;

  scheduleControl();
});
observer.observe(document.documentElement, { subtree: true, childList: true });

document.addEventListener('click', event => {
  if (!onPlaylist() || event.defaultPrevented || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      !(event.target instanceof Element)) return;
  const play = event.target.closest<HTMLButtonElement>('button');
  if (play && preferences.groupByCreator && preferences.groupPlayback &&
      play.closest('ytd-playlist-header-renderer, ytd-playlist-header-view-model, ytd-playlist-sidebar-primary-info-renderer') &&
      /^(play(?: all)?|reproduzir(?: tudo)?|tocar(?: tudo)?)(\s|$)/i.test(play.getAttribute('aria-label') || play.textContent || '')) {
    const entries = [...document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR)]
      .map(entryFor).filter((entry): entry is Entry => entry !== null).sort((a,b) => a.index - b.index);
    if (startCreatorPlayback(playlistId()!, creatorOrder(entries).map(entry => entry.id))) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  const link = event.target.closest<HTMLAnchorElement>(
    'a[href*="/watch"]'
  );
  const row = link?.closest<HTMLElement>(VIDEO_SELECTOR);
  if (!link) return;
  if (!row) {
    const url = new URL(link.href);
    if (!preferences.groupByCreator || !preferences.groupPlayback || url.pathname !== '/watch' ||
        url.searchParams.get('list') !== playlistId() ||
        !link.closest('ytd-playlist-header-renderer, ytd-playlist-header-view-model, ytd-playlist-sidebar-primary-info-renderer')) return;
    const entries = [...document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR)]
      .map(entryFor).filter((entry): entry is Entry => entry !== null).sort((a,b) => a.index - b.index);
    const ids = creatorOrder(entries).map(entry => entry.id);
    if (!ids.length) return;
    const originalId = url.searchParams.get('v');
    url.searchParams.set('v', ids[0]);
    // An explicit timestamp belongs only to the video identified by that URL.
    if (originalId !== ids[0]) ['t', 'start', 'time_continue'].forEach(key => url.searchParams.delete(key));
    if (startCreatorPlayback(playlistId()!, ids, url.href)) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  if (preferences.groupByCreator && !preferences.groupPlayback) return;
  const ordered = [...document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR)]
    .map(entryFor).filter((item): item is Entry => item !== null);
  const selected = ordered.findIndex(item => item.element === row);
  if (selected < 0) return;
  const queue = ordered.slice(selected).map(item => item.id);
  const url = new URL(link.href);
  url.searchParams.set('list', playlistId()!);
  if (queue.length > 0 && startCreatorPlayback(playlistId()!, queue, url.href)) event.preventDefault();
}, true);

window.addEventListener('yt-navigate-finish', () => {
  const page = location.pathname + location.search;
  if (page !== lastPage) {
    resetForNavigation();
    lastPage = page;
  }
  scheduleControl();
});

lastPage = location.pathname + location.search;
scheduleControl();

void preferencesReady.then(scheduleControl);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[preferenceKeys.groupByCreator]) scheduleControl();
});
