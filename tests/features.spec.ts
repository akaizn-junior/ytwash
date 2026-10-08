import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const extensionPath = resolve('dist');
const FIRST = 'abcdefghijk';
const SECOND = 'lmnopqrstuv';
const playlist = '<!doctype html><html><body>' +
  '<ytd-playlist-video-renderer><a id="video-title" href="/watch?v=' + FIRST + '">First video</a><ytd-channel-name><a href="/channel/UCcreator1">Example Creator</a></ytd-channel-name></ytd-playlist-video-renderer>' +
  '<ytd-playlist-video-renderer><a id="video-title" href="/watch?v=' + SECOND + '">Second video</a><ytd-channel-name><a href="/channel/UCcreator1">Example Creator</a></ytd-channel-name></ytd-playlist-video-renderer>' +
  '</body></html>';
const watch = '<!doctype html><html><body>' +
  '<ytd-watch-metadata><div id="actions"><button id="native-save" aria-label="Save">Save</button></div></ytd-watch-metadata>' +
  '<video class="html5-main-video" preload="auto" muted src="/fixtures/mock-video.mp4"></video>' +
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
    if (url.pathname === '/fixtures/mock-video.mp4') {
      await route.fulfill({ status: 200, contentType: 'video/mp4', path: resolve('tests/fixtures/mock-video.mp4') });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html',
      body: url.pathname === '/playlist' ? playlist : watch });
  });
  return { context, page };
}

test('explicit timestamp persists across reopening a Watch Later video', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    await expect(page.locator('#ytwash-save-position')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState >= 1)).toBe(true);
    await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 83; });
    // HTMLMediaElement seeks asynchronously. Assert the seek completed before saving.
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => Math.floor(video.currentTime)), { timeout: 10000 }).toBe(83);
    await page.locator('#ytwash-save-position').click();
    await expect(page.locator('#ytwash-resume-status')).toContainText('Saved 1:23 locally');
    await page.reload();
    await expect(page.locator('#ytwash-resume-status')).toContainText('Resumed at 1:23');
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => Math.floor(video.currentTime))).toBe(83);
  } finally { await context.close(); }
});

test('creator playback advances to the next indexed video after ended', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/playlist?list=WL');
    await expect(page.locator('#ytwash-creator-groups')).toContainText('2 indexed videos', { timeout: 15000 });
    await page.locator('#ytwash-creator-groups summary').click();
    await page.getByRole('button', { name: 'Play all indexed Watch Later videos from Example Creator' }).click();
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + FIRST);
    await expect(page.locator('#ytwash-playback-label')).toContainText('1/2');
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.dispatchEvent(new Event('ended')));
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + SECOND, { timeout: 12000 });
    await expect(page.locator('#ytwash-playback-label')).toContainText('2/2');
  } finally { await context.close(); }
});

test('completed video is not removed when Watch Later membership is uncertain', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    const toggle = page.locator('#ytwash-auto-remove-toggle');
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await toggle.check();
    await expect(page.locator('#ytwash-auto-remove-message')).toContainText('Auto-removal enabled');
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState >= 2)).toBe(true);
    await page.locator('video').evaluate(async (video: HTMLVideoElement) => { video.muted = true; await video.play(); });
    // Actual elapsed playback rather than synthetic seeking events: verifies cleanup's >=5s guard.
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 12000 }).toBeGreaterThan(6);
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.dispatchEvent(new Event('ended')));
    await expect(page.locator('#ytwash-auto-remove-message')).toContainText('nothing removed');
    await expect(page.locator('#fake-picker input')).not.toBeChecked();
    const removed = await page.evaluate(() => (window as Window & { __removedFromWatchLater?: boolean }).__removedFromWatchLater);
    expect(removed).not.toBe(true);
  } finally { await context.close(); }
});
