const ENABLED = 'ytwash:reminders-enabled';
const INTERVAL = 'ytwash:reminder-interval-days';
const ALARM = 'ytwash:watch-later-reminder';
const PREFIX = 'ytwash:later:';
const DONE = 'ytwash:watched:';
const NOTICE = 'ytwash:watch-later';
let work = Promise.resolve();
async function schedule(): Promise<void> {
  const values = await chrome.storage.local.get([ENABLED, INTERVAL]);
  if (values[ENABLED] !== true) {
    await chrome.alarms.clear(ALARM);
    await chrome.notifications.clear(NOTICE);
    return;
  }
  const value = values[INTERVAL];
  const days = typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 365 ? value : 7;
  const minutes = days * 24 * 60;
  const existing = await chrome.alarms.get(ALARM);
  if (existing?.periodInMinutes !== minutes) {
    await chrome.alarms.create(ALARM, { delayInMinutes: minutes, periodInMinutes: minutes });
  }
}
async function remind(): Promise<void> {
  const values = await chrome.storage.local.get(null);
  if (values[ENABLED] !== true) return;
  const candidates = new Map<string, string>();
  const indexed = values['ytwash:playlist:WL']?.entries;
  if (Array.isArray(indexed)) for (const entry of indexed) {
    if (entry && typeof entry.id === 'string' && /^[\w-]{11}$/.test(entry.id)) {
      candidates.set(entry.id, typeof entry.creator === 'string' ? 'A video by ' + entry.creator : 'A saved video');
    }
  }
  for (const [key, entry] of Object.entries(values)) {
    const id = key.slice(PREFIX.length);
    if (key.startsWith(PREFIX) && /^[\w-]{11}$/.test(id) && entry && typeof entry.title === 'string') candidates.set(id, entry.title);
  }
  const ids = [...candidates.keys()].filter(id => values[DONE + id] !== true);
  if (!ids.length) { await chrome.notifications.clear(NOTICE); return; }
  const id = ids[(ids.indexOf(values['ytwash:last-reminded']) + 1) % ids.length];
  await chrome.notifications.create(NOTICE, {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'Your Watch Later reminder',
    message: (candidates.get(id) || 'A saved video').slice(0, 200) + '\nClick to watch. Change the interval in YTWash Options.',
  });
  await chrome.storage.local.set({ 'ytwash:last-reminded': id, 'ytwash:reminder-video': id });
}
function enqueue(task: () => Promise<void>): void {
  work = work.then(task).catch(() => console.warn('YTWash reminder could not be updated.'));
}
chrome.runtime.onInstalled.addListener(() => enqueue(schedule));
chrome.runtime.onStartup.addListener(() => enqueue(schedule));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[ENABLED] || changes[INTERVAL])) enqueue(schedule);
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) enqueue(remind); });
chrome.notifications.onClicked.addListener(id => {
  if (id !== NOTICE) return;
  enqueue(async () => {
    const values = await chrome.storage.local.get('ytwash:reminder-video');
    const video = values['ytwash:reminder-video'];
    if (typeof video === 'string' && /^[\w-]{11}$/.test(video)) await chrome.tabs.create({ url: 'https://www.youtube.com/watch?v=' + video });
    await chrome.notifications.clear(NOTICE);
  });
});
// Preserve existing schedules across service worker restarts; recreate missing alarms.
enqueue(schedule);
