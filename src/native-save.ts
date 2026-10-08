/** Use only visible native YouTube controls. Never toggle unknown membership. */
export function watchId(): string | null {
  return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
}
const saveLabel = /^(save|guardar|salvar)(\s|$)/i;
export function saveControls(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(
    'ytd-watch-metadata button, ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, yt-list-item-view-model'
  )].filter(node => node.getClientRects().length > 0 && saveLabel.test(
    (node.getAttribute('aria-label') || node.querySelector('yt-formatted-string, .yt-list-item-view-model__title')?.textContent || node.textContent || '').trim()
  ));
}
export function watchLaterCheckbox(): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>(
    'ytd-playlist-add-to-option-renderer, ytd-add-to-playlist-renderer, tp-yt-paper-item'
  );
  for (const row of rows) {
    if (!row.getClientRects().length) continue;
    const label = (row.querySelector('#label, #title, .title')?.textContent || row.textContent || '').trim();
    if (!/^(watch later|ver mais tarde|assistir mais tarde)(\s|$)/i.test(label)) continue;
    const checkbox = row.querySelector<HTMLElement>('[role="checkbox"], tp-yt-paper-checkbox, input[type="checkbox"]');
    if (checkbox?.getClientRects().length) return checkbox;
  }
  return null;
}
export function checked(target: HTMLElement): boolean | null {
  if (target instanceof HTMLInputElement) return target.indeterminate ? null : target.checked;
  const state = target.getAttribute('aria-checked');
  if (state === 'true') return true;
  if (state === 'false') return false;
  if (target.hasAttribute('checked')) return true;
  return null;
}
export async function waitForWatchLater(id: string): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < 30 && watchId() === id; attempt++) {
    const checkbox = watchLaterCheckbox();
    if (checkbox) return checkbox;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}
export async function openSaveChooser(id: string): Promise<HTMLElement | null> {
  if (watchId() !== id) return null;
  const existing = watchLaterCheckbox();
  if (existing) return existing;
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
  return waitForWatchLater(id);
}
export function closeSaveChooser(): void {
  const checkbox = watchLaterCheckbox();
  const dialog = checkbox?.closest('ytd-add-to-playlist-renderer, tp-yt-paper-dialog, ytd-popup-container');
  const close = dialog?.querySelector<HTMLElement>('button[aria-label="Close"], button[aria-label="Fechar"], #close-button button');
  close?.click();
}
