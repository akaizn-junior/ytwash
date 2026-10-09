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
        <script>document.querySelector('#more').onclick=()=>{const menu=document.createElement('ytd-menu-popup-renderer');menu.innerHTML='<div id="items"><ytd-menu-service-item-renderer>Save</ytd-menu-service-item-renderer></div>';document.body.append(menu);};</script></body></html>` }));
      await page.goto('https://www.youtube.com/watch?v=abcdefghijk');
      await page.locator('#more').click();
      await page.getByRole('menuitem', { name: 'Remind me to watch' }).click();
      await expect(page.getByRole('menuitem', {name:'Reminder set', exact:true})).toBeVisible();
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
      const data = await worker.evaluate(async () => ({ stored: await chrome.storage.local.get('ytwash:reminder:abcdefghijk'), alarm: await chrome.alarms.get('ytwash:reminder:abcdefghijk') }));
      expect(data.alarm).toBeTruthy();
      const when = data.stored['ytwash:reminder:abcdefghijk'].when;
      expect(when).toBeGreaterThan(Date.now());
      expect(new Date(when).toDateString()).toBe(new Date().toDateString());
      const settings = await context.newPage();
      await settings.goto(new URL('options.html', worker.url()).href);
      await expect(settings.locator('#reminder-list')).toContainText('Cancel');
      await settings.locator('#reminder-timing').selectOption('tomorrow');
      await expect(settings.locator('#status')).toHaveText('Reminder timing saved.');
      await page.getByRole('menuitem',{name:'Reminder set',exact:true}).click();
      await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get('ytwash:reminder:abcdefghijk'))['ytwash:reminder:abcdefghijk'].when)).toBeGreaterThan(when);
      await settings.getByRole('button',{name:'Cancel',exact:true}).click();
      await expect(settings.locator('#reminder-list li')).toHaveCount(0);
      await expect.poll(() => worker.evaluate(() => chrome.alarms.get('ytwash:reminder:abcdefghijk'))).toBeFalsy();
      if (renderer === 'ytd-rich-item-renderer') {
        await worker.evaluate(async () => {
          const key = 'ytwash:reminder:abcdefghijk';
          await chrome.storage.local.set({ [key]: { id: 'abcdefghijk', title: 'Due video', when: Date.now() } });
          await chrome.alarms.create(key, { when: Date.now() + 1000 });
        });
        await expect.poll(() => worker.evaluate(async () => (await chrome.notifications.getAll())['ytwash:reminder:abcdefghijk']), { timeout: 15000 }).toBeTruthy();
        await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get('ytwash:reminder:abcdefghijk'))['ytwash:reminder:abcdefghijk'])).toBeFalsy();
      }

    } finally { await context.close(); }
  });
}
