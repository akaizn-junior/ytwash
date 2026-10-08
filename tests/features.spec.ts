import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const extensionPath = resolve('dist');
const FIRST = 'abcdefghijk';
const SECOND = 'lmnopqrstuv';
const playlist = '<!doctype html><html><body>' +
  '<ytd-playlist-video-renderer><a id="video-title" href="/watch?v=' + FIRST + '">First video</a><ytd-channel-name><a href="/channel/UCcreator1">Example Creator</a></ytd-channel-name></ytd-playlist-video-renderer>' +
  '<ytd-playlist-video-renderer><a id="video-title" href="/watch?v=' + SECOND + '">Second video</a><ytd-channel-name><a href="/channel/UCcreator1">Example Creator</a></ytd-channel-name></ytd-playlist-video-renderer>' +
  '</body></html>';
const watch = '<!doctype html><html><body>' +
  '<ytd-watch-metadata><div id="actions"><button id="native-save" aria-label="Save">Save</button></div></ytd-watch-metadata>' +
  '<video class="html5-main-video" preload="auto" muted src="/fixtures/mock-video.webm"></video>' +
  '<script>' +
  'const media=document.querySelector("video");' +
  'document.getElementById("native-save").addEventListener("click",()=>{' +
  'if(document.querySelector("#fake-picker"))return;' +
  'const picker=document.createElement("ytd-add-to-playlist-renderer");picker.id="fake-picker";' +
  'picker.innerHTML="<span id=\\"label\\">Watch Later</span><input type=\\"checkbox\\" aria-label=\\"Watch Later\\">";' +
  'picker.querySelector("input").addEventListener("change",()=>{window.__removedFromWatchLater=!picker.querySelector("input").checked;});' +
  'document.body.append(picker);});' +
  '</script></body></html>';

async function fixture(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: ['--disable-extensions-except=' + extensionPath, '--load-extension=' + extensionPath]
  });
  const page = await context.newPage();
  await page.route('https://www.youtube.com/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/fixtures/mock-video.webm') {
      const bytes = readFileSync(resolve('tests/fixtures/mock-video.webm'));
      const range = route.request().headers()['range']?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
      await route.fulfill({ status: range ? 206 : 200, contentType: 'video/webm',
        headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) },
        body: bytes.subarray(start, end + 1) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html',
      body: url.pathname === '/playlist' ? playlist : watch });
  });
  return { context, page };
}

test('Watch Later stays native until grouping is requested', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/playlist?list=WL');
    const grouping = page.locator('#ytwash-grouping-toggle');
    await expect(grouping).toHaveText('Group by creator', { timeout: 15000 });
    await expect(page.locator('.ytwash-native-group')).toHaveCount(0);
    await grouping.click();
    await expect(grouping).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.ytwash-native-group ytd-playlist-video-renderer')).toHaveCount(2, { timeout: 15000 });
    await page.locator('.ytwash-native-group a#video-title').first().click();
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + FIRST);
    await expect(page.locator('#ytwash-playback-control')).toHaveCount(0);
    await page.locator('video').evaluate((v: HTMLVideoElement) => v.dispatchEvent(new Event('ended')));
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + SECOND, { timeout: 12000 });
  } finally { await context.close(); }
});

test('grouping is a one-time action and undo restores Watch Later', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/playlist?list=WL');
    const toggle = page.locator('#ytwash-grouping-toggle');
    await expect(toggle).toHaveText('Group by creator', { timeout: 15000 });
    await toggle.click();
    await expect(page.locator('.ytwash-native-group')).toHaveCount(1);
    await toggle.click();
    await expect(toggle).toHaveText('Group by creator');
    await expect(page.locator('.ytwash-native-group')).toHaveCount(0);
    expect(await page.locator('ytd-playlist-video-renderer a#video-title').allTextContents())
      .toEqual(['First video', 'Second video']);

    // A later YouTube list update must not silently turn grouping back on.
    await page.locator('body').evaluate(body => {
      const row = document.createElement('ytd-playlist-video-renderer');
      row.innerHTML = '<a id="video-title" href="/watch?v=12345678901">Third video</a><ytd-channel-name><a href="/channel/UCcreator1">Example Creator</a></ytd-channel-name>';
      body.append(row);
    });
    await expect(page.locator('.ytwash-native-group')).toHaveCount(0);
  } finally { await context.close(); }
});

