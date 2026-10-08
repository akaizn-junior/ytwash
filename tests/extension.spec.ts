import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
const extensionPath = resolve('dist');

test('unpacked extension loads and groups Watch Later videos', async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    expect(worker.url()).toMatch(/^chrome-extension:\/\//);

    const page = await context.newPage();
    // Fulfilled locally: no Google sign-in, remote YouTube calls, or real playlist mutations.
    await page.route('https://www.youtube.com/**', async route => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html>
<html><head><title>Watch Later fixture</title></head><body>
<ytd-playlist-video-renderer>
  <a id="video-title" href="/watch?v=abcdefghijk">First video</a>
  <ytd-channel-name><a href="/channel/UCcreator1">Example Creator</a></ytd-channel-name>
</ytd-playlist-video-renderer>
<ytd-playlist-video-renderer>
  <a id="video-title" href="/watch?v=lmnopqrstuv">Second video</a>
  <ytd-channel-name><a href="/channel/UCcreator1">Example Creator</a></ytd-channel-name>
</ytd-playlist-video-renderer>
</body></html>` });
    });
    await page.goto('https://www.youtube.com/playlist?list=WL');
    const groups = page.locator('#ytwash-creator-groups');
    await expect(groups).toBeVisible({ timeout: 15000 });
    await expect(groups).toContainText('2 indexed videos');
    await expect(groups.locator('summary')).toContainText('Example Creator · 2 videos');
    await groups.locator('summary').click();
    await expect(groups.getByRole('button', { name: 'Play this creator' })).toBeVisible();
    await groups.locator('#ytwash-search').fill('Second video');
    await expect(groups.locator('.yw-item')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('creator-groups.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
