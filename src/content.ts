import { startCreatorPlayback } from './playback';
import './cleanup';
import './timestamps';

/** YTWash creator grouping. A virtual index: native playlist items are never moved or modified. */
const VIDEO_SELECTOR = 'ytd-playlist-video-renderer';
const ROOT_ID = 'ytwash-creator-groups';
const state = new Map<string, VideoEntry>();
type VideoEntry = { id: string; title: string; href: string; creator: string; channelKey: string; thumbnail: string; order: number };
type Sort = 'count' | 'name' | 'recent';
let sort: Sort = 'count';
let collapsed = false;
let query = '';
let queued: number | undefined;
let scanRequested = false;
let lastPage = '';
let observer: MutationObserver;

function watchLater(): boolean {
  return location.pathname === '/playlist' && new URLSearchParams(location.search).get('list') === 'WL';
}
function videoId(url: string): string | null {
  try { return new URL(url, location.origin).searchParams.get('v'); } catch { return null; }
}
function readEntry(el: HTMLElement, order: number): VideoEntry | null {
  const link = el.querySelector<HTMLAnchorElement>('a#video-title');
  if (!link) return null;
  const id = videoId(link.href);
  if (!id) return null;
  const channel = el.querySelector<HTMLAnchorElement>('ytd-channel-name a[href], #channel-name a[href], a[href^="/channel/"], a[href^="/@"]');
  const creator = channel?.textContent?.trim() || el.querySelector('#channel-name')?.textContent?.trim() || 'Unknown creator';
  const channelPath = channel?.getAttribute('href')?.split('?')[0];
  // Stable channel IDs are preferred; handles are a fallback when YouTube does not expose IDs.
  const channelKey = channelPath?.startsWith('/channel/') ? channelPath : channelPath?.startsWith('/@') ? channelPath.toLowerCase() : 'name:' + creator.toLowerCase();
  const thumbnail = el.querySelector<HTMLImageElement>('ytd-thumbnail img')?.getAttribute('src') || '';
  return { id, title: link.textContent?.trim() || 'Untitled video', href: link.href, creator, channelKey, thumbnail, order };
}
function reset(): void {
  state.clear();
  document.getElementById(ROOT_ID)?.remove();
  scanRequested = false;
}
function indexRendered(): void {
  if (!watchLater()) { reset(); return; }
  const nodes = document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR);
  nodes.forEach((el, i) => {
    const entry = readEntry(el, i);
    if (entry) {
      const previous = state.get(entry.id);
      // Preserve first observed order when the playlist expands lazily.
      state.set(entry.id, { ...entry, order: previous?.order ?? state.size });
    }
  });
  render();
}
function element<K extends keyof HTMLElementTagNameMap>(name: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function render(): void {
  if (!watchLater()) return;
  const first = document.querySelector<HTMLElement>(VIDEO_SELECTOR);
  if (!first?.parentElement) return;
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = element('section'); root.id = ROOT_ID;
    root.setAttribute('aria-label', 'YTWash creator groups');
    const style = element('style'); style.textContent = `
#ytwash-creator-groups{margin:12px 0 24px;padding:16px;border:1px solid var(--yt-spec-10-percent-layer,#555);border-radius:14px;color:var(--yt-spec-text-primary,#eee);font-family:Roboto,Arial,sans-serif}
#ytwash-creator-groups .yw-header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
#ytwash-creator-groups button,#ytwash-creator-groups select,#ytwash-creator-groups input{background:var(--yt-spec-badge-chip-background,#272727);color:inherit;border:1px solid var(--yt-spec-10-percent-layer,#555);border-radius:8px;padding:8px;font:inherit}
#ytwash-creator-groups button{cursor:pointer}#ytwash-creator-groups input{flex:1;min-width:130px}
#ytwash-creator-groups details{border-top:1px solid var(--yt-spec-10-percent-layer,#444);padding:10px 0}
#ytwash-creator-groups summary{cursor:pointer;font-weight:600;font-size:14px;padding:5px}
#ytwash-creator-groups a{color:inherit;text-decoration:none}
#ytwash-creator-groups a:hover{text-decoration:underline}
#ytwash-creator-groups .yw-item{display:flex;align-items:center;gap:12px;padding:8px 4px;font-size:13px}
#ytwash-creator-groups .yw-item img{width:96px;aspect-ratio:16/9;object-fit:cover;border-radius:7px}
#ytwash-creator-groups .yw-muted{opacity:.65;font-size:12px}
`;
    root.append(style);
    first.parentElement.insertBefore(root, first);
  }
  // Preserve expanded creators and focused search while refreshing results.
  const expanded = new Set([...root.querySelectorAll<HTMLDetailsElement>('details[open]')].map(x => x.dataset.creator));
  const focus = document.activeElement?.id === 'ytwash-search';
  const cursor = focus ? (document.activeElement as HTMLInputElement).selectionStart : null;
  root.querySelector('.yw-ui')?.remove();
  const ui = element('div','yw-ui');
  const header = element('div','yw-header');
  const title = element('strong',undefined,'YTWash · Group by creator');
  const counter = element('span','yw-muted',state.size + ' indexed videos');
  const toggle = element('button',undefined,collapsed ? 'Show groups' : 'Hide groups');
  toggle.type='button'; toggle.addEventListener('click',()=>{collapsed=!collapsed;render();});
  header.append(title,counter,toggle);
  ui.append(header);
  if (!collapsed) {
    const controls = element('div','yw-header');
    const search = element('input'); search.id='ytwash-search';search.placeholder='Search creators or videos';search.value=query;
    search.addEventListener('input',()=>{query=search.value;render();});
    const select = element('select');
    for (const [key,label] of [['count','Most videos first'],['name','Creator A–Z'],['recent','Recently indexed']] as const) {
      const opt=element('option',undefined,label);opt.value=key;select.append(opt);
    }
    select.value=sort;select.setAttribute('aria-label','Sort creators');
    select.addEventListener('change',()=>{sort=select.value as Sort;render();});
    const scan = element('button',undefined,scanRequested?'Scanning…':'Index more');
    scan.type='button';scan.disabled=scanRequested;scan.title='Scrolls the native playlist to load additional videos';
    scan.addEventListener('click',()=>void loadMore());
    controls.append(search,select,scan);ui.append(controls);
    const groups = new Map<string,VideoEntry[]>();
    for (const entry of state.values()) {
      const list=groups.get(entry.channelKey)||[];
      list.push(entry);groups.set(entry.channelKey,list);
    }
    const ordered=[...groups.entries()].sort((a,b)=>sort==='name'?a[1][0].creator.localeCompare(b[1][0].creator):sort==='recent'?Math.max(...b[1].map(v=>v.order))-Math.max(...a[1].map(v=>v.order)):b[1].length-a[1].length);
    let shown=0;
    for(const [key,items] of ordered){
      const visible=items.filter(v=>v.title.toLowerCase().includes(query.toLowerCase())||v.creator.toLowerCase().includes(query.toLowerCase()));
      if (!visible.length) continue;
      shown+=visible.length;
      const details=element('details');details.dataset.creator=key;if(expanded.has(key))details.open=true;
      const summary=element('summary',undefined,items[0].creator+' · '+items.length+' video'+(items.length===1?'':'s'));details.append(summary);
      const play=element('button',undefined,'Play this creator');play.type='button';play.setAttribute('aria-label','Play all indexed Watch Later videos from '+items[0].creator);play.addEventListener('click',()=>{const ids=items.sort((a,b)=>a.order-b.order).map(v=>v.id);if(!startCreatorPlayback(items[0].creator,ids))window.alert('YTWash could not start creator playback.');});details.append(play);
      for(const video of visible.sort((a,b)=>a.order-b.order)){
        const row=element('div','yw-item');
        const a=element('a');a.href=video.href;a.textContent=video.title;
        if(video.thumbnail){const img=element('img');img.src=video.thumbnail;img.alt='';img.loading='lazy';row.append(img);}
        row.append(a);details.append(row);
      }
      ui.append(details);
    }
    if(!shown)ui.append(element('p','yw-muted','No matching videos.'));
    ui.append(element('p','yw-muted','Groups are a view of indexed items. The original Watch Later playlist and its controls remain below. YouTube loads more items as you scroll.'));
  }
  root.append(ui);
  if(focus){const next=document.getElementById('ytwash-search') as HTMLInputElement|null;next?.focus();if(cursor!==null)next?.setSelectionRange(cursor,cursor);}
}
async function loadMore(): Promise<void> {
  if(scanRequested)return;
  scanRequested=true;render();
  // Scroll the native page progressively; no private API or automatic playlist mutations.
  let unchanged=0;
  let previous=state.size;
  for(let attempt=0;attempt<30&&unchanged<3&&watchLater();attempt++){
    document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR).item(document.querySelectorAll(VIDEO_SELECTOR).length-1)?.scrollIntoView({block:'end'});
    await new Promise<void>(resolve=>setTimeout(resolve,650));
    indexRendered();
    if(state.size===previous)unchanged++;else unchanged=0;
    previous=state.size;
  }
  scanRequested=false;render();
}
function schedule():void { if(queued!==undefined)clearTimeout(queued);queued=window.setTimeout(()=>{queued=undefined;indexRendered();},350); }
observer=new MutationObserver(mutations=>{
  if (!watchLater()) return;
  if (mutations.some(m=>!((m.target as Element).closest?.('#'+ROOT_ID) || (m.target as Element).id===ROOT_ID))) schedule();
});
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('yt-navigate-finish',()=>{
  const now=location.pathname+location.search;
  if(lastPage!==now){reset();lastPage=now;}
  schedule();
});
lastPage=location.pathname+location.search;
schedule();
