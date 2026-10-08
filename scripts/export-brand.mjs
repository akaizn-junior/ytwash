import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
const logo = readFileSync('assets/brand/logo.svg', 'utf8');
const favicon = readFileSync('assets/brand/favicon.svg', 'utf8');
const browser = await chromium.launch({channel:'chromium', headless:true});
for (const size of [16,32,48,64,128,256,512]) {
  const page = await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100%;height:100%}</style>${size <= 32 ? favicon : logo}`);
  await page.screenshot({path:`public/icons/icon-${size}.png`,omitBackground:true});
  await page.close();
}
for (const [name,width,height] of [['store-tile',440,280],['store-marquee',1400,560],['social-preview',1200,630]]) {
  const small = width === 440;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;font-family:Arial,sans-serif}
  body{background:#ff0033;color:white;display:flex;align-items:center;padding:${small?30:80}px;gap:${small?22:64}px}
  .logo{width:${small?112:300}px;flex-shrink:0}.logo svg{width:100%;display:block}
  .copy{flex:1}h1{font-size:${small?38:88}px;letter-spacing:-3px;margin:0 0 ${small?12:24}px;line-height:1}
  p{font-size:${small?17:32}px;line-height:1.4;margin:0;max-width:720px;font-weight:500}
  .features{font-size:${small?11:17}px;letter-spacing:${small?0:1}px;margin-top:${small?18:34}px;color:#ffe4eb}
  </style></head><body><div class="logo">${logo}</div><div class="copy"><h1>YTWash</h1><p>watch it. clear it.</p><div class="features">PLAYLIST GROUPS · SAVED TIMESTAMPS</div></div></body></html>`;
  writeFileSync(`assets/brand/${name}.html`,html);
  const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.setContent(html);await page.screenshot({path:`assets/brand/${name}.png`});await page.close();
}
copyFileSync('assets/brand/favicon.svg', 'site/icons/favicon.svg');
for (const size of [16,32,48,180]) {
  const page = await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100%;height:100%}</style>${favicon}`);
  await page.screenshot({path:`site/icons/favicon-${size}.png`,omitBackground:true});await page.close();
}
// ICO container with exact-size PNG frames; no image resampling.
const frames = [16,32,48].map(size => ({size,data:readFileSync(`site/icons/favicon-${size}.png`)}));
const header = Buffer.alloc(6);header.writeUInt16LE(1,2);header.writeUInt16LE(frames.length,4);
let offset = 6 + 16 * frames.length;
const directory = frames.map(({size,data}) => {
  const entry = Buffer.alloc(16);entry[0]=size;entry[1]=size;
  entry.writeUInt16LE(1,4);entry.writeUInt16LE(32,6);entry.writeUInt32LE(data.length,8);entry.writeUInt32LE(offset,12);
  offset+=data.length;return entry;
});
writeFileSync('site/favicon.ico',Buffer.concat([header,...directory,...frames.map(frame=>frame.data)]));
await browser.close();
