import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
async function fixture() {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const options = await context.newPage(); await options.goto(new URL('options.html', worker.url()).href);
  await expect(options.locator('#reminders')).toHaveJSProperty('disabled', false);
  await options.evaluate(async () => chrome.storage.local.set({ 'ytwash:playlist:WL': { entries: [
    { id: 'abcdefghijk', title: 'First video', creator: 'Creator', key: 'a' },
  ], indexedAt: Date.now() } }));
  return { context, worker, options };
}
test('one-time reminders have simple presets, confirmations, and cancel; no local-save queue', async () => {
  const { context, options } = await fixture();
  try {
    await expect(options.locator('#reminder-time')).toHaveValue('later-today');
    await expect(options.locator('#reminder-time option')).toHaveText(['Later today', 'In 3 days', 'In a week', 'Choose a date and time…']);
    await expect(options.locator('#later-queue, #reminder-interval')).toHaveCount(0);
    await expect(options.locator('#reminder-video')).toContainText('First video');
    await options.locator('#reminder-time').selectOption('three-days');
    await options.locator('#set-reminder').click();
    await expect(options.locator('#status')).toContainText('We’ll remind you');
    const alarm = await options.evaluate(async () => chrome.alarms.get('ytwash:reminder:abcdefghijk'));
    expect(alarm?.scheduledTime).toBeDefined();
    expect(alarm?.periodInMinutes).toBeUndefined();
    await options.locator('#upcoming button').click();
    await expect(options.locator('#upcoming-section')).toBeHidden();
    await options.locator('#reminder-time').selectOption('custom');
    await options.locator('#set-reminder').click();
    await expect(options.locator('#status')).toHaveText('Choose a future date and time.');
  } finally { await context.close(); }
});
for (const dark of [false, true]) test('reminder choices reuse YouTube menu styles in ' + (dark ? 'dark' : 'light') + ' mode', async ({}, testInfo) => {
  const { context, options } = await fixture();
  try {
    const page = await context.newPage();
    await page.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body:
      `<html ${dark ? 'dark' : ''}><head><style>
      html{--yt-spec-text-primary:${dark ? '#f1f1f1' : '#0f0f0f'};--yt-spec-base-background:${dark ? '#0f0f0f' : '#fff'}}
      ytd-menu-popup-renderer{display:block;background:var(--yt-spec-base-background);color:var(--yt-spec-text-primary);font:14px Arial;padding:8px}
      ytd-menu-service-item-renderer{display:block;padding:8px 16px;cursor:pointer}
      </style></head><body><ytd-watch-metadata><h1>First video</h1></ytd-watch-metadata>
      <ytd-menu-popup-renderer><ytd-menu-service-item-renderer><yt-formatted-string>Save</yt-formatted-string></ytd-menu-service-item-renderer></ytd-menu-popup-renderer>
      </body></html>` }));
    await page.goto('https://www.youtube.com/watch?v=abcdefghijk&list=WL');
    await expect(page.locator('#ytwash-save-for-later')).toHaveCount(0);
    const native = page.locator('ytd-menu-service-item-renderer:not([data-ytwash-reminder])');
    const remind = page.getByRole('menuitem', { name: 'Remind me to watch' });
    await expect(remind).toBeVisible();
    expect(await remind.evaluate(el => getComputedStyle(el).color)).toBe(await native.evaluate(el => getComputedStyle(el).color));
    expect(await remind.evaluate(el => getComputedStyle(el).font)).toBe(await native.evaluate(el => getComputedStyle(el).font));
    await remind.click();
    await expect(page.getByRole('menuitem', { name: 'Later today', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'In 3 days', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'In a week', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Choose a date and time…', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('reminder-' + (dark ? 'dark' : 'light') + '.png') });
    await page.getByRole('menuitem', { name: 'In a week', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('We’ll remind you');
    await expect.poll(() => options.evaluate(async () => (await chrome.storage.local.get('ytwash:reminder:abcdefghijk'))['ytwash:reminder:abcdefghijk']?.title)).toBe('First video');
    await expect.poll(() => options.evaluate(() => document.documentElement.hasAttribute('dark'))).toBe(dark);
  } finally { await context.close(); }
});
