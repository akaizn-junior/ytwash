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

async function fixture(playlistBody = playlist): Promise<{ context: BrowserContext; page: Page }> {
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
      body: url.pathname === '/playlist' ? playlistBody : watch });
  });
  return { context, page };
}

test('Watch Later stays native until grouping is requested', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/playlist?list=WL');
    await expect(page.locator('#ytwash-grouping-toggle')).toHaveCount(0);
    await expect(page.locator('.ytwash-native-group')).toHaveCount(0);
    const settings = await openOptions(context);
    await settings.locator('[data-key="ytwash:group-by-creator"]').check();
    await expect(page.locator('.ytwash-grouped-row')).toHaveCount(2, { timeout: 15000 });
    await page.locator('.ytwash-native-group a#video-title').first().click();
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + FIRST + '&list=WL');
    await expect(page.locator('#ytwash-playback-control')).toHaveCount(0);
    await page.locator('video').evaluate((v: HTMLVideoElement) => v.dispatchEvent(new Event('ended')));
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + SECOND + '&list=WL', { timeout: 12000 });
  } finally { await context.close(); }
});

test('grouping is a one-time action and undo restores Watch Later', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/playlist?list=WL');
    const settings = await openOptions(context);
    await settings.locator('[data-key="ytwash:group-by-creator"]').check();
    await expect(page.locator('.ytwash-native-group')).toHaveCount(1);
    await settings.locator('[data-key="ytwash:group-by-creator"]').uncheck();
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
  await expect(options.locator('#preferences')).toHaveJSProperty('disabled', false);
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
    await page.locator('ytd-watch-metadata').evaluate(metadata => {
      const channel = document.createElement('ytd-channel-name');
      channel.innerHTML = '<a href="/channel/UCcreator1">Example Creator</a>';
      metadata.append(channel);
    });
    await page.locator('#native-save').click();
    await expect(page.locator('#fake-picker input')).toBeChecked();
    const options = await openOptions(context);
    await expect.poll(() => options.evaluate(async () => {
      const data = await chrome.storage.local.get('ytwash:resume:abcdefghijk');
      return data['ytwash:resume:abcdefghijk']?.seconds;
    })).toBe(25);
    await expect.poll(() => options.evaluate(async () => {
      const data = await chrome.storage.local.get('ytwash:playlist:WL');
      return data['ytwash:playlist:WL']?.order;
    })).toEqual([FIRST]);
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

test('built-in watch features cannot be disabled by legacy stored preferences', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    const options = await openOptions(context);
    await expect(options.locator('input[data-key]')).toHaveCount(2);
    await options.evaluate(() => chrome.storage.local.set({
      'ytwash:enhanced-save': false, 'ytwash:resume-enabled': false, 'ytwash:group-playback': false,
    }));
    await page.reload();
    await expect(page.locator('.ytwash-save-lightning')).toBeVisible();
    await page.locator('#native-save').click();
    await expect(page.locator('#fake-picker input')).toBeChecked();
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

test('Watch Later opens saved positions using YouTube timestamp URLs and respects explicit times', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/playlist?list=WL');
    const options = await openOptions(context);
    await options.evaluate(() => chrome.storage.local.set({
      'ytwash:resume:abcdefghijk': { seconds: 35, savedAt: Date.now() },
      'ytwash:resume:lmnopqrstuv': { seconds: 45, savedAt: Date.now() },
    }));
    await page.locator('a#video-title').first().click();
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + FIRST + '&list=WL&t=35s');
    await page.locator('video').evaluate((v: HTMLVideoElement) => v.dispatchEvent(new Event('ended')));
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + SECOND + '&list=WL&t=45s', { timeout: 12000 });
    await page.goto('https://www.youtube.com/playlist?list=WL');
    await page.locator('a#video-title').first().evaluate((a: HTMLAnchorElement) => { a.href += '&t=10s'; });
    await page.locator('a#video-title').first().click();
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + FIRST + '&t=10s&list=WL');
    await options.evaluate(() => chrome.storage.local.set({'ytwash:resume-enabled': false}));
    await page.goto('https://www.youtube.com/playlist?list=WL');
    await page.locator('a#video-title').first().click();
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + FIRST + '&list=WL&t=35s');
  } finally { await context.close(); }
});

