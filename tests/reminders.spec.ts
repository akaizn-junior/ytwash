import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';

test('account-free local saves and reminder interval are controlled through Options', async () => {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    await page.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body:
      '<html><head><title>Local video - YouTube</title></head><body><ytd-watch-metadata><h1>Local video</h1><div id="actions"></div></ytd-watch-metadata></body></html>' }));
    await page.goto('https://www.youtube.com/watch?v=abcdefghijk');
    await page.locator('#ytwash-save-for-later').click();
    await expect(page.locator('#ytwash-save-for-later .ytwash-save-lightning')).toHaveCount(0);
    const options = await context.newPage();
    await options.goto(new URL('options.html', worker.url()).href);
    await expect(options.locator('#reminders')).toHaveJSProperty('disabled', false);
    await expect(options.locator('#later-queue')).toContainText('Local video');
    await expect(options.locator('[data-key="ytwash:reminders-enabled"]')).not.toBeChecked();
    await options.locator('#reminder-interval').fill('3');
    await options.locator('#reminder-interval').blur();
    await options.locator('[data-key="ytwash:reminders-enabled"]').check();
    await expect.poll(() => options.evaluate(async () => (await chrome.alarms.get('ytwash:watch-later-reminder'))?.periodInMinutes)).toBe(4320);
    await options.locator('#later-queue button').click();
    await expect(options.locator('#later-queue')).toHaveText('No videos saved locally yet.');
    await options.locator('[data-key="ytwash:reminders-enabled"]').uncheck();
    await expect.poll(() => options.evaluate(async () => !!await chrome.alarms.get('ytwash:watch-later-reminder'))).toBe(false);
  } finally { await context.close(); }
});
