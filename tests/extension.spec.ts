import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
const extensionPath = resolve('dist');

test('unpacked extension loads and groups Watch Later videos on request', async ({}, testInfo) => {
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
    const groups = page.locator('.ytwash-native-group');
    await expect(page.locator('#ytwash-grouping-toggle')).toHaveCount(0);
    await expect(groups).toHaveCount(0);
    const settings = await context.newPage();
    await settings.goto(new URL('options.html', worker.url()).href);
    await settings.locator('[data-key="ytwash:group-by-creator"]').check();
    await expect(groups).toBeVisible({ timeout: 15000 });
    await expect(groups).toHaveAttribute('data-ytwash-heading', 'Example Creator · 2 videos');
    await expect(groups).toHaveCount(1);
    await expect(page.locator('.ytwash-grouped-row')).toHaveCount(2);
    await expect(page.locator('#ytwash-native-controls')).toHaveCount(0);
    await expect(groups.locator('button')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('creator-groups.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('single-video creators appear under Everything else and native rows remain intact', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  try {
    const page = await context.newPage();
    await page.route('https://www.youtube.com/**', async route => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><head><style>ytd-playlist-video-renderer {display:flex;align-items:center} a {display:block}</style></head><body>
        <ytd-playlist-video-renderer><a id="video-title" href="/watch?v=abcdefghijk">One</a><ytd-channel-name><a href="/channel/a">Creator A</a></ytd-channel-name></ytd-playlist-video-renderer>
        <ytd-playlist-video-renderer><a id="video-title" href="/watch?v=lmnopqrstuv">Two</a><ytd-channel-name><a href="/channel/a">Creator A</a></ytd-channel-name></ytd-playlist-video-renderer>
        <ytd-playlist-video-renderer><a id="video-title" href="/watch?v=12345678901">Three</a><ytd-channel-name><a href="/channel/b">Creator B</a></ytd-channel-name></ytd-playlist-video-renderer>
      </body></html>` });
    });
    await page.goto('https://www.youtube.com/playlist?list=WL');
    await expect(page.locator('.ytwash-native-group')).toHaveCount(0);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const settings = await context.newPage();
    await settings.goto(new URL('options.html', worker.url()).href);
    await settings.locator('[data-key="ytwash:group-by-creator"]').check();
    await expect(page.locator('.ytwash-native-group')).toHaveCount(2, { timeout: 15000 });
    await expect(page.locator('.ytwash-native-group').first()).toHaveAttribute('data-ytwash-heading', 'Creator A · 2 videos');
    await expect(page.locator('.ytwash-native-group').last()).toHaveAttribute('data-ytwash-heading', 'Everything else');
    await expect(page.locator('ytd-playlist-video-renderer')).toHaveCount(3);
    await expect(page.locator('ytd-playlist-video-renderer').last()).toContainText('Three');
    await expect(page.locator('.ytwash-grouped-row')).toHaveCount(3);
    const layout = await page.locator('.ytwash-native-group').first().evaluate(row => {
      const heading = getComputedStyle(row, '::before');
      return { position: heading.position, top: heading.top,
        spaceAboveVideo: row.querySelector('a')!.getBoundingClientRect().top - row.getBoundingClientRect().top };
    });
    expect(layout.position).toBe('absolute');
    expect(layout.top).toBe('8px');
    expect(layout.spaceAboveVideo).toBeGreaterThanOrEqual(40);

    await expect(page.locator('.ytwash-native-group button')).toHaveCount(0);
  } finally { await context.close(); }
});