test('resume waits for replacement metadata when YouTube reuses the video element', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    const options = await openOptions(context);
    await options.evaluate(() => chrome.storage.local.set({
      'ytwash:resume:lmnopqrstuv': { seconds: 35, savedAt: Date.now() },
    }));
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
    await page.evaluate(() => {
      history.pushState({}, '', '/watch?v=lmnopqrstuv');
      window.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(35);
    // YouTube replaces the source after the navigation event, resetting time.
    await page.locator('video').evaluate((v: HTMLVideoElement) => v.load());
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(35);
  } finally { await context.close(); }
});

test('plain-text Save keeps its lightning icon and persists time without a recognizable chooser', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    const options = await openOptions(context);
    await page.locator('#native-save').evaluate(button => {
      const plain = document.createElement('button');
      plain.id = 'plain-save';
      plain.textContent = 'Save';
      button.replaceWith(plain);
    });
    await expect(page.locator('#plain-save .ytwash-save-lightning')).toHaveCount(1);
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.currentTime = 25; });
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(25);
    await page.locator('#plain-save').click();
    await expect.poll(() => options.evaluate(async () =>
      (await chrome.storage.local.get('ytwash:resume:abcdefghijk'))['ytwash:resume:abcdefghijk']?.seconds
    )).toBe(25);
    await expect(page.locator('#plain-save .ytwash-save-lightning')).toHaveCount(1);
    await expect(page.locator('#fake-picker')).toHaveCount(0);
  } finally { await context.close(); }
});

for (const display of ['flex', 'grid', 'block']) {
  test(`Save lightning stays on the same row in ${display} layouts`, async () => {
    const { context, page } = await fixture();
    try {
      await page.goto('https://www.youtube.com/watch?v=' + FIRST);
      await page.locator('#native-save').evaluate((button, display) => {
        const row = document.createElement('ytd-menu-service-item-renderer');
        row.id = 'layout-save';
        row.style.cssText = `display:${display};width:160px;box-sizing:border-box;padding:12px 16px;flex-wrap:wrap;grid-template-columns:1fr;gap:8px`;
        row.innerHTML = '<yt-formatted-string style="display:block">Save</yt-formatted-string>';
        button.replaceWith(row);
      }, display);
      const row = page.locator('#layout-save');
      const label = await row.locator('yt-formatted-string').boundingBox();
      await expect(row.locator('.ytwash-save-lightning')).toHaveCount(1);
      const icon = await row.locator('.ytwash-save-lightning').boundingBox();
      expect(label).not.toBeNull();
      expect(icon).not.toBeNull();
      expect(Math.abs(icon!.y + icon!.height / 2 - label!.y - label!.height / 2)).toBeLessThan(2);
      expect(icon!.x).toBeGreaterThan(label!.x);
      await row.locator('yt-formatted-string').evaluate(label => { label.textContent = 'Download'; });
      await expect(row.locator('.ytwash-save-lightning')).toHaveCount(0);
      expect(await row.evaluate(node => node.style.paddingRight)).toBe('16px');
      expect(await row.evaluate(node => node.style.position)).toBe('');
    } finally { await context.close(); }
  });
}

test('red Save lightning shares the native clickable hover container', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    await page.locator('#native-save').evaluate(button => {
      const renderer = document.createElement('ytd-menu-service-item-renderer');
      renderer.innerHTML = '<tp-yt-paper-item style="display:flex;box-sizing:border-box;width:180px;padding:12px 16px"><yt-formatted-string>Save</yt-formatted-string></tp-yt-paper-item>';
      button.replaceWith(renderer);
    });
    const container = page.locator('tp-yt-paper-item');
    const icon = container.locator('.ytwash-save-lightning');
    await expect(icon).toHaveCount(1);
    expect(await icon.evaluate(node => getComputedStyle(node).fill)).toBe('rgb(255, 0, 51)');
    const bounds = (await icon.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    expect(await container.evaluate(node => node.matches(':hover'))).toBe(true);
    expect(await page.evaluate(({x,y}) => !!document.elementFromPoint(x,y)?.closest('tp-yt-paper-item'),
      {x:bounds.x + bounds.width / 2,y:bounds.y + bounds.height / 2})).toBe(true);
  } finally { await context.close(); }
});

