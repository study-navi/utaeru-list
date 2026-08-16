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
      summary: pick('#accSummaryBasic')?.textContent?.trim() || '',
      summaryClip: clip(pick('#accSummaryBasic')),
      hintClip: clip(pick('.page-intro')),
      urlPreviewClip: clip(pick('#streamerIdPreview')),
      accSummaryClamp: getComputedStyle(pick('#accSummaryBasic')).webkitLineClamp,
    };
  });

  if (checks.namePh.includes('ひろ') || checks.namePh.includes('hiro')) {
    fail(`${label}: 配信者名placeholder`, checks.namePh);
  } else ok(`${label}: 配信者名placeholder に hiro/ひろ なし`);
  if (checks.idPh.includes('hiro')) fail(`${label}: ID placeholder`, checks.idPh);
  else ok(`${label}: ID placeholder = sample 系`);
  if (!checks.summary.includes('うたりす')) fail(`${label}: acc-summary 反映`, checks.summary);
  else ok(`${label}: acc-summary に長い配信者名`);
  if (checks.summaryClip) fail(`${label}: acc-summary 切れ`, checks.summary);
  else ok(`${label}: acc-summary 全文表示`);
  if (checks.accSummaryClamp && checks.accSummaryClamp !== 'none' && checks.accSummaryClamp !== '0') {
    fail(`${label}: acc-summary line-clamp`, checks.accSummaryClamp);
  } else ok(`${label}: acc-summary line-clamp なし`);
  if (checks.hintClip) fail(`${label}: page-intro 切れ`);
  else ok(`${label}: page-intro 全文表示`);

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
