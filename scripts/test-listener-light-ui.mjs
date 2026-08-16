#!/usr/bin/env node
/**
 * リスナー向け公開ページ（/u/{streamerId}）ライトUI回帰テスト
 */
import { chromium } from 'playwright-core';

const URLS = [
  'https://utalis.github.io/u/hiro',
  'https://study-navi.github.io/utaeru-list/u/hiro',
];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function checkViewport(page, label, width, height) {
  await page.setViewportSize({ width, height });
  const data = await page.evaluate(() => {
    const root = document.documentElement;
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const pageBg = getComputedStyle(root).getPropertyValue('--page').trim();
    return {
      viewerLight: root.getAttribute('data-utalis-viewer'),
      colorScheme: getComputedStyle(root).colorScheme,
      themeToggle: document.querySelectorAll('#themeToggle, .theme-toggle').length,
      pageKind: document.querySelector('.page-kind')?.textContent?.trim(),
      statSongs: document.getElementById('statSongs')?.textContent?.trim(),
      h1: document.getElementById('streamerName')?.textContent?.trim(),
      searchShell: !!document.querySelector('.search-shell'),
      searchHeight: document.getElementById('searchInput')?.offsetHeight || 0,
      artistBlocks: document.querySelectorAll('.artist-block').length,
      artistCards: document.querySelectorAll('.artist-group').length,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      bodyBg,
      pageBg,
    };
  });

  if (data.statSongs !== '13') fail(`${label} ${width}px: hiro 13曲`, data.statSongs);
  else ok(`${label} ${width}px: hiro 13曲`);
  if (data.h1 !== 'ひろ') fail(`${label} ${width}px: 配信者名`, data.h1);
  else ok(`${label} ${width}px: 配信者名 ひろ`);
  if (data.pageKind !== '歌える曲リスト') fail(`${label} ${width}px: 見出し`, data.pageKind);
  else ok(`${label} ${width}px: 見出し 歌える曲リスト`);
  if (data.themeToggle !== 0) fail(`${label} ${width}px: テーマ切替なし`, String(data.themeToggle));
  else ok(`${label} ${width}px: テーマ切替UIなし`);
  if (data.viewerLight !== 'light') fail(`${label} ${width}px: data-utalis-viewer=light`, data.viewerLight);
  else ok(`${label} ${width}px: ライト固定`);
  if (!data.searchShell || data.searchHeight < 44) fail(`${label} ${width}px: 検索欄`, `${data.searchShell}/${data.searchHeight}`);
  else ok(`${label} ${width}px: 検索欄 44px+`);
  if (data.artistCards !== 0) fail(`${label} ${width}px: 旧カードUIなし`, String(data.artistCards));
  else ok(`${label} ${width}px: 軽量アーティスト一覧`);
  if (data.artistBlocks < 1) fail(`${label} ${width}px: artist-block`, String(data.artistBlocks));
  if (data.scrollW > data.clientW + 2) fail(`${label} ${width}px: 横スクロール`, `${data.scrollW}/${data.clientW}`);
  else ok(`${label} ${width}px: 横スクロールなし`);
  if (data.pageBg !== '#f6f6f4') fail(`${label} ${width}px: ページ背景`, data.pageBg);
  else ok(`${label} ${width}px: ページ背景 #f6f6f4`);
}

async function runUrl(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent === '13', { timeout: 30000 });

  const label = url.includes('utalis.github.io') ? 'utalis' : 'study-navi';
  for (const w of [320, 375, 390, 430, 1280]) {
    await checkViewport(page, label, w, w <= 430 ? 844 : 900);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.fill('#searchInput', 'シド');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(300);
  const searchMeta = await page.locator('#resultMeta').textContent();
  if (!searchMeta || searchMeta.startsWith('0曲')) fail(`${label}: 検索`, searchMeta?.trim());
  else ok(`${label}: 検索 シド → ${searchMeta.trim()}`);

  await page.fill('#searchInput', '');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(200);

  await page.click('#randomBtn');
  await page.waitForTimeout(150);
  const randomVisible = await page.evaluate(() => getComputedStyle(document.getElementById('randomPick')).display !== 'none');
  if (!randomVisible) fail(`${label}: ランダム`, 'randomPick hidden');
  else ok(`${label}: ランダム表示`);

  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  if (!accent || accent === '') fail(`${label}: アクセントカラー`, accent);
  else ok(`${label}: アクセントカラー ${accent}`);

  const filtered = errors.filter((e) => {
    if (e.includes('/api/auth/me')) return false;
    if (e.includes('status of 404')) return false;
    return true;
  });
  if (filtered.length) fail(`${label}: Consoleエラー`, filtered.join('; '));
  else ok(`${label}: Consoleエラー0（想定外）`);

  await browser.close();
}

for (const url of URLS) {
  console.log(`\n=== ${url} ===`);
  await runUrl(url);
}

console.log('');
if (failed) {
  console.error(`${failed} 件失敗`);
  process.exit(1);
}
console.log('すべて成功');
