/** Use only visible native YouTube controls. Never toggle unknown membership. */
export function watchId(): string | null {
  return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
}
const saveLabel = /^(save|guardar|salvar)(\s|$)/i;
function controlLabel(node: HTMLElement): string {
  const label = node.getAttribute('aria-label') || node.querySelector('yt-formatted-string, .yt-list-item-view-model__title')?.textContent;
  if (label) return label.trim();
  // Our SVG title must not turn plain "Save" text into "SaveYTWash…".
  const copy = node.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.ytwash-save-lightning').forEach(icon => icon.remove());
  return (copy.textContent || '').trim();
}
export function saveControls(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(
    'ytd-watch-metadata button, ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, yt-list-item-view-model'
  )].filter(node => node.id !== 'ytwash-save-for-later' && node.getClientRects().length > 0 && saveLabel.test(controlLabel(node)));
}
export function watchLaterCheckbox(): HTMLElement | null { return playlistCheckbox('WL'); }
function playlistCheckbox(list: string): HTMLElement | null {
  const panelTitle = document.querySelector<HTMLElement>('ytd-playlist-panel-renderer #title')?.textContent?.trim();
  const candidates: HTMLElement[] = [];
  const rows = document.querySelectorAll<HTMLElement>(
    'ytd-playlist-add-to-option-renderer, ytd-add-to-playlist-renderer, tp-yt-paper-item, yt-list-item-view-model'
  );
  for (const row of rows) {
    if (!row.getClientRects().length) continue;
    const label = (row.querySelector('#label, #title, .title, .yt-list-item-view-model__title')?.textContent || row.textContent || '').trim();
    const explicitId = row.getAttribute('data-playlist-id');
    const link = row.querySelector<HTMLAnchorElement>('a[href*="list="]');
    const linkedId = link ? new URL(link.href, location.origin).searchParams.get('list') : null;
    const matches = list === 'WL' ? /^(watch later|ver mais tarde|assistir mais tarde)(\s|$)/i.test(label) :
      explicitId === list || linkedId === list || (!!panelTitle && label === panelTitle);
    if (!matches) continue;
    const checkbox = row.querySelector<HTMLElement>('[role="checkbox"], tp-yt-paper-checkbox, yt-checkbox-view-model, input[type="checkbox"]');
    if (checkbox?.getClientRects().length && !candidates.includes(checkbox)) candidates.push(checkbox);
  }
  return candidates.length === 1 ? candidates[0] : null;
}
export function checked(target: HTMLElement): boolean | null {
  if (target instanceof HTMLInputElement) return target.indeterminate ? null : target.checked;
  const state = target.getAttribute('aria-checked');
  if (state === 'true') return true;
  if (state === 'false') return false;
  if (target.hasAttribute('checked')) return true;
  const property = (target as HTMLElement & { checked?: boolean }).checked;
  if (typeof property === 'boolean') return property;
  return null;
}
export async function waitForWatchLater(id: string): Promise<HTMLElement | null> { return waitForPlaylist(id, 'WL'); }
async function waitForPlaylist(id: string, list: string): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < 30 && watchId() === id; attempt++) {
    const checkbox = playlistCheckbox(list);
    if (checkbox && checked(checkbox) !== null) return checkbox;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}
export async function openSaveChooser(id: string, list = 'WL'): Promise<HTMLElement | null> {
  if (watchId() !== id) return null;
  const existing = playlistCheckbox(list);
  if (existing) return checked(existing) !== null ? existing : waitForPlaylist(id, list);
  let control = saveControls()[0];
  if (!control) {
    // Save may be in the native overflow menu, as on narrow layouts.
    const overflow = document.querySelector<HTMLButtonElement>(
      'ytd-watch-metadata ytd-menu-renderer yt-icon-button#button button, ytd-watch-metadata button[aria-label="More actions"]'
    );
    if (!overflow) return null;
    overflow.click();
    for (let attempt = 0; attempt < 20 && watchId() === id; attempt++) {
      control = saveControls()[0];
      if (control) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  if (!control || watchId() !== id) return null;
  // Synthetic native clicks are deliberately not intercepted by enhanced Save.
  control.click();
  return waitForPlaylist(id, list);
}
export function closeSaveChooser(list = 'WL'): void {
  const checkbox = playlistCheckbox(list);
  const dialog = checkbox?.closest('ytd-add-to-playlist-renderer, tp-yt-paper-dialog, ytd-popup-container, yt-playlist-dialog-view-model, yt-panel-container-view-model');
  const done = [...(dialog?.querySelectorAll<HTMLElement>('button') || [])].find(button => /^(done|concluído|concluido|concluir|feito)$/i.test((button.getAttribute('aria-label') || button.textContent || '').trim()));
  done?.click();
  const close = dialog?.querySelector<HTMLElement>('button[aria-label="Close"], button[aria-label="Fechar"], #close-button button');
  close?.click();
}

