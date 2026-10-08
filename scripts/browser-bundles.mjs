import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
const chrome = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
assert.equal(chrome.manifest_version, 3);
assert.ok(chrome.background.service_worker);
assert.equal(chrome.background.scripts, undefined);
assert.equal(chrome.browser_specific_settings, undefined);
rmSync('dist-firefox', { recursive: true, force: true });
cpSync('dist', 'dist-firefox', { recursive: true });
const firefox = { ...chrome, background: { scripts: ['background.js'], type: 'module' },
  browser_specific_settings: { gecko: { id: 'ytwash@akaizn-junior.github.io', strict_min_version: '109.0' } } };
writeFileSync('dist-firefox/manifest.json', JSON.stringify(firefox, null, 2) + '\n');