test('ordinary playlists group, retain their playlist context, and index separately', async () => {
  const { context, page } = await fixture();
  try {
    const options = await openOptionsAfterNavigation();
    async function openOptionsAfterNavigation() {
      await page.goto('https://www.youtube.com/playlist?list=PL_example');
      return openOptions(context);
    }
    await options.locator('[data-key="ytwash:group-by-creator"]').check();
    await expect(page.locator('.ytwash-native-group')).toHaveCount(1);
    await expect(page.locator('#ytwash-grouping-toggle')).toHaveCount(0);
    await expect.poll(() => options.evaluate(async () =>
      (await chrome.storage.local.get('ytwash:playlist:PL_example'))['ytwash:playlist:PL_example']?.entries.length
    )).toBe(2);
    await page.locator('a#video-title').first().click();
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + FIRST + '&list=PL_example');
    await page.locator('video').evaluate((v: HTMLVideoElement) => v.dispatchEvent(new Event('ended')));
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + SECOND + '&list=PL_example', {timeout:12000});
    await page.goto('https://www.youtube.com/playlist?list=WL');
    await expect.poll(() => options.evaluate(async () => {
      const values = await chrome.storage.local.get(['ytwash:playlist:PL_example', 'ytwash:playlist:WL']);
      return !!values['ytwash:playlist:PL_example'] && !!values['ytwash:playlist:WL'];
    })).toBe(true);
  } finally { await context.close(); }
});

const THIRD = '12345678901';
const FOURTH = '98765432109';
const interleaved = '<!doctype html><html><body><ytd-playlist-header-renderer>' +
  '<a id="play-all" href="/watch?v=abcdefghijk&list=PL_grouped">Play all</a>' +
  '<button aria-label="Play all">Play all</button></ytd-playlist-header-renderer>' +
  [[FIRST,'Creator A'],[SECOND,'Creator B'],[THIRD,'Creator A'],[FOURTH,'Creator B']].map(([id,creator]) =>
    `<ytd-playlist-video-renderer><a id="video-title" href="/watch?v=${id}&list=PL_grouped">${id}</a><ytd-channel-name><a href="/channel/${creator.replaceAll(' ','')}">${creator}</a></ytd-channel-name></ytd-playlist-video-renderer>`
  ).join('') + '</body></html>';

for (const start of ['header link', 'header button', 'direct playlist URL']) {
  test(`configured creator playback follows groups from a native ${start}`, async () => {
    const { context, page } = await fixture(interleaved);
    try {
      await page.goto('https://www.youtube.com/playlist?list=PL_grouped');
      const options = await openOptions(context);
      await options.locator('[data-key="ytwash:group-by-creator"]').check();
      await expect(page.locator('.ytwash-native-group')).toHaveCount(2);
      await expect.poll(() => options.evaluate(async () =>
        (await chrome.storage.local.get('ytwash:playlist:PL_grouped'))['ytwash:playlist:PL_grouped']?.entries.length
      )).toBe(4);
      if (start === 'header link') await page.locator('#play-all').click();
      else if (start === 'header button') await page.getByRole('button', {name:'Play all',exact:true}).click();
      else await page.goto('https://www.youtube.com/watch?v=' + FIRST + '&list=PL_grouped');
      await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + FIRST + '&list=PL_grouped');
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('ytwash:creator-queue:v1'))).not.toBeNull();
      // A native autoplay handler must not replace our grouped next-video choice.
      await page.locator('video').evaluate((v: HTMLVideoElement) => {
        v.addEventListener('ended', () => { document.body.dataset.nativeAdvance = 'ran'; });
        v.dispatchEvent(new Event('ended'));
      });
      expect(await page.locator('body').getAttribute('data-native-advance')).toBeNull();
      await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + THIRD + '&list=PL_grouped', {timeout:12000});
      await page.locator('video').evaluate((v: HTMLVideoElement) => v.dispatchEvent(new Event('ended')));
      await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + SECOND + '&list=PL_grouped', {timeout:12000});
    } finally { await context.close(); }
  });
}

