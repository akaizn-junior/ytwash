import { startCreatorPlayback } from './playback';
import './cleanup';
import './timestamps';

/**
 * Enhance the existing Watch Later list in place. No duplicate cards, thumbnails,
 * standalone panel, or custom playlist rendering.
 */
const VIDEO_SELECTOR = 'ytd-playlist-video-renderer';
const GROUP_CLASS = 'ytwash-native-group';
const CONTROL_ID = 'ytwash-native-controls';
type Entry = { element: HTMLElement; id: string; creator: string; key: string; index: number };
const originalOrder = new Map<HTMLElement, number>();
let nextIndex = 0;
let enabled = true;
let observer: MutationObserver;
let scheduled: number | undefined;
let rendering = false;
let lastPage = '';
const collapsed = new Set<string>();

function onWatchLater(): boolean {
  return location.pathname === '/playlist' && new URLSearchParams(location.search).get('list') === 'WL';
}
function entryFor(el: HTMLElement): Entry | null {
  const title = el.querySelector<HTMLAnchorElement>('a#video-title');
  if (!title) return null;
  const id = new URL(title.href, location.origin).searchParams.get('v');
  if (!id) return null;
  const channel = el.querySelector<HTMLAnchorElement>('ytd-channel-name a[href], #channel-name a[href], a[href^="/channel/"], a[href^="/@"]');
  const creator = channel?.textContent?.trim() || el.querySelector('#channel-name')?.textContent?.trim() || '';
  if (!creator) return null;
  const path = channel?.getAttribute('href')?.split('?')[0] || '';
  const key = path.startsWith('/channel/') ? path : path.startsWith('/@') ? path.toLowerCase() : 'name:' + creator.toLowerCase();
  if (!originalOrder.has(el)) originalOrder.set(el, nextIndex++);
  return { element: el, id, creator, key, index: originalOrder.get(el)! };
}
function restore(): void {
  rendering = true;
  try {
    document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR).forEach(el => { el.hidden = false; el.style.removeProperty('display'); });
    for (const header of document.querySelectorAll('.' + GROUP_CLASS)) header.remove();
    document.getElementById(CONTROL_ID)?.remove();
    const entries = [...originalOrder.entries()].filter(([el]) => el.isConnected).sort((a,b)=>a[1]-b[1]);
    const byParent = new Map<HTMLElement, HTMLElement[]>();
    for (const [el] of entries) {
      if (!el.parentElement) continue;
      const list = byParent.get(el.parentElement) || [];
      list.push(el);byParent.set(el.parentElement,list);
    }
    for (const [parent, list] of byParent) for (const el of list) parent.appendChild(el);
  } finally { rendering = false; }
}
function reset(): void {
  restore();
  originalOrder.clear();
  nextIndex = 0;
  collapsed.clear();
}
function makeHeader(creator: string, key: string, entries: Entry[]): HTMLElement {
  const header = document.createElement('div');
  header.className = GROUP_CLASS;
  header.dataset.creator = key;
  header.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 8px;border-bottom:1px solid var(--yt-spec-10-percent-layer);color:var(--yt-spec-text-primary);font:500 1.4rem Roboto,Arial,sans-serif';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  const isCollapsed = collapsed.has(key);
  toggle.textContent = (isCollapsed ? '▸ ' : '▾ ') + creator + ' · ' + entries.length + ' videos';
  toggle.setAttribute('aria-expanded', String(!isCollapsed));
  toggle.style.cssText = 'border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:4px;text-align:left';
  toggle.addEventListener('click', () => { if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key); render(); });
  const play = document.createElement('button');
  play.type = 'button';
  play.textContent = 'Play creator';
  play.setAttribute('aria-label', 'Play all indexed Watch Later videos from ' + creator);
  play.style.cssText = 'border:0;border-radius:18px;background:var(--yt-spec-badge-chip-background);color:var(--yt-spec-text-primary);font:500 1.2rem Roboto,Arial,sans-serif;cursor:pointer;padding:8px 12px';
  play.addEventListener('click', () => { if (!startCreatorPlayback(creator, entries.map(e=>e.id))) window.alert('YTWash could not start playback.'); });
  header.append(toggle, play);
  return header;
}
function render(): void {
  if (!onWatchLater()) { if (originalOrder.size) reset(); return; }
  if (rendering) return;
  const nodes = [...document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR)];
  const entries = nodes.map(entryFor).filter((e):e is Entry=>e!==null).sort((a,b)=>a.index-b.index);
  const parent = entries[0]?.element.parentElement;
  if (!parent) return;
  rendering = true;
  try {
    document.querySelectorAll('.' + GROUP_CLASS).forEach(el=>el.remove());
    nodes.forEach(el=>{el.hidden=false;el.style.removeProperty('display');});
    document.getElementById(CONTROL_ID)?.remove();
    const groups = new Map<string,Entry[]>();
    for (const entry of entries) {
      const list=groups.get(entry.key)||[];
      list.push(entry);groups.set(entry.key,list);
    }
    const multiple = [...groups.entries()].filter(([,list])=>list.length>=2);
    const controls = document.createElement('div');
    controls.id = CONTROL_ID;
    controls.style.cssText='padding:8px 4px 16px;color:var(--yt-spec-text-primary);font:1.3rem Roboto,Arial,sans-serif';
    const label = document.createElement('label');
    label.style.cssText='display:inline-flex;gap:10px;align-items:center;cursor:pointer';
    const checkbox=document.createElement('input');
    checkbox.type='checkbox';checkbox.checked=enabled;checkbox.setAttribute('aria-label','Group creators with two or more videos');
    checkbox.addEventListener('change',()=>{enabled=checkbox.checked;render();});
    label.append(checkbox,document.createTextNode('Group by creator (' + multiple.length + ')'));
    controls.append(label);
    parent.insertBefore(controls,entries[0].element);
    if (!enabled || !multiple.length) {
      for(const entry of entries) parent.appendChild(entry.element);
      return;
    }
    const grouped = new Set(multiple.flatMap(([,list])=>list.map(e=>e.element)));
    for (const [key,list] of multiple.sort((a,b)=>a[1][0].index-b[1][0].index)) {
      parent.appendChild(makeHeader(list[0].creator,key,list));
      for (const entry of list) {
        parent.appendChild(entry.element);
        if (collapsed.has(key)) entry.element.style.display='none';
      }
    }
    // A creator seen exactly once remains a normal YouTube playlist row.
    for (const entry of entries) if (!grouped.has(entry.element)) parent.appendChild(entry.element);
  } finally { rendering = false; }
}
function schedule(): void {
  if (scheduled !== undefined) clearTimeout(scheduled);
  scheduled=window.setTimeout(()=>{scheduled=undefined;render();},300);
}
observer=new MutationObserver(mutations=>{
  if(rendering)return;
  if(!onWatchLater())return;
  // Ignore the DOM changes made by our controls and headings.
  if(mutations.every(m=>(m.target as Element).closest?.('#'+CONTROL_ID+',.'+GROUP_CLASS)))return;
  schedule();
});
observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('yt-navigate-finish',()=>{
  const page=location.pathname+location.search;
  if(page!==lastPage){reset();lastPage=page;}
  schedule();
});
lastPage=location.pathname+location.search;
schedule();
