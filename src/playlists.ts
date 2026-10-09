/** Local indexes of visible native playlist rows, isolated by playlist ID. */
export type PlaylistEntry = { id: string; creator: string; key: string; title?: string };
export type PlaylistIndex = { entries: PlaylistEntry[]; order?: string[]; indexedAt: number };
export function creatorOrder<T extends PlaylistEntry>(entries: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) groups.set(entry.key, [...(groups.get(entry.key) || []), entry]);
  return [...groups.values()].filter(group => group.length > 1).flat()
    .concat([...groups.values()].filter(group => group.length === 1).flat());
}
const PREFIX = 'ytwash:playlist:';
const indexedSignatures = new Map<string, string>();
export function playlistId(): string | null {
  if (!['/playlist', '/watch'].includes(location.pathname)) return null;
  const id = new URLSearchParams(location.search).get('list');
  return id && /^[\w-]{1,200}$/.test(id) ? id : null;
}
export function indexPlaylist(id: string, entries: PlaylistEntry[]): void {
  const bounded = entries.slice(0, 5000).map(({ id, creator, key, title }) => ({ id, creator, key, ...(typeof title === 'string' ? { title: title.slice(0, 200) } : {}) }));
  const signature = JSON.stringify(bounded);
  if (indexedSignatures.get(id) === signature) return;
  indexedSignatures.set(id, signature);
  chrome.storage.local.set({ [PREFIX + id]: { entries: bounded, order: creatorOrder(bounded).map(entry => entry.id), indexedAt: Date.now() } }, () => {
    if (chrome.runtime.lastError) {
      indexedSignatures.delete(id);
      console.warn('YTWash playlist index could not be saved.');
    }
  });
}
export function readPlaylist(id: string): Promise<PlaylistIndex | null> {
  return new Promise(resolve => chrome.storage.local.get(PREFIX + id, values => {
    if (chrome.runtime.lastError) { resolve(null); return; }
    const value = values[PREFIX + id] as Partial<PlaylistIndex> | undefined;
    if (!value || !Array.isArray(value.entries) || value.entries.length > 5000 ||
        !Number.isFinite(value.indexedAt) || value.entries.some(entry => !entry ||
          typeof entry.id !== 'string' || !/^[\w-]{11}$/.test(entry.id) ||
          typeof entry.creator !== 'string' || typeof entry.key !== 'string')) { resolve(null); return; }
    resolve(value as PlaylistIndex);
  }));
}

