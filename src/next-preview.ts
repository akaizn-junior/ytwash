/** Update the native Next tooltip without replacing YouTube's player controls. */
let nextId: string | null = null;
let queueActive = false;
let hoveringNext = false;
const originals = new Map<HTMLElement, Map<string, { original: string | null; applied: string }>>();
const styles = new Map<HTMLElement, Map<string, { original: string; priority: string; applied: string }>>();
function property(node: HTMLElement, name: string, value: string): void {
  let values = styles.get(node);
  if (!values) { values = new Map(); styles.set(node, values); }
  const previous = values.get(name), current = node.style.getPropertyValue(name);
  if (!previous || current !== previous.applied) values.set(name, {
    original: current, priority: node.style.getPropertyPriority(name), applied: value,
  }); else previous.applied = value;
  if (current !== value || node.style.getPropertyPriority(name) !== 'important') node.style.setProperty(name, value, 'important');
}
function attribute(node: HTMLElement, name: string, value: string): void {
  let values = originals.get(node);
  if (!values) { values = new Map(); originals.set(node, values); }
  const previous = values.get(name);
  const current = node.getAttribute(name);
  if (!previous || current !== previous.applied) values.set(name, { original: current, applied: value });
  else previous.applied = value;
  if (current !== value) node.setAttribute(name, value);
}
function restore(): void {
  for (const [node, values] of styles) for (const [name, value] of values) {
    if (node.style.getPropertyValue(name) !== value.applied) continue;
    if (value.original) node.style.setProperty(name, value.original, value.priority); else node.style.removeProperty(name);
  }
  styles.clear();
  for (const [node, values] of originals) for (const [name, value] of values) {
    if (node.getAttribute(name) !== value.applied) continue;
    if (value.original === null) node.removeAttribute(name); else node.setAttribute(name, value.original);
  }
  originals.clear();
  document.querySelectorAll('.ytwash-next-lightning').forEach(node => node.remove());
}
function reconcile(): void {
  const tooltip = document.querySelector<HTMLElement>('.ytp-tooltip.ytp-next-button-tooltip') ||
    (hoveringNext ? document.querySelector<HTMLElement>('.ytp-tooltip') : null);
  if (!queueActive || !tooltip) { restore(); return; }
  // Do not advertise YouTube's native next video at the end of our queue.
  if (!nextId) { property(tooltip, 'visibility', 'hidden'); return; }
  const thumbnail = 'https://i.ytimg.com/vi/' + nextId + '/hqdefault.jpg';
  const background = tooltip.querySelector<HTMLElement>('.ytp-tooltip-bg');
  if (background) property(background, 'background-image', 'url("' + thumbnail + '")');
  for (const image of tooltip.querySelectorAll<HTMLImageElement>('img')) {
    attribute(image, 'src', thumbnail);
    attribute(image, 'srcset', '');
    attribute(image, 'alt', 'Next video in YTWash creator order');
  }
  const shortcut = tooltip.querySelector('.ytp-tooltip-keyboard-shortcut');
  if (shortcut && !shortcut.parentElement?.querySelector('.ytwash-next-lightning')) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.classList.add('ytwash-next-lightning'); icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', 'YTWash creator order');
    icon.style.cssText = 'width:16px;height:16px;fill:#ff0033;vertical-align:middle;margin-left:6px;display:inline-block';
    const path = document.createElementNS(icon.namespaceURI, 'path');
    path.setAttribute('d', 'M13 2 4 14h7l-1 8 10-13h-7l1-7z'); icon.append(path);
    shortcut.after(icon);
  }
}
export function setNextPreview(id: string | null, active: boolean): void {
  if (nextId !== id || queueActive !== active) restore();
  nextId = id; queueActive = active; reconcile();
}
document.addEventListener('mouseover', event => {
  const next = event.target instanceof Element && !!event.target.closest('.ytp-next-button');
  if (hoveringNext !== next) { hoveringNext = next; reconcile(); }
}, true);
document.addEventListener('focusin', event => {
  hoveringNext = event.target instanceof Element && !!event.target.closest('.ytp-next-button'); reconcile();
}, true);
new MutationObserver(reconcile).observe(document.documentElement, {
  subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'src', 'srcset'],
});
