import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const first = 'abcdefghijk', second = 'lmnopqrstuv';
const temp = mkdtempSync(join(tmpdir(), 'ytwash-firefox-'));
const bundle = join(temp, 'extension');
cpSync(resolve('dist'), bundle, { recursive: true });
const manifestPath = join(bundle, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
// Test-only origin: never written to dist or the production manifest.
manifest.content_scripts[0].matches.push('http://127.0.0.1/*');
manifest.host_permissions.push('http://127.0.0.1/*');
writeFileSync(manifestPath, JSON.stringify(manifest));
const addon = join(temp, 'test-addon.zip');
execFileSync('zip', ['-q', '-r', addon, '.'], { cwd: bundle });
const playlist = '<!doctype html><html><body>' +
  '<ytd-playlist-video-renderer><a id="video-title" href="/watch?v=' + first + '">First video</a><ytd-channel-name><a href="/channel/UCcreator1">Example Creator</a></ytd-channel-name></ytd-playlist-video-renderer>' +
  '<ytd-playlist-video-renderer><a id="video-title" href="/watch?v=' + second + '">Second video</a><ytd-channel-name><a href="/channel/UCcreator1">Example Creator</a></ytd-channel-name></ytd-playlist-video-renderer>' +
  '</body></html>';
const watch = '<!doctype html><html><body>' +
  '<ytd-watch-metadata><div id="actions"><button aria-label="Save">Save</button></div></ytd-watch-metadata>' +
  '<video class="html5-main-video" muted preload="auto" src="/fixtures/mock-video.webm"></video></body></html>';
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/fixtures/mock-video.webm') {
    res.writeHead(200, { 'Content-Type': 'video/webm' });
    res.end(readFileSync(resolve('tests/fixtures/mock-video.webm')));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(url.pathname === '/watch' ? watch : playlist);
  }
});
let driver;
try {
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server did not bind');
  const origin = 'http://127.0.0.1:' + address.port;
  driver = await new Builder().forBrowser('firefox')
    .setFirefoxOptions(new firefox.Options().addArguments('-headless')).build();
  await driver.installAddon(addon, true);
  await driver.get(origin + '/playlist?list=WL');
  const controls = await driver.wait(until.elementLocated(By.css('#ytwash-native-controls')), 15000);
  await driver.wait(async () => (await controls.getText()).includes('Group by creator (1)'), 15000);
  const groups = await driver.findElements(By.css('.ytwash-native-group'));
  assert.equal(groups.length, 1, 'Only creators with two or more videos are grouped');
  assert.match(await groups[0].getText(), /Example Creator · 2 videos/);
  assert.equal((await driver.findElements(By.css('ytd-playlist-video-renderer'))).length, 2, 'Native playlist rows retained');
  const groupToggle = await driver.findElement(By.css('.ytwash-native-group button[aria-expanded]'));
  await groupToggle.click();
  await driver.wait(async () => (await driver.findElements(By.css('ytd-playlist-video-renderer:not([style*="display: none"])'))).length === 0, 8000);
  await groupToggle.click();
  await driver.wait(async () => (await driver.findElements(By.css('ytd-playlist-video-renderer:not([style*="display: none"])'))).length === 2, 8000);
  console.log('PASS Firefox: native creator grouping, toggle, and original rows');

  const play = By.css('.ytwash-native-group button[aria-label="Play all indexed Watch Later videos from Example Creator"]');
  await driver.findElement(play).click();
  await driver.wait(until.urlContains('/watch?v=' + first), 12000);
  await driver.wait(until.elementLocated(By.css('#ytwash-playback-label')), 12000);
  await driver.executeScript("document.querySelector('video').dispatchEvent(new Event('ended'))");
  await driver.wait(until.urlContains('/watch?v=' + second), 12000);
  console.log('PASS Firefox: sequential creator playback');

  await driver.get(origin + '/watch?v=' + first);
  const toggle = await driver.wait(until.elementLocated(By.css('#ytwash-auto-remove-toggle')), 15000);
  if (!(await toggle.isSelected())) await toggle.click();
  await driver.wait(async () => (await driver.findElement(By.css('#ytwash-auto-remove-message')).getText()).includes('enabled'), 6000);
  const playbackError = await driver.executeAsyncScript(
    "const done=arguments[arguments.length-1];const v=document.querySelector('video');v.muted=true;v.play().then(()=>done(null)).catch(e=>done(String(e)))"
  );
  if (playbackError) throw new Error(String(playbackError));
  await driver.wait(async () => (await driver.executeScript("return document.querySelector('video').currentTime")) > 6, 15000);
  await driver.executeScript("document.querySelector('video').dispatchEvent(new Event('ended'))");
  await driver.wait(async () => (await driver.findElement(By.css('#ytwash-auto-remove-message')).getText()).includes('nothing removed'), 7000);
  console.log('PASS Firefox: fail-closed automatic cleanup');
} finally {
  if (driver) await driver.quit();
  await new Promise(resolveClose => server.close(resolveClose));
  rmSync(temp, { recursive: true, force: true });
}
