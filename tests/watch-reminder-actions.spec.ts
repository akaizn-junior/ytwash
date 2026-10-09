import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
for (const renderer of ['ytd-rich-item-renderer', 'ytd-playlist-video-renderer', 'ytd-playlist-panel-video-renderer', 'ytd-watch-metadata', 'yt-lockup-view-model', 'ytd-reel-video-renderer']) {
  test('one-click reminder from ' + renderer, async () => {
    const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
      args: ['--disable-extensions-except=' + resolve('dist'), '--load-extension=' + resolve('dist')] });
    try {
      const page = await context.newPage();
      await page.route('https://www.youtube.com/**', route => route.fulfill({contentType:'text/html', body:`<html><body>
        <${renderer}><a id="video-title" href="/watch?v=abcdefghijk">Test video</a><ytd-menu-renderer><button id="more">More</button></ytd-menu-renderer></${renderer}>
        <script>document.querySelector('#more').onclick=()=>{document.querySelectorAll('ytd-menu-popup-renderer').forEach(m=>m.remove());const menu=document.createElement('ytd-menu-popup-renderer');menu.innerHTML='<div id="items"><ytd-menu-service-item-renderer><yt-formatted-string>Save</yt-formatted-string></ytd-menu-service-item-renderer></div>';document.body.append(menu);};</script></body></html>` }));
      await page.goto('https://www.youtube.com/watch?v=' + (renderer === 'ytd-watch-metadata' ? 'abcdefghijk' : 'lmnopqrstuv'));
      await page.locator('#more').click();
      await page.getByRole('menuitem', { name: 'Remind me to watch' }).click();
      await expect(page.getByRole('status')).toContainText('We’ll remind you');
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
      const data = await worker.evaluate(async () => ({ stored: await chrome.storage.local.get('ytwash:reminder:abcdefghijk'), alarm: await chrome.alarms.get('ytwash:reminder:abcdefghijk') }));
      expect(data.alarm).toBeTruthy();
      const when = data.stored['ytwash:reminder:abcdefghijk'].dueAt;
      expect(when).toBeGreaterThan(Date.now());
      expect(new Date(when).toDateString()).toBe(new Date().toDateString());
      const settings = await context.newPage();
      await settings.goto(new URL('options.html', worker.url()).href);
      await expect(settings.locator('#upcoming')).toContainText('Cancel');
      await settings.locator('#reminder-time').selectOption('week');
      await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get('ytwash:reminder-default'))['ytwash:reminder-default'])).toBe('week');
      await page.locator('#more').click();
      await page.getByRole('menuitem', { name: 'Remind me to watch' }).click();
      await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get('ytwash:reminder:abcdefghijk'))['ytwash:reminder:abcdefghijk'].dueAt)).toBeGreaterThan(when);
      await settings.getByRole('button',{name:'Cancel',exact:true}).click();
      await expect(settings.locator('#upcoming li')).toHaveCount(0);
      await expect.poll(() => worker.evaluate(() => chrome.alarms.get('ytwash:reminder:abcdefghijk'))).toBeFalsy();
      if (renderer === 'ytd-rich-item-renderer') {
        await worker.evaluate(async () => {
          const key = 'ytwash:reminder:abcdefghijk';
          await chrome.storage.local.set({ [key]: { id: 'abcdefghijk', title: 'Due video', dueAt: Date.now() } });
          await chrome.alarms.create(key, { when: Date.now() + 1000 });
        });
        await expect.poll(() => worker.evaluate(async () => (await chrome.notifications.getAll())['ytwash:reminder-notice:abcdefghijk']), { timeout: 15000 }).toBeTruthy();
        await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get('ytwash:reminder:abcdefghijk'))['ytwash:reminder:abcdefghijk'])).toBeFalsy();
      }

    } finally { await context.close(); }
  });
}