test('completed video is not removed when Watch Later membership is uncertain', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    const options = await openOptions(context);
    await options.locator('[data-key="ytwash:auto-remove-completed"]').check();
    await expect(options.locator('#status')).toHaveText('Preferences saved.');
    await expect(page.locator('#ytwash-save-position, #ytwash-auto-remove-toggle')).toHaveCount(0);
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState >= 2)).toBe(true);
    await page.locator('video').evaluate(async (video: HTMLVideoElement) => { video.muted = true; await video.play(); });
    // Actual elapsed playback rather than synthetic seeking events: verifies cleanup's >=5s guard.
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 12000 }).toBeGreaterThan(6);
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.dispatchEvent(new Event('ended')));
    await expect(page.locator('#fake-picker')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('#fake-picker input')).not.toBeChecked();
    const removed = await page.evaluate(() => (window as Window & { __removedFromWatchLater?: boolean }).__removedFromWatchLater);
    expect(removed).not.toBe(true);
  } finally { await context.close(); }
});

async function openOptions(context: BrowserContext): Promise<Page> {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const options = await context.newPage();
  await options.goto(new URL('options.html', worker.url()).href);
  await expect(options.locator('#preferences')).toBeEnabled();
  return options;
}

test('native Save adds Watch Later and saves the click timestamp without extra controls', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    await expect(page.locator('#native-save .ytwash-save-lightning')).toBeVisible();
    await expect(page.locator('#ytwash-save-position, #ytwash-auto-remove-toggle')).toHaveCount(0);
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState >= 2)).toBe(true);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.currentTime = 25; });
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(25);
    await page.locator('#native-save').click();
    await expect(page.locator('#fake-picker input')).toBeChecked();
    const options = await openOptions(context);
    await expect.poll(() => options.evaluate(async () => {
      const data = await chrome.storage.local.get('ytwash:resume:abcdefghijk');
      return data['ytwash:resume:abcdefghijk']?.seconds;
    })).toBe(25);
    // Saving again updates the timestamp without removing Watch Later membership.
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.currentTime = 35; });
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(35);
    await page.locator('#native-save').click();
    await expect.poll(() => options.evaluate(async () => {
      const data = await chrome.storage.local.get('ytwash:resume:abcdefghijk');
      return data['ytwash:resume:abcdefghijk']?.seconds;
    })).toBe(35);
    await expect(page.locator('#fake-picker input')).toBeChecked();
    await page.reload();
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(35);
    await page.goto('https://www.youtube.com/watch?v=' + FIRST + '&t=10');
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
    expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(0);
  } finally { await context.close(); }
});

test('options update open tabs and disabling enhanced Save preserves native chooser', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    await expect(page.locator('.ytwash-save-lightning')).toBeVisible();
    const options = await openOptions(context);
    await expect(options.locator('[data-key="ytwash:auto-remove-completed"]')).not.toBeChecked();
    await options.locator('[data-key="ytwash:enhanced-save"]').uncheck();
    await expect(options.locator('#status')).toHaveText('Preferences saved.');
    await expect(page.locator('.ytwash-save-lightning')).toHaveCount(0);
    await page.locator('#native-save').click();
    await expect(page.locator('#fake-picker input')).not.toBeChecked();
    await options.reload();
    await expect(options.locator('[data-key="ytwash:enhanced-save"]')).not.toBeChecked();
  } finally { await context.close(); }
});

test('overflow menu Save receives one lightning icon and saves to Watch Later', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    await page.locator('#native-save').evaluate(button => {
      button.hidden = true;
      const overflow = document.createElement('button');
      overflow.setAttribute('aria-label', 'More actions');
      overflow.textContent = '…';
      button.parentElement!.append(overflow);
      overflow.addEventListener('click', () => {
        const menu = document.createElement('ytd-menu-service-item-renderer');
        menu.innerHTML = '<yt-formatted-string>Save</yt-formatted-string>';
        menu.addEventListener('click', () => (button as HTMLButtonElement).click());
        document.body.append(menu);
      });
    });
    await page.getByRole('button', { name: 'More actions' }).click();
    const save = page.locator('ytd-menu-service-item-renderer');
    await expect(save.locator('.ytwash-save-lightning')).toHaveCount(1);
    await save.locator('yt-formatted-string').click();
    await expect(page.locator('#fake-picker input')).toBeChecked();
  } finally { await context.close(); }
});
