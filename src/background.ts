chrome.runtime.onInstalled.addListener(() => { console.info('YTWash installed'); });
chrome.action.onClicked.addListener(() => { void chrome.runtime.openOptionsPage(); });

const reminderPrefix = 'ytwash:reminder:';
type Reminder = { id: string; title: string; when: number };
async function restoreReminders(): Promise<void> {
  const data = await chrome.storage.local.get(null);
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith(reminderPrefix) && value && Number.isFinite(value.when)) {
      await chrome.alarms.create(key, { when: Math.max(Date.now() + 1000, value.when) });
    }
  }
}
chrome.runtime.onStartup.addListener(() => { void restoreReminders(); });
chrome.runtime.onInstalled.addListener(() => { void restoreReminders(); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'ytwash:remind' || !sender.url?.startsWith('https://www.youtube.com/') || !/^[\w-]{11}$/.test(message.id)) return;
  void (async () => {
    const settings = await chrome.storage.local.get('ytwash:reminder-timing');
    const now = new Date();
    let when: number;
    if (settings['ytwash:reminder-timing'] === 'tomorrow') {
      now.setDate(now.getDate() + 1); now.setHours(18, 0, 0, 0); when = now.getTime();
    } else if (settings['ytwash:reminder-timing'] === 'week') {
      now.setDate(now.getDate() + 7); when = now.getTime();
    } else {
      const end = new Date(now); end.setHours(23, 59, 59, 999);
      when = Math.min(now.getTime() + 3 * 60 * 60 * 1000, end.getTime());
    }
    const reminder: Reminder = { id: message.id, title: String(message.title || 'YouTube video').slice(0, 200), when };
    const key = reminderPrefix + reminder.id;
    await chrome.storage.local.set({ [key]: reminder });
    await chrome.alarms.create(key, { when });
    respond({ ok: true });
  })().catch(() => respond({ ok: false }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (!alarm.name.startsWith(reminderPrefix)) return;
  void (async () => {
    const data = await chrome.storage.local.get(alarm.name);
    const reminder = data[alarm.name] as Reminder | undefined;
    if (!reminder) return;
    // Repeated clicks replace an earlier alarm; never deliver the old schedule.
    if (reminder.when > Date.now() + 1000) return;
    await chrome.notifications.create(alarm.name, { type: 'basic', iconUrl: 'icons/icon-128.png', title: 'YTWash: time to watch', message: reminder.title });
    await chrome.storage.local.remove(alarm.name);
  })().catch(console.warn);
});
chrome.notifications.onClicked.addListener(id => {
  if (!id.startsWith(reminderPrefix)) return;
  const video = id.slice(reminderPrefix.length);
  if (!/^[\w-]{11}$/.test(video)) return;
  void chrome.tabs.create({ url: 'https://www.youtube.com/watch?v=' + video });
  void chrome.notifications.clear(id);
});
