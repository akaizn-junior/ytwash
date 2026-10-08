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
  return row.parentElement;
}

function reconcileGrouping(): void {
  if (!onPlaylist()) return;
  originalOrder.clear();
  nextIndex = 0;
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
  groupRows();
  groupedSignature = signature;
}

// Keep YouTube's renderer children and continuation sentinel in place. Moving
// custom elements disconnects them and breaks the native incremental renderer.
const rowStyles = new Map<HTMLElement, string>();
const parentStyles = new Map<HTMLElement, string>();
const style = document.createElement('style');
style.textContent = `.${GROUP_CLASS}::before { content: attr(data-ytwash-heading); display:block;
  font:600 14px Arial,sans-serif; color:var(--yt-spec-text-primary,#0f0f0f); padding:10px 6px 4px; }`;
(document.head || document.documentElement).append(style);

function restoreRows(): void {
  for (const [row, css] of rowStyles) {
    row.style.cssText = css;
    row.classList.remove(GROUP_CLASS, 'ytwash-grouped-row');
    delete row.dataset.ytwashHeading;
  }
  for (const [parent, css] of parentStyles) parent.style.cssText = css;
  rowStyles.clear();
  parentStyles.clear();
}

function groupRows(): void {
  if (!onPlaylist()) return;
  const parent = playlistParent();
  if (!parent) return;
  const entries = Array.from(parent.children)
    .filter((node): node is HTMLElement => node instanceof HTMLElement && node.matches(VIDEO_SELECTOR))
    .map(entryFor).filter((entry): entry is Entry => entry !== null);
  if (!entries.length) return;
  if (!parentStyles.has(parent)) parentStyles.set(parent, parent.style.cssText);
  parent.style.display = 'flex';
  parent.style.flexDirection = 'column';
  const ordered = creatorOrder(entries);
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.key, (counts.get(entry.key) || 0) + 1);
  let previous = '';
  let restHeadingShown = false;
  ordered.forEach((entry, index) => {
    const row = entry.element;
    if (!rowStyles.has(row)) rowStyles.set(row, row.style.cssText);
    // Negative order keeps native continuation/loading controls after all rows.
    row.style.order = String(index - ordered.length);
    row.classList.remove(GROUP_CLASS);
    delete row.dataset.ytwashHeading;
    row.classList.add('ytwash-grouped-row');
    if (entry.key !== previous && counts.get(entry.key)! > 1) {
      row.classList.add(GROUP_CLASS);
      row.dataset.ytwashHeading = entry.creator + ' · ' + counts.get(entry.key) + ' videos';
    }
    if (counts.get(entry.key) === 1 && !restHeadingShown) {
      row.classList.add(GROUP_CLASS);
      row.dataset.ytwashHeading = 'Rest';
      restHeadingShown = true;
    }
    previous = entry.key;
  });
  groupingEnabled = true;
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

// Observe native row changes only; grouping changes CSS, never renderer children.
observer = new MutationObserver(mutations => {
  if (!onPlaylist()) return;

  if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
    node instanceof Element && (node.matches(VIDEO_SELECTOR) || node.querySelector(VIDEO_SELECTOR))) ||
    (mutation.target instanceof Element && mutation.target.closest(VIDEO_SELECTOR)))) scheduleControl();
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
  const nativeEntries = [...document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR)]
    .map(entryFor).filter((item): item is Entry => item !== null).sort((a,b) => a.index - b.index);
  const ordered = preferences.groupByCreator ? creatorOrder(nativeEntries) : nativeEntries;
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
