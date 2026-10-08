import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';

const source = stripTypeScriptTypes(readFileSync('src/reminders.ts', 'utf8'));
const alarmName = 'ytwash:watch-later-reminder';
function harness(initial = {}) {
  const data = { ...initial }, alarms = new Map(), notices = [], tabs = [], events = {};
  const event = name => ({ addListener: handler => { events[name] = handler; } });
  const context = createContext({ console, chrome: {
    storage: { local: {
      get: async keys => keys === null ? { ...data } : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])),
      set: async values => { Object.assign(data, values); },
    }, onChanged: event('change') },
    runtime: { onInstalled: event('install'), onStartup: event('startup'), getURL: path => 'chrome-extension://test/' + path },
    alarms: { get: async name => alarms.get(name), create: async (name, details) => alarms.set(name, details), clear: async name => alarms.delete(name), onAlarm: event('alarm') },
    notifications: { create: async (id, options) => { notices.push({ id, ...options }); }, clear: async () => true, onClicked: event('click') },
    tabs: { create: async options => tabs.push(options) },
  } });
  runInContext(source, context);
  return { data, alarms, notices, tabs, events, flush: () => runInContext('work', context) };
}
test('opt-in schedules the chosen interval, survives startup, and disabling cancels', async () => {
  const h = harness(); await h.flush(); assert.equal(h.alarms.size, 0);
  h.data['ytwash:reminders-enabled'] = true;
  h.events.change({ 'ytwash:reminders-enabled': {} }, 'local'); await h.flush();
  assert.equal(h.alarms.get(alarmName).periodInMinutes, 7 * 1440);
  const original = h.alarms.get(alarmName);
  h.events.startup(); await h.flush(); assert.equal(h.alarms.get(alarmName), original);
  h.data['ytwash:reminder-interval-days'] = 3;
  h.events.change({ 'ytwash:reminder-interval-days': {} }, 'local'); await h.flush();
  assert.equal(h.alarms.get(alarmName).periodInMinutes, 3 * 1440);
  h.alarms.clear(); h.events.startup(); await h.flush(); assert.equal(h.alarms.size, 1);
  h.data['ytwash:reminders-enabled'] = false;
  h.events.change({ 'ytwash:reminders-enabled': {} }, 'local'); await h.flush(); assert.equal(h.alarms.size, 0);
});
test('empty or disabled queues stay silent and malformed settings default safely', async () => {
  const h = harness({ 'ytwash:reminders-enabled': true, 'ytwash:reminder-interval-days': -1 }); await h.flush();
  assert.equal(h.alarms.get(alarmName).periodInMinutes, 10080);
  h.events.alarm({ name: alarmName }); await h.flush(); assert.equal(h.notices.length, 0);
  h.data['ytwash:later:abcdefghijk'] = { title: 'Local video' };
  h.data['ytwash:reminders-enabled'] = false;
  h.events.alarm({ name: alarmName }); await h.flush(); assert.equal(h.notices.length, 0);
});
test('rotates local and indexed videos, skips completed videos, and opens a safe watch URL', async () => {
  const h = harness({ 'ytwash:reminders-enabled': true,
    'ytwash:playlist:WL': { entries: [{ id: 'abcdefghijk', creator: 'Creator' }, { id: 'invalid', creator: 'Bad' }] },
    'ytwash:later:lmnopqrstuv': { title: 'Local video' },
  }); await h.flush();
  h.events.alarm({ name: alarmName }); await h.flush();
  assert.equal(h.data['ytwash:last-reminded'], 'abcdefghijk');
  h.events.alarm({ name: alarmName }); await h.flush();
  assert.equal(h.data['ytwash:last-reminded'], 'lmnopqrstuv');
  assert.match(h.notices[1].message, /Local video/);
  h.events.click('ytwash:watch-later'); await h.flush();
  assert.equal(h.tabs[0].url, 'https://www.youtube.com/watch?v=lmnopqrstuv');
  h.data['ytwash:watched:abcdefghijk'] = true;
  h.events.alarm({ name: alarmName }); await h.flush();
  assert.equal(h.data['ytwash:last-reminded'], 'lmnopqrstuv');
  h.data['ytwash:watched:lmnopqrstuv'] = true;
  const count = h.notices.length;
  h.events.alarm({ name: alarmName }); await h.flush(); assert.equal(h.notices.length, count);
  h.data['ytwash:reminder-video'] = 'https://evil.test';
  h.events.click('ytwash:watch-later'); await h.flush(); assert.equal(h.tabs.length, 1);
});
