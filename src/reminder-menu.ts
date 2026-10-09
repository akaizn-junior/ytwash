/** Reuse YouTube's native menu renderer and its existing theme styles. */
let selected: { id: string; title: string } | null = null;
let entries = new Map<string, { id: string; title?: string; creator?: string }>();
let pending = false;
const menus = new Map<HTMLElement, { original: HTMLElement[]; display: Map<HTMLElement, [string, string]>; source: HTMLElement }>();
function nativeItem(source: HTMLElement, label: string, action: () => void): HTMLElement {
  const item = source.cloneNode(true) as HTMLElement;
  item.removeAttribute('id'); item.setAttribute('data-ytwash-reminder', '');
  item.removeAttribute('hidden'); item.style.removeProperty('display');
  // Supply only presentation data, never copy a native service endpoint.
  (item as HTMLElement & { data: unknown }).data = { text: { runs: [{ text: label }] }, icon: { iconType: 'WATCH_LATER' } };
  const text = item.querySelector('yt-formatted-string, .yt-list-item-view-model__title');
  if (text) text.textContent = label;
  item.setAttribute('role', 'menuitem'); item.setAttribute('tabindex', '0'); item.setAttribute('aria-label', label);
  item.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); action(); }, true);
  item.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopImmediatePropagation(); action(); }
  }, true);
  return item;
}
function restoreMenu(popup: HTMLElement): void {
  const state = menus.get(popup);
  if (!state) return;
  popup.querySelectorAll('[data-ytwash-reminder]').forEach(item => item.remove());
  for (const [item, [value, priority]] of state.display) {
    if (value) item.style.setProperty('display', value, priority); else item.style.removeProperty('display');
  }
  menus.delete(popup);
}
function choices(popup: HTMLElement, video: { id: string; title: string }): void {
  const state = menus.get(popup);
  if (!state) return;
  state.original.forEach(item => {
    if (!state.display.has(item)) state.display.set(item, [item.style.getPropertyValue('display'), item.style.getPropertyPriority('display')]);
    item.style.setProperty('display', 'none', 'important');
  });
  popup.querySelectorAll('[data-ytwash-reminder]').forEach(item => item.remove());
  const parent = state.source.parentElement || popup;
  for (const [preset, label] of [['later-today', 'Later today'], ['three-days', 'In 3 days'], ['week', 'In a week'], ['custom', 'Choose a date and time…']]) {
    parent.append(nativeItem(state.source, label, () => {
      const type = preset === 'custom' ? 'ytwash:open-custom-reminder' : 'ytwash:schedule-reminder';
      chrome.runtime.sendMessage({ type, id: video.id, title: video.title, preset }, response => {
        const message = chrome.runtime.lastError ? 'Could not set your reminder. Try again.' : response?.error ||
          (response?.dueAt ? 'We’ll remind you ' + new Date(response.dueAt).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '.' : 'Choose a date and time in Options.');
        popup.querySelectorAll('[data-ytwash-reminder]').forEach(item => item.remove());
        const confirmation = nativeItem(state.source, message, () => restoreMenu(popup));
        confirmation.setAttribute('role', 'status'); confirmation.setAttribute('aria-live', 'polite'); parent.append(confirmation);
      });
    }));
  }
  parent.append(nativeItem(state.source, 'Back', () => { restoreMenu(popup); reconcile(); }));
  parent.querySelector<HTMLElement>('[data-ytwash-reminder]')?.focus();
}
function current(): { id: string; title: string } | null {
  if (location.pathname !== '/watch') return selected;
  const id = new URLSearchParams(location.search).get('v');
  if (!id || !/^[\w-]{11}$/.test(id) || (new URLSearchParams(location.search).get('list') !== 'WL' && !entries.has(id))) return null;
  return { id, title: document.querySelector('ytd-watch-metadata h1, #title h1')?.textContent?.trim() || entries.get(id)?.title || 'A Watch Later video' };
}
function reconcile(): void {
  const video = current();
  for (const popup of menus.keys()) if (!popup.isConnected || !popup.getClientRects().length) restoreMenu(popup);
  if (!video) return;
  for (const popup of document.querySelectorAll<HTMLElement>('ytd-menu-popup-renderer')) {
    if (!popup.getClientRects().length || menus.has(popup)) continue;
    const original = [...popup.querySelectorAll<HTMLElement>('ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, yt-list-item-view-model')];
    const source = original[0]; if (!source || !source.parentElement) continue;
    menus.set(popup, { original, display: new Map(), source });
    source.parentElement.append(nativeItem(source, 'Remind me to watch', () => choices(popup, video)));
  }
}
function schedule(): void {
  if (pending) return; pending = true;
  window.setTimeout(() => { pending = false; reconcile(); }, 50);
}
function loadEntries(): void {
  chrome.storage.local.get('ytwash:playlist:WL', values => {
    if (chrome.runtime.lastError) return;
    entries = new Map((values['ytwash:playlist:WL']?.entries || []).map((entry: { id: string }) => [entry.id, entry]));
    schedule();
  });
}
document.addEventListener('click', event => {
  if (!(event.target instanceof Element) || event.target.closest('[data-ytwash-reminder]')) return;
  if (location.pathname === '/playlist' && new URLSearchParams(location.search).get('list') === 'WL') {
    const row = event.target.closest('ytd-playlist-video-renderer');
    const link = row?.querySelector<HTMLAnchorElement>('a#video-title');
    const id = link && new URL(link.href, location.origin).searchParams.get('v');
    selected = id && /^[\w-]{11}$/.test(id) ? { id, title: link!.textContent?.trim() || 'A Watch Later video' } : null;
  }
  // Restore reused native popups before opening them for a different video.
  if (event.target.closest('ytd-menu-renderer button, yt-icon-button button')) for (const popup of menus.keys()) restoreMenu(popup);
  schedule();
}, true);
window.addEventListener('yt-navigate-finish', () => { selected = null; for (const popup of menus.keys()) restoreMenu(popup); schedule(); });
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes['ytwash:playlist:WL']) loadEntries(); });
new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'opened', 'style', 'class'] });
// Carry the actual YouTube palette to Options; in-page menus inherit it directly.
function theme(): void {
  const style = getComputedStyle(document.documentElement);
  const tokens: Record<string, string> = {};
  for (const key of ['--yt-spec-base-background', '--yt-spec-text-primary', '--yt-spec-text-secondary', '--yt-spec-badge-chip-background', '--yt-spec-10-percent-layer']) {
    const value = style.getPropertyValue(key).trim(); if (value) tokens[key] = value;
  }
  chrome.storage.local.set({ 'ytwash:youtube-dark': document.documentElement.hasAttribute('dark'), 'ytwash:youtube-theme': tokens });
}
new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
theme(); loadEntries();
