#!/usr/bin/env node
/**
 * 編集画面・公開ページの文字切れ（ellipsis / line-clamp）回帰テスト
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function isClipped(el) {
  if (!el) return true;
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
}

async function checkBuilderPlaceholders(label, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });

  const basicIds = ['streamerName', 'subtitle', 'streamerIdInput'];
  const basicResults = await page.evaluate((inputIds) => {
    function placeholderFits(input) {
      if (!input || !input.placeholder) return { ok: true, ph: '' };
      if (input.clientWidth < 1) return { ok: false, ph: input.placeholder, reason: 'not_visible' };
      const style = getComputedStyle(input);
      const span = document.createElement('span');
      span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;';
      span.style.font = style.font;
      span.textContent = input.placeholder;
      document.body.appendChild(span);
      const textWidth = span.offsetWidth;
      span.remove();
      const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const available = input.clientWidth - pad;
      const fits = textWidth <= available + 1;
      return { ok: fits, ph: input.placeholder, textWidth, available };
    }
    return inputIds.map((id) => {
      const el = document.getElementById(id);
      const r = placeholderFits(el);
      return { id, ...r };
    });
  }, basicIds);

  for (const r of basicResults) {
    if (!r.ok) fail(`${label} ${width}px: #${r.id} placeholder 切れ`, r.ph);
    else ok(`${label} ${width}px: #${r.id} placeholder 全文 (${r.ph})`);
  }

  await page.click('#editTabSongs');
  await page.waitForSelector('#panelSongs:not([hidden])', { state: 'visible', timeout: 5000 });

  const searchResult = await page.evaluate(() => {
    function placeholderFits(input) {
      if (!input || !input.placeholder) return { ok: true, ph: '' };
      if (input.clientWidth < 1) return { ok: false, ph: input.placeholder, reason: 'not_visible' };
      const style = getComputedStyle(input);
      const span = document.createElement('span');
      span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;';
      span.style.font = style.font;
      span.textContent = input.placeholder;
      document.body.appendChild(span);
      const textWidth = span.offsetWidth;
      span.remove();
      const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const available = input.clientWidth - pad;
      const fits = textWidth <= available + 1;
      return { ok: fits, ph: input.placeholder };
    }
    const el = document.getElementById('searchInput');
    const r = placeholderFits(el);
    return { id: 'searchInput', ...r };
  });

  if (!searchResult.ok) fail(`${label} ${width}px: #${searchResult.id} placeholder 切れ`, searchResult.ph);
  else ok(`${label} ${width}px: #${searchResult.id} placeholder 全文 (${searchResult.ph})`);

  const subtitleHint = await page.evaluate(() => {
    const el = document.querySelector('#subtitle + .field-input-hint');
    if (!el) return { missing: true };
    return {
      missing: false,
      text: el.textContent.trim(),
      clip: el.scrollHeight > el.clientHeight + 1,
    };
  });
  if (subtitleHint.missing) fail(`${label} ${width}px: subtitle 補足なし`);
  else if (subtitleHint.clip) fail(`${label} ${width}px: subtitle 補足 切れ`, subtitleHint.text);
  else ok(`${label} ${width}px: subtitle 補足 全文`);

  const subPh = await page.evaluate(() => document.getElementById('subtitle')?.getAttribute('placeholder') || '');
  if (subPh !== '例：リクエスト歓迎！') fail(`${label} ${width}px: subtitle placeholder 文言`, subPh);
  else ok(`${label} ${width}px: subtitle placeholder 短文化`);

  await browser.close();
}

async function checkBuilder(label, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });

  const longName = 'うたりすさんのとても長い配信者名サンプルテスト';
  await page.fill('#streamerName', longName);
  await page.fill('#streamerIdInput', 'sample-demo-id');
  await page.dispatchEvent('#streamerIdInput', 'input');
  await page.waitForTimeout(120);

  const checks = await page.evaluate(() => {
    const pick = (sel) => document.querySelector(sel);
    const clip = (el) => {
      if (!el) return true;
      const style = getComputedStyle(el);
      if (style.overflow === 'hidden' && (style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none')) {
        return true;
      }
      return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    };
    return {
      namePh: pick('#streamerName')?.getAttribute('placeholder') || '',
      idPh: pick('#streamerIdInput')?.getAttribute('placeholder') || '',
      nameVal: pick('#streamerName')?.value || '',
      basicBadge: pick('#tabBadgeBasic')?.textContent?.trim() || '',
      basicBadgeHidden: pick('#tabBadgeBasic')?.hidden,
      urlPreviewClip: clip(pick('#streamerIdPreview')),
    };
  });

  if (checks.namePh.includes('ひろ') || checks.namePh.includes('hiro')) {
    fail(`${label}: 配信者名placeholder`, checks.namePh);
  } else ok(`${label}: 配信者名placeholder に hiro/ひろ なし`);
  if (checks.idPh.includes('hiro')) fail(`${label}: ID placeholder`, checks.idPh);
  else ok(`${label}: ID placeholder = sample 系`);
  if (checks.nameVal !== longName) fail(`${label}: 配信者名入力 全文`, checks.nameVal);
  else ok(`${label}: 配信者名入力 全文`);
  if (checks.basicBadge !== '✓' || checks.basicBadgeHidden) fail(`${label}: 基本情報タブ ✓`, checks.basicBadge);
  else ok(`${label}: 基本情報タブ ✓`);
  if (checks.urlPreviewClip) fail(`${label}: URLプレビュー 切れ`);
  else ok(`${label}: URLプレビュー 全文表示`);

  const menuBtn = width < 641 ? '#mobileMenuBtn' : '#accountMenuBtn';
  await page.click(menuBtn);
  await page.waitForSelector('#accountPanel.open', { timeout: 5000 });
  const leadClip = await page.evaluate(() => {
    const el = document.querySelector('#accountPanel .account-lead');
    return el ? el.scrollHeight > el.clientHeight + 1 : false;
  });
  if (leadClip) fail(`${label}: account-lead 切れ`);
  else ok(`${label}: account-lead 全文表示`);

  if (errors.length) fail(`${label}: JSエラー`, errors.join('; '));
  else ok(`${label}: JSエラーなし`);

  await browser.close();
}

async function checkPublic(url, label, width) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent && document.getElementById('statSongs').textContent !== '-', { timeout: 30000 });

  const data = await page.evaluate(() => ({
    h1: document.getElementById('streamerName')?.textContent?.trim(),
    titleClip: (() => {
      const el = document.querySelector('.song-title');
      if (!el) return false;
      return el.scrollWidth > el.clientWidth + 1;
    })(),
    searchPh: document.getElementById('searchInput')?.getAttribute('placeholder') || '',
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));

  if (label === 'utalis' && data.h1 !== 'ひろ') fail(`${label} ${width}px: hiro実データ`, data.h1);
  else if (label === 'utalis') ok(`${label} ${width}px: hiro実データ維持 (${data.h1})`);
  if (data.searchPh.includes('hiro')) fail(`${label}: 検索placeholder`, data.searchPh);
  else if (data.searchPh.includes('Story')) ok(`${label} ${width}px: 検索placeholder 汎用サンプル`);
  if (data.scrollW > data.clientW + 2) fail(`${label} ${width}px: 横スクロール`, `${data.scrollW}/${data.clientW}`);
  else ok(`${label} ${width}px: 横スクロールなし`);

  await browser.close();
}

await checkBuilderPlaceholders('mobile', 320, 844);
for (const w of [375, 390, 430]) {
  await checkBuilderPlaceholders('mobile', w, 844);
}
await checkBuilderPlaceholders('pc', 1280, 900);
await checkBuilder('mobile', 390, 844);
await checkBuilder('pc', 1280, 900);
for (const w of [320, 375, 390, 430]) {
  await checkPublic('https://utalis.github.io/u/hiro', 'utalis', w);
}

console.log('');
if (failed) {
  console.error(`${failed} 件失敗`);
  process.exit(1);
}
console.log('すべて成功');
