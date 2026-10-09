import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
const source = stripTypeScriptTypes(readFileSync('src/reminders.ts', 'utf8'));
const FIRST = 'abcdefghijk', SECOND = 'lmnopqrstuv';
function harness(initial = {}) {
  const data = { ...initial }, alarms = new Map(), notices = [], tabs = [], events = {};
  const event = name => ({ addListener: handler => { events[name] = handler; } });
  const change = values => {
    const changes = {};
    for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: data[key], newValue: value }; if (value === undefined) delete data[key]; else data[key] = value; }
    events.change?.(changes, 'local');
  };
  const context = createContext({ console, URL, chrome: {
    storage: { local: {
      get: async keys => keys === null ? { ...data } : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])),
      set: async values => change(values),
      remove: async keys => change(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, undefined]))),
    }, onChanged: event('change') },
    runtime: { onInstalled: event('install'), onStartup: event('startup'), onMessage: event('message'), getURL: path => 'chrome-extension://test/' + path },
    alarms: { get: async name => alarms.get(name), create: async (name, details) => alarms.set(name, details), clear: async name => alarms.delete(name), onAlarm: event('alarm') },
    notifications: { create: async (id, options) => { notices.push({ id, ...options }); }, clear: async () => true,
      onClicked: event('click'), onButtonClicked: event('button'), onClosed: event('close') },
    tabs: { create: async options => tabs.push(options) },
  } });
  runInContext(source, context);
  const flush = async () => { for (let i = 0; i < 4; i++) await runInContext('work', context); };
  return { data, alarms, notices, tabs, events, change, flush,
    message: (message, sender = { url: 'chrome-extension://test/options.html' }) => new Promise(resolve => events.message(message, sender, resolve)),
    fire: async id => { alarms.delete('ytwash:reminder:' + id); events.alarm({ name: 'ytwash:reminder:' + id }); await flush(); },
  };
}
const entries = { 'ytwash:playlist:WL': { entries: [{ id: FIRST, title: 'First video', creator: 'Creator', key: 'a' }, { id: SECOND, title: 'Second video', creator: 'Creator', key: 'a' }] } };
test('one-time reminders fire once, with no repeating alarm', async () => {
  const h = harness(entries); await h.flush();
  const response = await h.message({ type: 'ytwash:schedule-reminder', id: FIRST, preset: 'three-days' }); await h.flush();
  assert.ok(response.dueAt > Date.now());
  assert.equal(h.alarms.get('ytwash:reminder:' + FIRST).when, response.dueAt);
  assert.equal(h.alarms.get('ytwash:reminder:' + FIRST).periodInMinutes, undefined);
  await h.fire(FIRST); assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].message, 'First video');
  assert.equal(h.data['ytwash:reminder:' + FIRST], undefined);
  assert.equal(h.alarms.size, 0);
  await h.fire(FIRST); assert.equal(h.notices.length, 1);
});
test('presets use local calendar dates and custom dates must be in the future', async () => {
  const h = harness(entries); await h.flush();
  const today = await h.message({ type: 'ytwash:schedule-reminder', id: FIRST, preset: 'later-today' }); await h.flush();
  assert.equal(new Date(today.dueAt).toDateString(), new Date().toDateString());
  const week = await h.message({ type: 'ytwash:schedule-reminder', id: FIRST, preset: 'week' }); await h.flush();
  const expected = new Date(); expected.setDate(expected.getDate() + 7);
  assert.equal(new Date(week.dueAt).toDateString(), expected.toDateString());
  const before = h.alarms.get('ytwash:reminder:' + FIRST).when;
  const invalid = await h.message({ type: 'ytwash:schedule-reminder', id: FIRST, preset: 'custom', dueAt: 0 }); await h.flush();
  assert.match(invalid.error, /future/); assert.equal(h.alarms.get('ytwash:reminder:' + FIRST).when, before);
  const date = Date.now() + 3600000;
  const custom = await h.message({ type: 'ytwash:schedule-reminder', id: FIRST, preset: 'custom', dueAt: date }); await h.flush();
  assert.equal(custom.dueAt, date);
});
test('startup restores missing one-time alarms and retires legacy periodic reminders', async () => {
  const time = Date.now() + 3600000;
  const h = harness({ ...entries, 'ytwash:reminders-enabled': true, 'ytwash:reminder-interval-days': 7,
    ['ytwash:later:' + FIRST]: { title: 'Old local save' }, ['ytwash:reminder:' + FIRST]: { id: FIRST, title: 'First video', dueAt: time } });
  h.alarms.set('ytwash:watch-later-reminder', { periodInMinutes: 10080 });
  await h.flush();
  assert.equal(h.alarms.has('ytwash:watch-later-reminder'), false);
  assert.equal(h.data['ytwash:later:' + FIRST], undefined);
  assert.equal(h.alarms.get('ytwash:reminder:' + FIRST).when, time);
  const alarm = h.alarms.get('ytwash:reminder:' + FIRST);
  h.events.startup(); await h.flush(); assert.equal(h.alarms.get('ytwash:reminder:' + FIRST), alarm);
});
test('watching or canceling a reminder clears its alarm', async () => {
  const h = harness(entries); await h.flush();
  await h.message({ type: 'ytwash:schedule-reminder', id: FIRST, preset: 'week' }); await h.flush();
  h.change({ ['ytwash:watched:' + FIRST]: true }); await h.flush();
  assert.equal(h.alarms.size, 0); await h.fire(FIRST); assert.equal(h.notices.length, 0);
  await h.message({ type: 'ytwash:schedule-reminder', id: SECOND, preset: 'week' }); await h.flush();
  h.change({ ['ytwash:reminder:' + SECOND]: undefined }); await h.flush();
  assert.equal(h.alarms.size, 0);
});
test('notification actions watch, reschedule explicitly, or dismiss without repeating', async () => {
  const h = harness(entries); await h.flush();
  await h.message({ type: 'ytwash:schedule-reminder', id: FIRST, preset: 'week' }); await h.flush(); await h.fire(FIRST);
  h.events.button('ytwash:reminder-notice:' + FIRST, 1); await h.flush();
  assert.equal(h.tabs[0].url, 'chrome-extension://test/options.html?remind=' + FIRST);
  assert.equal(h.alarms.size, 0);
  const response = await h.message({ type: 'ytwash:schedule-reminder', id: FIRST, preset: 'three-days' }); await h.flush(); assert.ok(response.dueAt);
  await h.fire(FIRST); h.events.click('ytwash:reminder-notice:' + FIRST); await h.flush();
  assert.equal(h.tabs[1].url, 'https://www.youtube.com/watch?v=' + FIRST);
  h.events.close('ytwash:reminder-notice:' + FIRST, true); await h.flush(); assert.equal(h.alarms.size, 0);
  const invalid = await h.message({ type: 'ytwash:schedule-reminder', id: '12345678901', preset: 'week' }); await h.flush();
  assert.match(invalid.error, /Watch Later/);
});

test('quick reminders work for unindexed videos and use the Options default', async () => {
  const h = harness(); await h.flush();
  const sender = { tab: { id: 1 }, url: 'https://www.youtube.com/results?search_query=test' };
  const first = await h.message({ type: 'ytwash:quick-reminder', id: FIRST, title: 'Search video' }, sender);
  assert.equal(new Date(first.dueAt).toDateString(), new Date().toDateString());
  assert.equal(h.data['ytwash:reminder:' + FIRST].title, 'Search video');
  h.change({ 'ytwash:reminder-default': 'week' });
  const week = await h.message({ type: 'ytwash:quick-reminder', id: FIRST, title: 'Search video' }, sender);
  assert.ok(week.dueAt > first.dueAt + 5 * 86400000);
  h.change({ 'ytwash:reminder-default': 'custom', 'ytwash:reminder-custom-date': Date.now() - 1000 });
  const expired = await h.message({ type: 'ytwash:quick-reminder', id: FIRST }, sender);
  assert.equal(new Date(expired.dueAt).toDateString(), new Date().toDateString());
  const rejected = await h.message({ type: 'ytwash:quick-reminder', id: SECOND });
  assert.ok(rejected.error);
});