test('turning grouping off preserves native Play all behavior', async () => {
  const { context, page } = await fixture(interleaved);
  try {
    await page.goto('https://www.youtube.com/playlist?list=PL_grouped');
    const options = await openOptions(context);
    await options.locator('[data-key="ytwash:group-by-creator"]').check();
    await options.locator('[data-key="ytwash:group-by-creator"]').uncheck();
    await expect(options.locator('#status')).toHaveText('Preferences saved.');
    await page.locator('#play-all').click();
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + FIRST + '&list=PL_grouped');
    expect(await page.evaluate(() => sessionStorage.getItem('ytwash:creator-queue:v1'))).toBeNull();
  } finally { await context.close(); }
});

test('direct playlist startup groups loaded sidebar videos without a prior index', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    const options = await openOptions(context);
    await options.locator('[data-key="ytwash:group-by-creator"]').check();
    await page.route('https://www.youtube.com/watch?*', route => route.fulfill({
      status:200,contentType:'text/html',body: watch.replace('</body>',
        [[FIRST,'Creator A'],[SECOND,'Creator B'],[THIRD,'Creator A']].map(([id,creator]) =>
          `<ytd-playlist-panel-video-renderer><a href="/watch?v=${id}&list=PL_sidebar">Video</a><span id="byline">${creator}</span></ytd-playlist-panel-video-renderer>`
        ).join('') + '</body>')
    }));
    await page.goto('https://www.youtube.com/watch?v=' + FIRST + '&list=PL_sidebar');
    await expect(page.locator('.ytwash-sidebar-heading')).toHaveCount(2);
    await expect(page.locator('.ytwash-sidebar-heading').last()).toHaveAttribute('data-ytwash-heading', 'Everything else');
    await expect.poll(() => page.locator('ytd-playlist-panel-video-renderer').evaluateAll(rows =>
      [...rows].sort((a,b) => Number((a as HTMLElement).style.order) - Number((b as HTMLElement).style.order))
        .map(row => new URL(row.querySelector('a')!.href).searchParams.get('v'))
    )).toEqual([FIRST, THIRD, SECOND]);

    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('ytwash:creator-queue:v1'))).not.toBeNull();
    await expect.poll(() => options.evaluate(async () =>
      (await chrome.storage.local.get('ytwash:playlist:PL_sidebar'))['ytwash:playlist:PL_sidebar']?.entries.length
    )).toBe(3);
    await page.locator('video').evaluate((v: HTMLVideoElement) => v.dispatchEvent(new Event('ended')));
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + THIRD + '&list=PL_sidebar', {timeout:12000});
  } finally { await context.close(); }
});

