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
// Expose only the temporary add-on's options URL to the local test fixture.
writeFileSync(join(bundle, 'content.js'), readFileSync(join(bundle, 'content.js'), 'utf8') + '\ndocument.documentElement.dataset.ytwashOptionsUrl = chrome.runtime.getURL(\"options.html\");');
const addon = join(temp, 'test-addon.zip');
execFileSync('zip', ['-q', '-r', addon, '.'], { cwd: bundle });
const playlist = '<!doctype html><html><body>' +
  '<ytd-playlist-video-renderer><a id="video-title" href="/watch?v=' + first + '">First video</a><ytd-channel-name><a href="/channel/UCcreator1">Example Creator</a></ytd-channel-name></ytd-playlist-video-renderer>' +
  '<ytd-playlist-video-renderer><a id="video-title" href="/watch?v=' + second + '">Second video</a><ytd-channel-name><a href="/channel/UCcreator1">Example Creator</a></ytd-channel-name></ytd-playlist-video-renderer>' +
  '</body></html>';
const watch = '<!doctype html><html><body>' +
  '<ytd-watch-metadata><div id="actions"><button aria-label="Save">Save</button></div></ytd-watch-metadata>' +
  '<video class="html5-main-video" muted preload="auto" src="/fixtures/mock-video.webm"></video>' +
  '<script>document.querySelector("button").addEventListener("click",()=>{' +
  'document.body.dataset.saveOpened="true";if(document.getElementById("picker"))return;' +
  'const picker=document.createElement("ytd-add-to-playlist-renderer");picker.id="picker";' +
  "picker.innerHTML='<span id=\"label\">Watch Later</span><input type=\"checkbox\" aria-label=\"Watch Later\">';" +
  'picker.querySelector("input").addEventListener("change",()=>{document.body.dataset.removed=String(!picker.querySelector("input").checked);});' +
  'document.body.append(picker);});</script></body></html>';
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
  const grouping = await driver.wait(until.elementLocated(By.css('#ytwash-grouping-toggle')), 15000);
  assert.equal(await grouping.getText(), 'Group by creator');
  assert.equal((await driver.findElements(By.css('.ytwash-native-group'))).length, 0);
  await grouping.click();
  const group = await driver.wait(until.elementLocated(By.css('.ytwash-native-group')), 15000);
  assert.equal(await group.getAttribute('aria-label'), 'Example Creator · 2 videos');
  assert.equal((await driver.findElements(By.css('.ytwash-native-group ytd-playlist-video-renderer'))).length, 2);
  assert.equal((await driver.findElements(By.css('.ytwash-native-group button'))).length, 0);
  assert.equal((await driver.findElements(By.css('#ytwash-native-controls'))).length, 0);
  console.log('PASS Firefox: grouping starts on request');
  
  await driver.get(origin + '/watch?v=' + first);
  await driver.wait(until.elementLocated(By.css('.ytwash-save-lightning')), 15000);
  assert.equal((await driver.findElements(By.css('#ytwash-save-position, #ytwash-auto-remove-toggle'))).length, 0);
  const optionsUrl = await driver.executeScript('return document.documentElement.dataset.ytwashOptionsUrl');
  await driver.get(optionsUrl);
  await driver.wait(until.elementIsEnabled(await driver.findElement(By.css('#preferences'))), 10000);
  const cleanup = await driver.findElement(By.css('[data-key="ytwash:auto-remove-completed"]'));
  assert.equal(await cleanup.isSelected(), false);
  await cleanup.click();
  await driver.wait(async () => (await driver.findElement(By.css('#status')).getText()) === 'Preferences saved.', 5000);
  await driver.get(origin + '/watch?v=' + first);
  await driver.wait(until.elementLocated(By.css('.ytwash-save-lightning')), 15000);
  const playbackError = await driver.executeAsyncScript(
    "const done=arguments[arguments.length-1];const v=document.querySelector('video');v.muted=true;v.play().then(()=>done(null)).catch(e=>done(String(e)))"
  );
  if (playbackError) throw new Error(String(playbackError));
  await driver.wait(async () => (await driver.executeScript("return document.querySelector('video').currentTime")) > 6, 15000);
  await driver.executeScript("document.querySelector('video').dispatchEvent(new Event('ended'))");
  await driver.wait(async () => (await driver.executeScript("return document.body.dataset.saveOpened === 'true'")), 7000);
  assert.equal(await driver.findElement(By.css('#picker input')).isSelected(), false);
  assert.notEqual(await driver.executeScript('return document.body.dataset.removed'), 'true');
  console.log('PASS Firefox: options-driven fail-closed automatic cleanup');
  await driver.findElement(By.css('button[aria-label="Save"]')).click();
  await driver.wait(async () => (await driver.findElement(By.css('#picker input'))).isSelected(), 5000);
  console.log('PASS Firefox: native Save adds Watch Later');
} finally {
  if (driver) await driver.quit();
  await new Promise(resolveClose => server.close(resolveClose));
  rmSync(temp, { recursive: true, force: true });
}
