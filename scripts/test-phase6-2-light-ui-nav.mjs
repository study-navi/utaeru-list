#!/usr/bin/env node
/**
 * Phase 6.2: ライトUI固定 + 見出し直接操作 + 公開ページプレビュー + state保持
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function run(label, width, height, colorScheme = 'light') {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });

  if (errors.length) fail(`${label}: JS エラーなし`, errors.join('; '));
  else ok(`${label}: JS エラーなし`);

  const branding = await page.evaluate(() => ({
    title: document.title,
    brand: document.querySelector('.utaeru-brand')?.textContent?.trim() || '',
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
  }));
  if (!branding.title.includes('Utalis')) fail(`${label}: ページタイトル Utalis`, branding.title);
  else ok(`${label}: ページタイトル Utalis`);
  if (branding.brand !== 'Utalis') fail(`${label}: ブランド表記`, branding.brand);
  else ok(`${label}: ブランド表記 Utalis`);
  if (branding.canonical !== 'https://utalis.github.io/') fail(`${label}: canonical`, branding.canonical);
  else ok(`${label}: canonical https://utalis.github.io/`);

  const chrome = await page.evaluate(() => ({
    builderLight: document.documentElement.getAttribute('data-utaeru-builder'),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    pageBg: getComputedStyle(document.body).backgroundColor,
    prev: document.querySelectorAll('.acc-prev').length,
    next: document.querySelectorAll('.acc-next').length,
    builderThemeToggle: document.querySelector('#themeToggle, .theme-toggle:not(.pv-theme-toggle)') ? 1 : 0,
    accNav: document.querySelectorAll('.acc-nav').length,
  }));

  if (chrome.builderLight !== 'light') fail(`${label}: 編集画面ライト固定`, chrome.builderLight);
  else ok(`${label}: data-utaeru-builder=light`);
  if (!chrome.colorScheme.includes('light')) fail(`${label}: color-scheme light`, chrome.colorScheme);
  else ok(`${label}: color-scheme=${chrome.colorScheme}`);
  if (colorScheme === 'dark' && chrome.pageBg !== 'rgb(245, 248, 252)') {
    fail(`${label}: OSダークでもライト背景`, chrome.pageBg);
  } else if (colorScheme === 'dark') ok(`${label}: OSダークでもライト背景`);
  if (chrome.prev !== 0 || chrome.next !== 0) fail(`${label}: 戻る/次へ0件`, `prev=${chrome.prev} next=${chrome.next}`);
  else ok(`${label}: 戻る/次へ0件`);
  if (chrome.builderThemeToggle !== 0) fail(`${label}: 編集画面テーマ切替なし`, String(chrome.builderThemeToggle));
  else ok(`${label}: 編集画面テーマ切替UIなし`);
  if (chrome.accNav !== 0) fail(`${label}: acc-navコンテナなし`, String(chrome.accNav));
  else ok(`${label}: ナビコンテナ0件`);

  await page.fill('#streamerName', 'Phase62テスト');
  await page.fill('#subtitle', 'サブタイトル確認');
  await page.fill('#streamerIdInput', 'phase62test');
  await page.dispatchEvent('#streamerIdInput', 'input');
  const previewUrl = await page.locator('#streamerIdPreview .path').textContent();
  if (previewUrl !== 'https://utalis.github.io/u/phase62test') {
    fail(`${label}: 公開URLプレビュー`, previewUrl || '(empty)');
  } else ok(`${label}: 公開URL https://utalis.github.io/u/…`);
  await page.click('#editTabSongs');
  await page.waitForTimeout(120);

  await page.fill('#searchInput', 'Story');
  await page.waitForTimeout(80);
  await page.click('.song-check');
  await page.click('#editTabDesign');
  await page.waitForTimeout(120);

  await page.click('#editTabSongs');
  await page.waitForTimeout(120);

  const afterHeadNav = await page.evaluate(() => ({
    basicOpen: !document.getElementById('panelBasic')?.hidden,
    songsOpen: !document.getElementById('panelSongs')?.hidden,
    name: document.getElementById('streamerName')?.value,
    sid: document.getElementById('streamerIdInput')?.value,
    search: document.getElementById('searchInput')?.value,
    selected: document.getElementById('selectedCount')?.textContent,
  }));

  if (!afterHeadNav.songsOpen || afterHeadNav.basicOpen) fail(`${label}: タブで曲セクション`, JSON.stringify(afterHeadNav));
  else ok(`${label}: タブで曲セクションを開く`);
  if (afterHeadNav.name !== 'Phase62テスト' || afterHeadNav.sid !== 'phase62test') fail(`${label}: 入力値保持`, JSON.stringify(afterHeadNav));
  else ok(`${label}: 配信者名/ID保持`);
  if (afterHeadNav.search !== 'Story') fail(`${label}: 検索保持`, afterHeadNav.search);
  else ok(`${label}: 検索文字保持`);
  if (afterHeadNav.selected === '0') fail(`${label}: 選択曲保持`, afterHeadNav.selected);
  else ok(`${label}: 選択曲数保持 (${afterHeadNav.selected})`);

  await page.click('#editTabBasic');
  await page.waitForTimeout(120);
  const basicOpen = await page.evaluate(() => !document.getElementById('panelBasic')?.hidden);
  if (!basicOpen) fail(`${label}: 基本情報へ戻る`);
  else ok(`${label}: タブで基本情報へ戻る`);

  await page.click('#editTabSongs');
  await page.waitForTimeout(80);
  await page.click('#editTabDesign');
  await page.waitForTimeout(80);
  await page.click('#editTabPreview');
  await page.waitForTimeout(150);

  const previewBefore = await page.evaluate(() => ({
    title: document.querySelector('#previewFrame .pv-title')?.textContent,
    subtitle: document.querySelector('#previewFrame .pv-subtitle')?.textContent,
    songStat: document.querySelector('#previewFrame .pv-header-stats strong')?.textContent,
    pageKind: document.querySelector('#previewFrame .pv-page-kind')?.textContent,
    themeToggleCount: document.querySelectorAll('#previewFrame .pv-theme-toggle, #previewFrame .theme-toggle').length,
    hasSearch: !!document.querySelector('#previewFrame .pv-search input'),
    hasSearchShell: !!document.querySelector('#previewFrame .pv-search-shell'),
    scrollW: document.getElementById('previewFrame')?.scrollWidth,
    clientW: document.getElementById('previewFrame')?.clientWidth,
  }));
  if (previewBefore.title !== 'Phase62テスト') fail(`${label}: プレビュー配信者名`, previewBefore.title);
  else ok(`${label}: プレビュー配信者名反映`);
  if (previewBefore.subtitle !== 'サブタイトル確認') fail(`${label}: プレビューサブタイトル`, previewBefore.subtitle);
  else ok(`${label}: プレビューサブタイトル反映`);
  if (previewBefore.songStat !== '1') fail(`${label}: プレビュー曲数`, previewBefore.songStat);
  else ok(`${label}: プレビュー曲数反映`);
  if (previewBefore.pageKind !== '歌える曲リスト') fail(`${label}: プレビュー見出し`, previewBefore.pageKind);
  else ok(`${label}: プレビュー見出し 歌える曲リスト`);
  if (previewBefore.themeToggleCount !== 0 || !previewBefore.hasSearch || !previewBefore.hasSearchShell) {
    fail(`${label}: プレビュー公開UI`, JSON.stringify(previewBefore));
  } else ok(`${label}: プレビュー公開UI要素（ライト固定・テーマ切替なし）`);
  if (previewBefore.scrollW > previewBefore.clientW + 2) fail(`${label}: プレビュー横スクロール`, `${previewBefore.scrollW}/${previewBefore.clientW}`);
  else ok(`${label}: プレビュー横スクロールなし`);

  await page.evaluate(() => { selectPreset(1); });
  await page.waitForTimeout(80);
  const presetAccent = await page.evaluate(() => getComputedStyle(document.getElementById('previewFrame')).getPropertyValue('--pv-accent').trim());
  if (!presetAccent || presetAccent === '#2a78d6') fail(`${label}: プリセット色プレビュー反映`, presetAccent);
  else ok(`${label}: プリセット色プレビュー反映`);

  await page.evaluate(() => { selectCustom('#ff00aa'); });
  await page.waitForTimeout(80);
  const customAccent = await page.evaluate(() => getComputedStyle(document.getElementById('previewFrame')).getPropertyValue('--pv-accent').trim());
  if (!customAccent || customAccent === presetAccent) fail(`${label}: 自由色プレビュー反映`, customAccent);
  else ok(`${label}: 自由色プレビュー反映`);

  await page.click('#editTabSongs');
  await page.waitForTimeout(80);
  await page.click('.song-check');
  await page.waitForTimeout(120);
  const previewAfterRemove = await page.evaluate(() => document.querySelector('#previewFrame .pv-header-stats strong')?.textContent);
  if (previewAfterRemove !== '0') fail(`${label}: 曲削除プレビュー反映`, previewAfterRemove);
  else ok(`${label}: 曲削除プレビュー反映`);

  const menuBtn = width <= 640 ? '#mobileMenuBtn' : '#accountMenuBtn';
  await page.click(menuBtn);
  await page.waitForSelector('#accountPanel.open', { timeout: 5000 });
  await page.waitForTimeout(80);
  const menuBtns = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#accountPanel.open .ui-btn')];
    const minHs = btns.map(b => parseFloat(getComputedStyle(b).minHeight));
    return { count: btns.length, minH: minHs.length ? Math.min(...minHs) : 0 };
  });
  if (menuBtns.count < 4) fail(`${label}: アカウントメニューボタン`, String(menuBtns.count));
  else if (menuBtns.minH < 44) fail(`${label}: メニューボタン高さ`, String(menuBtns.minH));
  else ok(`${label}: メニューボタン ${menuBtns.count}件・高さ${menuBtns.minH}px+`);

  await context.close();
  await browser.close();
}

await run('mobile', 390, 844);
await run('mobile-dark', 390, 844, 'dark');
await run('pc', 1280, 800);
await run('pc-dark', 1280, 800, 'dark');

if (failed) {
  console.error(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