test('grouping leaves native renderer lifecycle and continuation placement intact', async () => {
  const { context, page } = await fixture(interleaved);
  try {
    await page.goto('https://www.youtube.com/playlist?list=PL_grouped');
    await page.evaluate(() => {
      (window as any).__disconnects = 0;
      customElements.define('ytd-playlist-video-renderer', class extends HTMLElement {
        disconnectedCallback() { (window as any).__disconnects++; }
      });
      const sentinel = document.createElement('ytd-continuation-item-renderer');
      sentinel.id = 'continuation';
      document.body.append(sentinel);
      (window as any).__nativeRows = [...document.querySelectorAll('ytd-playlist-video-renderer')];
    });
    const options = await openOptions(context);
    await options.locator('[data-key="ytwash:group-by-creator"]').check();
    await expect(page.locator('.ytwash-native-group')).toHaveCount(2);
    await page.evaluate(() => {
      const sentinel = document.querySelector('#continuation')!;
      const row = document.createElement('ytd-playlist-video-renderer');
      row.innerHTML = '<a id="video-title" href="/watch?v=newvideo001">New</a><ytd-channel-name><a href="/channel/CreatorA">Creator A</a></ytd-channel-name>';
      sentinel.before(row);
      for (let i = 0; i < 20; i++) {
        const status = document.createElement('span');
        document.body.append(status);
        status.remove();
      }
    });
    await expect(page.locator('.ytwash-grouped-row')).toHaveCount(5);
    expect(await page.evaluate(() => ({
      disconnects: (window as any).__disconnects,
      nativeOrder: (window as any).__nativeRows.every((row: Element, i: number) => document.querySelectorAll('ytd-playlist-video-renderer')[i] === row),
      sentinelLast: document.body.lastElementChild?.id === 'continuation',
      rows: document.querySelectorAll('ytd-playlist-video-renderer').length,
    }))).toEqual({disconnects: 0, nativeOrder: true, sentinelLast: true, rows: 5});
    await options.locator('[data-key="ytwash:group-by-creator"]').uncheck();
    await expect(page.locator('.ytwash-grouped-row')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__disconnects)).toBe(0);
  } finally { await context.close(); }
});

test('native Next follows persisted groups and includes newly indexed videos', async () => {
  const { context, page } = await fixture(interleaved);
  try {
    await page.goto('https://www.youtube.com/playlist?list=PL_grouped');
    const options = await openOptions(context);
    await options.locator('[data-key="ytwash:group-by-creator"]').check();
    await expect(page.locator('.ytwash-native-group')).toHaveCount(2);
    const worker = context.serviceWorkers()[0];
    await expect.poll(() => worker.evaluate(async () =>
      (await chrome.storage.local.get('ytwash:playlist:PL_grouped'))['ytwash:playlist:PL_grouped']?.order
    )).toEqual([FIRST, THIRD, SECOND, FOURTH]);
    await page.goto('https://www.youtube.com/watch?v=' + FIRST + '&list=PL_grouped');
    await expect.poll(() => page.evaluate(() => !!sessionStorage.getItem('ytwash:creator-queue:v1'))).toBe(true);
    // Another playlist tab indexes a new Creator A video while playback is open.
    await worker.evaluate(async () => {
      const key = 'ytwash:playlist:PL_grouped';
      const value = (await chrome.storage.local.get(key))[key];
      value.entries.splice(1, 0, {id:'newvideo001', creator:'Creator A', key:'/channel/CreatorA'});
      value.order = ['abcdefghijk','newvideo001','12345678901','lmnopqrstuv','98765432109'];
      await chrome.storage.local.set({[key]:value});
    });
    await page.evaluate(() => {
      const next = document.createElement('a');
      next.className = 'ytp-next-button';
      next.href = '/watch?v=lmnopqrstuv&list=PL_grouped';
      next.textContent = 'Next';
      document.body.append(next);
    });
    await page.locator('.ytp-next-button').click();
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=newvideo001&list=PL_grouped');
  } finally { await context.close(); }
});

