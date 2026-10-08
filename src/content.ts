const WL = 'WL';
const SELECTOR = 'ytd-playlist-video-renderer';
const ATTR = 'data-ytwash-hidden';
let timer: number | undefined;
function isWatchLater(): boolean { return location.pathname === '/playlist' && new URLSearchParams(location.search).get('list') === WL; }
function groupVideos(): void {
  document.querySelector('#ytwash-groups')?.remove();
  document.querySelectorAll<HTMLElement>(SELECTOR).forEach(el => { el.style.removeProperty('display'); el.removeAttribute(ATTR); });
  if (!isWatchLater()) return;
  const entries = [...document.querySelectorAll<HTMLElement>(SELECTOR)];
  if (!entries.length) return;
  const groups = new Map<string, HTMLElement[]>();
  for (const el of entries) {
    const channel = el.querySelector<HTMLAnchorElement>('ytd-channel-name a, #channel-name a');
    const key = channel?.getAttribute('href') || channel?.textContent?.trim() || 'Unknown creator';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(el);
  }
  const container = document.createElement('section'); container.id = 'ytwash-groups';
  container.style.cssText = 'padding:16px; margin:12px 0; border:1px solid var(--yt-spec-10-percent-layer); border-radius:12px';
  const title = document.createElement('h2'); title.textContent = 'YTWash · Group by creator'; title.style.cssText='font-size:18px;margin-bottom:12px'; container.append(title);
  for (const [key, videos] of [...groups].sort((a,b)=>b[1].length-a[1].length)) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = (videos[0].querySelector('ytd-channel-name a, #channel-name a')?.textContent?.trim() || key) + ' (' + videos.length + ')';
    summary.style.cssText='cursor:pointer;padding:8px;font-size:14px'; details.append(summary);
    for (const video of videos) {
      const link = video.querySelector<HTMLAnchorElement>('a#video-title');
      if (!link) continue;
      const row = document.createElement('div'); row.style.cssText='padding:8px 16px';
      const a = document.createElement('a'); a.href = link.href; a.textContent = link.textContent?.trim() || 'Video'; a.style.cssText='color:var(--yt-spec-text-primary);font-size:14px'; row.append(a); details.append(row);
    }
    container.append(details);
  }
  const first = entries[0]; first.parentElement?.insertBefore(container, first);
  // Keep YouTube's native list and actions intact. The grouped links are an additional view.
}
function schedule(): void { clearTimeout(timer); timer = window.setTimeout(groupVideos, 700); }
new MutationObserver(schedule).observe(document.documentElement, {childList:true,subtree:true});
window.addEventListener('yt-navigate-finish', schedule); schedule();
