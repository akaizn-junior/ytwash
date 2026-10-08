import './cleanup';
import './timestamps';

/**
 * Enhance the existing Watch Later list in place. No duplicate cards, thumbnails,
 * standalone panel, or custom playlist rendering.
 */
const VIDEO_SELECTOR = 'ytd-playlist-video-renderer';
const GROUP_CLASS = 'ytwash-native-group';
type Entry = { element: HTMLElement; id: string; creator: string; key: string; index: number };
const originalOrder = new Map<HTMLElement, number>();
let nextIndex = 0;
let observer: MutationObserver;
let scheduled: number | undefined;
let rendering = false;
let lastPage = '';

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
  observer?.disconnect();
  try {
    document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR).forEach(el => { el.hidden = false; el.style.removeProperty('display'); });
    for (const box of document.querySelectorAll('.' + GROUP_CLASS)) box.replaceWith(...Array.from(box.querySelectorAll(VIDEO_SELECTOR)));
    const entries = [...originalOrder.entries()].filter(([el]) => el.isConnected).sort((a,b)=>a[1]-b[1]);
    const byParent = new Map<HTMLElement, HTMLElement[]>();
    for (const [el] of entries) {
      if (!el.parentElement) continue;
      const list = byParent.get(el.parentElement) || [];
      list.push(el);byParent.set(el.parentElement,list);
    }
    for (const [parent, list] of byParent) for (const el of list) parent.appendChild(el);
  } finally { rendering = false; observer?.observe(document.documentElement,{subtree:true,childList:true}); }
}
function reset(): void {
  restore();
  originalOrder.clear();
  nextIndex = 0;
}
function makeGroup(creator: string, key: string, entries: Entry[]): HTMLElement {
  const box = document.createElement('div');
  box.className = GROUP_CLASS;
  box.dataset.creator = key;
  box.setAttribute('aria-label', creator + ' · ' + entries.length + ' videos');
  box.style.cssText = 'box-sizing:border-box;width:100%;margin:4px 0 10px;padding:4px 6px;border:0;background:transparent';
  return box;
}
function render(): void {
  if (!onWatchLater()) { if (originalOrder.size) reset(); return; }
  if (rendering) return;
  const nodes = [...document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR)];
  const entries = nodes.map(entryFor).filter((e):e is Entry=>e!==null).sort((a,b)=>a.index-b.index);
  const firstParent = entries[0]?.element.parentElement;
  const parent = firstParent?.closest<HTMLElement>('.' + GROUP_CLASS)?.parentElement || firstParent;
  if (!parent) return;
  rendering = true;
  observer?.disconnect();
  try {
    document.querySelectorAll('.' + GROUP_CLASS).forEach(box => box.replaceWith(...Array.from(box.querySelectorAll(VIDEO_SELECTOR))));
    nodes.forEach(el=>{el.hidden=false;el.style.removeProperty('display');});
    const groups = new Map<string,Entry[]>();
    for (const entry of entries) {
      const list=groups.get(entry.key)||[];
      list.push(entry);groups.set(entry.key,list);
    }
    const multiple = [...groups.entries()].filter(([,list])=>list.length>=2);
    const grouped = new Set(multiple.flatMap(([,list])=>list.map(e=>e.element)));
    for (const [key,list] of multiple.sort((a,b)=>a[1][0].index-b[1][0].index)) {
      const box = makeGroup(list[0].creator,key,list);
      parent.appendChild(box);
      for (const entry of list) box.appendChild(entry.element);
    }
    // A creator seen exactly once remains a normal YouTube playlist row.
    for (const entry of entries) if (!grouped.has(entry.element)) parent.appendChild(entry.element);
  } finally { rendering = false; observer?.observe(document.documentElement,{subtree:true,childList:true}); }
}
function schedule(): void {
  if (scheduled !== undefined) clearTimeout(scheduled);
  scheduled=window.setTimeout(()=>{scheduled=undefined;render();},300);
}
observer=new MutationObserver(mutations=>{
  if(rendering)return;
  if(!onWatchLater())return;
  if(mutations.every(m=>(m.target as Element).closest?.('.'+GROUP_CLASS)))return;
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