test('partial sidebar preserves stored order and incorporates newly loaded rows without moving native elements', async () => {
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST);
    const options = await openOptions(context);
    await options.locator('[data-key="ytwash:group-by-creator"]').check();
    await options.evaluate(async () => chrome.storage.local.set({
      'ytwash:playlist:PL_partial': { indexedAt: Date.now(), entries: [
        {id:'abcdefghijk',creator:'Creator A',key:'/channel/a'},
        {id:'lmnopqrstuv',creator:'Creator B',key:'/channel/b'},
        {id:'12345678901',creator:'Creator A',key:'/channel/a'},
        {id:'98765432109',creator:'Creator B',key:'/channel/b'},
      ] }
    }));
    await page.route('https://www.youtube.com/watch?*', route => route.fulfill({status:200,contentType:'text/html',body:
      watch.replace('</body>', '<div id="panel">' + [[SECOND,'Creator B'],[FIRST,'Creator A']].map(([id,creator]) =>
      `<ytd-playlist-panel-video-renderer><a href="/watch?v=${id}&list=PL_partial">Video</a><span id="byline">${creator}</span></ytd-playlist-panel-video-renderer>`).join('') + '</div></body>')
    }));
    await page.goto('https://www.youtube.com/watch?v=' + FIRST + '&list=PL_partial');
    await expect(page.locator('.ytwash-sidebar-heading')).toHaveCount(2);
    await page.evaluate(() => {
      (window as any).__disconnects = 0;
      customElements.define('ytd-playlist-panel-video-renderer', class extends HTMLElement {
        disconnectedCallback() { (window as any).__disconnects++; }
      });
      const row = document.createElement('ytd-playlist-panel-video-renderer');
      row.innerHTML = '<a href="/watch?v=newvideo001&list=PL_partial">New</a><span id="byline">Creator A</span>';
      document.querySelector('#panel')!.append(row);
    });
    await expect.poll(() => options.evaluate(async () =>
      (await chrome.storage.local.get('ytwash:playlist:PL_partial'))['ytwash:playlist:PL_partial']?.order
    )).toEqual([FIRST, THIRD, 'newvideo001', SECOND, FOURTH]);
    expect(await page.evaluate(() => (window as any).__disconnects)).toBe(0);
    await options.locator('[data-key="ytwash:group-by-creator"]').uncheck();
    await expect(page.locator('.ytwash-sidebar-heading')).toHaveCount(0);
    expect(await page.locator('#panel').evaluate(panel => (panel as HTMLElement).style.display)).toBe('');
  } finally { await context.close(); }
});

for (const {enabled, list} of [{enabled:false,list:'WL'}, {enabled:true,list:'WL'}, {enabled:true,list:'PL_cleanup'}, {enabled:true,list:'PL_modern'}]) {
  test(`completed grouped video clears ${list} before advancing only when enabled (${enabled})`, async () => {
    const { context, page } = await fixture();
    try {
      await page.goto('https://www.youtube.com/watch?v=' + FIRST);
      const options = await openOptions(context);
      await options.locator('[data-key="ytwash:group-by-creator"]').check();
      if (enabled) await options.locator('[data-key="ytwash:auto-remove-completed"]').check();
      await options.evaluate(async list => chrome.storage.local.set({
        ['ytwash:playlist:' + list]: {indexedAt: Date.now(), entries:[
          {id:'abcdefghijk',creator:'Creator',key:'creator'},
          {id:'lmnopqrstuv',creator:'Creator',key:'creator'}]},
        'ytwash:resume:abcdefghijk': {seconds:12,savedAt:Date.now()}
      }), list);
      await page.goto('https://www.youtube.com/watch?v=' + FIRST + '&list=' + list);
      await expect.poll(() => page.evaluate(() => !!sessionStorage.getItem('ytwash:creator-queue:v1'))).toBe(true);
      await page.evaluate(list => {
        if (list !== 'WL') {
          const panel = document.createElement('ytd-playlist-panel-renderer');
          panel.innerHTML = '<span id="title">My playlist</span>';
          document.body.append(panel);
        }
        const picker = document.createElement('ytd-add-to-playlist-renderer');
        picker.innerHTML = '<span id="label">' + (list === 'WL' ? 'Watch Later' : 'My playlist') + '</span><input type="checkbox" checked>';
        if (list === 'PL_modern') {
          const row = document.createElement('yt-list-item-view-model');
          row.innerHTML = '<span class="yt-list-item-view-model__title">My playlist</span><yt-checkbox-view-model role="checkbox"></yt-checkbox-view-model>';
          const checkbox = row.querySelector('yt-checkbox-view-model')!;
          setTimeout(() => checkbox.setAttribute('aria-checked', 'true'), 300);
          checkbox.addEventListener('click', () => checkbox.setAttribute('aria-checked', 'false'));
          picker.replaceChildren(row);
          const done = document.createElement('button'); done.textContent = 'Done';
          done.addEventListener('click', () => { sessionStorage.setItem('ytwash-test:done', 'true'); });
          picker.append(done); document.body.append(picker); return;
        }
        picker.querySelector('input')!.addEventListener('change', () => {
          // Simulate an asynchronous native membership update.
          picker.querySelector('input')!.checked = true;
          setTimeout(() => { picker.querySelector('input')!.checked = false; }, 400);
        });
        document.body.append(picker);
      }, list);
      await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState >= 2)).toBe(true);
      await page.locator('video').evaluate(async (v: HTMLVideoElement) => { v.muted=true; await v.play(); });
      await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime), {timeout:12000}).toBeGreaterThan(19);
      await page.locator('video').evaluate((v: HTMLVideoElement) => v.dispatchEvent(new Event('ended')));
      await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + SECOND + '&list=' + list, {timeout:12000});
      const stored = await options.evaluate(async list => {
        const data = await chrome.storage.local.get(['ytwash:playlist:' + list,'ytwash:resume:abcdefghijk']);
        return {ids:data['ytwash:playlist:' + list].entries.map((e: {id:string}) => e.id), resume:!!data['ytwash:resume:abcdefghijk']};
      }, list);
      expect(stored).toEqual(enabled ? {ids:[SECOND],resume:false} : {ids:[FIRST,SECOND],resume:true});
      if (list === 'PL_modern') expect(await page.evaluate(() => sessionStorage.getItem('ytwash-test:done'))).toBe('true');
    } finally { await context.close(); }
  });
}


