/** One alarm per reminder. No recurring schedules or separate saved-video library. */
const PREFIX = 'ytwash:reminder:';
const NOTICE = 'ytwash:reminder-notice:';
type Reminder = { id: string; title: string; dueAt: number };
let work = Promise.resolve();
function validId(id: unknown): id is string { return typeof id === 'string' && /^[\w-]{11}$/.test(id); }
function valid(value: unknown): value is Reminder {
  const r = value as Reminder | undefined;
  return !!r && validId(r.id) && typeof r.title === 'string' && Number.isFinite(r.dueAt);
}
function dueAt(preset: unknown, custom: unknown): number | null {
  const now = new Date(), date = new Date(now);
  if (preset === 'later-today') {
    const evening = new Date(now); evening.setHours(18, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return Math.min(end.getTime(), Math.max(evening.getTime(), now.getTime() + 60 * 60 * 1000));
  }
  if (preset === 'three-days' || preset === 'week') {
    date.setDate(date.getDate() + (preset === 'three-days' ? 3 : 7)); return date.getTime();
  }
  return preset === 'custom' && typeof custom === 'number' && Number.isFinite(custom) && custom > now.getTime() ? custom : null;
}
async function restore(): Promise<void> {
  // Retire the old repeating alarm, even when it was enabled before updating.
  await chrome.alarms.clear('ytwash:watch-later-reminder');
  await chrome.notifications.clear('ytwash:watch-later');
  const values = await chrome.storage.local.get(null);
  const legacy = Object.keys(values).filter(key => key.startsWith('ytwash:later:'));
  legacy.push('ytwash:reminders-enabled', 'ytwash:reminder-interval-days', 'ytwash:last-reminded', 'ytwash:reminder-video');
  await chrome.storage.local.remove(legacy);
  for (const [key, value] of Object.entries(values)) if (key.startsWith(PREFIX) && valid(value)) {
    const alarm = await chrome.alarms.get(key);
    if (!alarm) await chrome.alarms.create(key, { when: Math.max(value.dueAt, Date.now() + 1000) });
  }
}
async function deliver(name: string): Promise<void> {
  const values = await chrome.storage.local.get([name, 'ytwash:watched:' + name.slice(PREFIX.length)]);
  const reminder = values[name];
  if (!valid(reminder)) return;
  if (values['ytwash:watched:' + reminder.id] === true) { await chrome.storage.local.remove(name); return; }
  const options: chrome.notifications.NotificationOptions<true> = {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'Time to watch', message: reminder.title,
  };
  if (chrome.notifications.onButtonClicked) options.buttons = [{ title: 'Watch now' }, { title: 'Remind me again' }];
  await chrome.storage.local.set({ [NOTICE + reminder.id]: reminder });
  await chrome.notifications.create(NOTICE + reminder.id, options);
  await chrome.storage.local.remove(name);
}
async function action(notification: string, again: boolean): Promise<void> {
  const id = notification.slice(NOTICE.length);
  if (!notification.startsWith(NOTICE) || !validId(id)) return;
  await chrome.tabs.create({ url: again ? chrome.runtime.getURL('options.html') + '?remind=' + id : 'https://www.youtube.com/watch?v=' + id });
  await chrome.notifications.clear(notification);
  if (!again) await chrome.storage.local.remove(notification);
}
function enqueue(task: () => Promise<void>): void {
  work = work.then(task).catch(() => console.warn('YTWash could not update a reminder.'));
}
chrome.runtime.onInstalled.addListener(() => enqueue(restore));
chrome.runtime.onStartup.addListener(() => enqueue(restore));
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name.startsWith(PREFIX)) enqueue(() => deliver(alarm.name)); });
chrome.notifications.onClicked.addListener(id => enqueue(() => action(id, false)));
chrome.notifications.onButtonClicked?.addListener((id, button) => enqueue(() => action(id, button === 1)));
chrome.notifications.onClosed.addListener((id, byUser) => {
  if (byUser && id.startsWith(NOTICE)) enqueue(async () => { await chrome.storage.local.remove(id); });
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const [key, change] of Object.entries(changes)) {
    if (key.startsWith(PREFIX) && change.newValue === undefined) enqueue(async () => { await chrome.alarms.clear(key); });
    if (key.startsWith('ytwash:watched:') && change.newValue === true) {
      const id = key.slice('ytwash:watched:'.length);
      enqueue(async () => { await chrome.storage.local.remove(PREFIX + id); await chrome.notifications.clear(NOTICE + id); });
    }
  }
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'ytwash:open-custom-reminder') {
    enqueue(async () => {
      const id = message.id;
      if (!validId(id)) { reply({ error: 'Choose a Watch Later video.' }); return; }
      const values = await chrome.storage.local.get('ytwash:playlist:WL');
      const entry = values['ytwash:playlist:WL']?.entries?.find((item: { id?: string }) => item?.id === id);
      const onWatchLater = sender.tab && sender.url && new URL(sender.url).hostname === 'www.youtube.com' && new URL(sender.url).searchParams.get('list') === 'WL';
      if (!entry && !onWatchLater) { reply({ error: 'Add this video to Watch Later first.' }); return; }
      await chrome.storage.local.set({ ['ytwash:reminder-draft:' + id]: { id, title: (entry?.title || message.title || 'A Watch Later video').slice(0, 200) } });
      await chrome.tabs.create({ url: chrome.runtime.getURL('options.html') + '?remind=' + id + '&custom=1' });
      reply({ opened: true });
    });
    return true;
  }
  if (message?.type !== 'ytwash:schedule-reminder') return;
  enqueue(async () => {
    const id = message.id, when = dueAt(message.preset, message.dueAt);
    if (!validId(id) || when === null || when <= Date.now()) { reply({ error: 'Choose a future date and time.' }); return; }
    const values = await chrome.storage.local.get(['ytwash:playlist:WL', NOTICE + id, 'ytwash:reminder-draft:' + id]);
    const entry = values['ytwash:playlist:WL']?.entries?.find((item: { id?: string }) => item?.id === id);
    const notice = values[NOTICE + id], draft = values['ytwash:reminder-draft:' + id];
    const onWatchLater = sender.tab && sender.url && new URL(sender.url).hostname === 'www.youtube.com' && new URL(sender.url).searchParams.get('list') === 'WL';
    if (!entry && !valid(notice) && !(draft?.id === id && typeof draft.title === 'string') && !onWatchLater) { reply({ error: 'Add this video to Watch Later first.' }); return; }
    const title = (typeof message.title === 'string' && onWatchLater ? message.title : entry?.title || draft?.title || (valid(notice) ? notice.title : null)) || 'A Watch Later video';
    const reminder: Reminder = { id, title: title.slice(0, 200), dueAt: when };
    try {
      await chrome.storage.local.set({ [PREFIX + id]: reminder, ['ytwash:watched:' + id]: false });
      await chrome.alarms.create(PREFIX + id, { when });
      await chrome.storage.local.remove(['ytwash:reminder-draft:' + id, NOTICE + id]);
      await chrome.notifications.clear(NOTICE + id);
      reply({ dueAt: when });
    } catch { await chrome.storage.local.remove(PREFIX + id); reply({ error: 'Could not set your reminder. Try again.' }); }
  });
  return true;
});
enqueue(restore);
