/** One action in native video menus; timing lives exclusively in Options. */
const rows = 'ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,ytd-playlist-video-renderer,ytd-playlist-panel-video-renderer,yt-lockup-view-model,ytd-reel-video-renderer,ytd-reel-item-renderer';
let selected: { id: string; title: string } | null = null;
function targetFor(element: Element): typeof selected {
  const row = element.closest(rows);
  const anchor = row?.querySelector<HTMLAnchorElement>('a[href*="/watch?"],a[href*="/shorts/"]');
  const url = anchor ? new URL(anchor.href) : new URL(location.href);
  if (!row && !element.closest('ytd-watch-metadata')) return null;
  const id = url.searchParams.get('v') || url.pathname.match(/^\/shorts\/([^/]+)/)?.[1];
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  return { id, title: row?.querySelector('#video-title,h3')?.textContent?.trim() || document.querySelector('ytd-watch-metadata h1')?.textContent?.trim() || 'YouTube video' };
}
document.addEventListener('click', event => {
  if (!(event.target instanceof Element) || event.target.closest('.ytwash-reminder')) return;
  if (event.target.closest('ytd-menu-renderer,button[aria-label*="More"],button[aria-label*="more"],button[aria-label*="Actions"],button[aria-label*="actions"]')) {
    selected = targetFor(event.target);
    document.querySelectorAll<HTMLButtonElement>('.ytwash-reminder').forEach(button => {
      button.hidden = !selected; button.textContent = 'Remind me to watch';
    });
  }
}, true);
function decorate(): void {
  for (const menu of document.querySelectorAll<HTMLElement>('ytd-menu-popup-renderer,yt-panel-container-view-model [role="menu"]')) {
    if (!selected || !menu.querySelector('ytd-menu-service-item-renderer,ytd-menu-navigation-item-renderer,yt-list-item-view-model')) continue;
    if (menu.querySelector('.ytwash-reminder')) continue;
    const button = document.createElement('button');
    button.className = 'ytwash-reminder';
    button.setAttribute('role', 'menuitem');
    button.textContent = 'Remind me to watch';
    button.style.cssText = 'display:block;width:100%;border:0;background:transparent;color:var(--yt-spec-text-primary,#0f0f0f);text-align:left;padding:12px 16px;font:inherit;font-size:14px;cursor:pointer';
    button.onmouseenter = () => { button.style.background = 'var(--yt-spec-badge-chip-background,rgba(127,127,127,.15))'; };
    button.onmouseleave = () => { button.style.background = 'transparent'; };
    button.onclick = () => {
      const target = selected;
      if (!target) return;
      button.disabled = true;
      chrome.runtime.sendMessage({ type: 'ytwash:remind', ...target }, response => {
        const failed = chrome.runtime.lastError || !response?.ok;
        button.textContent = failed ? 'Could not set reminder. Try again.' : 'Reminder set';
        button.disabled = false;
        if (!failed) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
    };
    (menu.querySelector('#items') || menu).append(button);
  }
}
let pending = false;
new MutationObserver(() => {
  if (pending) return;
  pending = true;
  setTimeout(() => { pending = false; decorate(); }, 100);
}).observe(document.documentElement, { subtree: true, childList: true });
window.addEventListener('yt-navigate-finish', () => { selected = null; });
