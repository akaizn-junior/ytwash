import { startCreatorPlayback } from './playback';
import './cleanup';
import './timestamps';

/**
 * Leave YouTube's Watch Later list untouched by default. Group only when the
 * user explicitly turns grouping on, and apply that grouping as a one-shot DOM
 * operation so YouTube's frequent playlist mutations cannot repeatedly move rows.
 */
const VIDEO_SELECTOR = 'ytd-playlist-video-renderer';
const GROUP_CLASS = 'ytwash-native-group';
const CONTROL_CLASS = 'ytwash-grouping-control';
const CONTROL_ID = 'ytwash-grouping-toggle';
type Entry = { element: HTMLElement; id: string; creator: string; key: string; index: number };

const originalOrder = new Map<HTMLElement, number>();
let nextIndex = 0;
let observer: MutationObserver;
let scheduled: number | undefined;
let rendering = false;
let groupingEnabled = false;
let lastPage = '';

function onWatchLater(): boolean {
  return location.pathname === '/playlist' && new URLSearchParams(location.search).get('list') === 'WL';
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

function setControlState(button: HTMLButtonElement): void {
  button.setAttribute('aria-pressed', String(groupingEnabled));
  button.textContent = groupingEnabled ? 'Grouping on · Undo' : 'Group by creator';
}

function ensureControl(): void {
  if (!onWatchLater()) {
    document.querySelector('.' + CONTROL_CLASS)?.remove();
    return;
  }
  const parent = playlistParent();
  if (!parent) return;

  let wrapper = document.querySelector<HTMLElement>('.' + CONTROL_CLASS);
  if (wrapper?.parentElement !== parent) {
    wrapper?.remove();
    wrapper = document.createElement('div');
    wrapper.className = CONTROL_CLASS;
    wrapper.style.cssText = 'box-sizing:border-box;width:100%;display:flex;justify-content:flex-end;padding:8px 0';
    const button = document.createElement('button');
    button.id = CONTROL_ID;
    button.type = 'button';
    button.setAttribute('aria-label', 'Group Watch Later videos by creator');
    button.style.cssText = 'font:inherit;color:var(--yt-spec-text-primary,#0f0f0f);background:var(--yt-spec-badge-chip-background,#f2f2f2);border:0;border-radius:18px;padding:8px 14px;cursor:pointer';
    button.addEventListener('click', () => {
      if (groupingEnabled) {
        restoreRows();
        groupingEnabled = false;
        originalOrder.clear();
        nextIndex = 0;
      } else {
        groupRows();
      }
      setControlState(button);
    });
    wrapper.append(button);
    parent.insertBefore(wrapper, parent.firstChild);
  }
  const button = wrapper.querySelector<HTMLButtonElement>('#' + CONTROL_ID);
  if (button) setControlState(button);
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
  return box;
}

function groupRows(): void {
  if (!onWatchLater() || rendering) return;
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
  document.querySelector('.' + CONTROL_CLASS)?.remove();
}

function scheduleControl(): void {
  if (scheduled !== undefined) clearTimeout(scheduled);
  scheduled = window.setTimeout(() => {
    scheduled = undefined;
    ensureControl();
  }, 150);
}

// Observe YouTube only to place the control after its playlist renders. DOM
// mutations never trigger grouping or move video rows.
observer = new MutationObserver(mutations => {
  if (rendering || !onWatchLater()) return;
  if (mutations.every(mutation => (mutation.target as Element).closest?.('.' + CONTROL_CLASS))) return;
  scheduleControl();
});
observer.observe(document.documentElement, { subtree: true, childList: true });

document.addEventListener('click', event => {
  if (!onWatchLater() || event.defaultPrevented || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      !(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>(
    'a#video-title, ytd-thumbnail a[href*="/watch"], a#thumbnail[href*="/watch"]'
  );
  const row = link?.closest<HTMLElement>(VIDEO_SELECTOR);
  if (!link || !row) return;
  const ordered = [...document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR)]
    .map(entryFor).filter((item): item is Entry => item !== null);
  const selected = ordered.findIndex(item => item.element === row);
  if (selected < 0) return;
  const queue = ordered.slice(selected).map(item => item.id);
  if (queue.length > 0 && startCreatorPlayback('Watch Later', queue)) event.preventDefault();
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