test('Next preview and Shift+N follow creator order and restore native behavior', async () => {
  const third = '12345678901';
  const { context, page } = await fixture();
  try {
    await page.goto('https://www.youtube.com/watch?v=' + FIRST + '&list=WL');
    const options = await openOptions(context);
    await options.evaluate(async ({ first, second, third }) => chrome.storage.local.set({
      'ytwash:group-by-creator': true,
      'ytwash:playlist:WL': { entries: [
        { id: first, creator: 'A', key: 'a' }, { id: second, creator: 'B', key: 'b' },
        { id: third, creator: 'A', key: 'a' },
      ], indexedAt: Date.now() },
    }), { first: FIRST, second: SECOND, third });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!sessionStorage.getItem('ytwash:creator-queue:v1'))).toBe(true);
    await page.evaluate(() => {
      const controls = document.createElement('div');
      controls.innerHTML = '<button class="ytp-next-button">Next</button><div class="ytp-tooltip ytp-next-button-tooltip"><span class="ytp-tooltip-text">NEXT <span class="ytp-tooltip-keyboard-shortcut">SHIFT+N</span></span><div class="ytp-tooltip-bg" style="background-image:url(https://example.test/native.jpg)"></div></div><input id="typing">';
      document.body.append(controls);
    });
    const background = page.locator('.ytp-tooltip-bg');
    await expect(background).toHaveCSS('background-image', new RegExp(third));
    await expect(page.locator('.ytwash-next-lightning')).toHaveCount(1);
    await expect(page.locator('.ytp-tooltip-keyboard-shortcut')).toHaveText('SHIFT+N');
    await page.locator('#typing').focus();
    await page.keyboard.press('Shift+N');
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + FIRST + '&list=WL');
    await options.locator('[data-key="ytwash:group-by-creator"]').uncheck();
    await expect(background).toHaveCSS('background-image', /native.jpg/);
    await expect(page.locator('.ytwash-next-lightning')).toHaveCount(0);
    await options.locator('[data-key="ytwash:group-by-creator"]').check();
    await expect(background).toHaveCSS('background-image', new RegExp(third));
    await page.locator('.ytp-next-button').focus();
    await page.keyboard.press('Shift+N');
    await expect(page).toHaveURL('https://www.youtube.com/watch?v=' + third + '&list=WL');
  } finally { await context.close(); }
});
