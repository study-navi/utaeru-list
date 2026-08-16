#!/usr/bin/env node
/**
 * Phase 6.2: ライトUI + 次へ導線 + 公開ページプレビュー + state保持
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

async function run(label, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });

  if (errors.length) fail(`${label}: JS エラーなし`, errors.join('; '));
  else ok(`${label}: JS エラーなし`);

  const light = await page.evaluate(() => document.documentElement.getAttribute('data-utaeru-builder'));
  if (light !== 'light') fail(`${label}: 編集画面ライト固定`, light);
  else ok(`${label}: data-utaeru-builder=light`);

  const prevCount = await page.evaluate(() => document.querySelectorAll('.acc-prev').length);
  if (prevCount !== 0) fail(`${label}: 戻るボタンなし`, String(prevCount));
  else ok(`${label}: 戻るボタン0件`);

  const nextCount = await page.evaluate(() => document.querySelectorAll('.acc-next').length);
  if (nextCount < 3) fail(`${label}: 次へボタン`, String(nextCount));
  else ok(`${label}: 次へ${nextCount}件`);

  if (width <= 420) {
    const nextFull = await page.evaluate(() => {
      const el = document.querySelector('.acc-nav .acc-next');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const nav = el.closest('.acc-nav')?.getBoundingClientRect();
      return nav ? r.width >= nav.width * 0.95 : false;
    });
    if (!nextFull) fail(`${label}: 次へボタン全幅`);
    else ok(`${label}: 次へボタン全幅`);
  }

  await page.fill('#streamerName', 'Phase62テスト');
  await page.fill('#subtitle', 'サブタイトル確認');
  await page.fill('#streamerIdInput', 'phase62test');
  await page.click('[data-next="songs"]');
  await page.waitForTimeout(120);

  await page.fill('#searchInput', 'Story');
  await page.waitForTimeout(80);
  await page.click('.song-check');
  await page.click('[data-next="design"]');
  await page.waitForTimeout(120);

  await page.click('#accSongs .acc-head');
  await page.waitForTimeout(120);

  const afterHeadNav = await page.evaluate(() => ({
    basicOpen: document.getElementById('accBasic')?.classList.contains('open'),
    songsOpen: document.getElementById('accSongs')?.classList.contains('open'),
    name: document.getElementById('streamerName')?.value,
    sid: document.getElementById('streamerIdInput')?.value,
    search: document.getElementById('searchInput')?.value,
    selected: document.getElementById('selectedCount')?.textContent,
  }));

  if (!afterHeadNav.songsOpen || afterHeadNav.basicOpen) fail(`${label}: 見出しで曲セクション`, JSON.stringify(afterHeadNav));
  else ok(`${label}: 見出しで曲セクションを開く`);
  if (afterHeadNav.name !== 'Phase62テスト' || afterHeadNav.sid !== 'phase62test') fail(`${label}: 入力値保持`, JSON.stringify(afterHeadNav));
  else ok(`${label}: 配信者名/ID保持`);
  if (afterHeadNav.search !== 'Story') fail(`${label}: 検索保持`, afterHeadNav.search);
  else ok(`${label}: 検索文字保持`);
  if (afterHeadNav.selected === '0') fail(`${label}: 選択曲保持`, afterHeadNav.selected);
  else ok(`${label}: 選択曲数保持 (${afterHeadNav.selected})`);

  await page.click('#accBasic .acc-head');
  await page.waitForTimeout(120);
  const basicOpen = await page.evaluate(() => document.getElementById('accBasic')?.classList.contains('open'));
  if (!basicOpen) fail(`${label}: 基本情報へ戻る`);
  else ok(`${label}: 見出しで基本情報へ戻る`);

  await page.click('[data-next="songs"]');
  await page.waitForTimeout(80);
  await page.click('[data-next="design"]');
  await page.waitForTimeout(80);
  await page.click('[data-next="preview"]');
  await page.waitForTimeout(150);

  const previewBefore = await page.evaluate(() => ({
    title: document.querySelector('#previewFrame .pv-title')?.textContent,
    subtitle: document.querySelector('#previewFrame .pv-subtitle')?.textContent,
    songs: document.querySelector('#previewFrame .pv-stat-num')?.textContent,
    hasSearch: !!document.querySelector('#previewFrame .pv-search input'),
    hasRandom: !!document.querySelector('#previewFrame .pv-random-btn'),
    scrollW: document.getElementById('previewFrame')?.scrollWidth,
    clientW: document.getElementById('previewFrame')?.clientWidth,
  }));
  if (previewBefore.title !== 'Phase62テスト') fail(`${label}: プレビュー配信者名`, previewBefore.title);
  else ok(`${label}: プレビュー配信者名反映`);
  if (previewBefore.subtitle !== 'サブタイトル確認') fail(`${label}: プレビューサブタイトル`, previewBefore.subtitle);
  else ok(`${label}: プレビューサブタイトル反映`);
  if (previewBefore.songs !== '1') fail(`${label}: プレビュー曲数`, previewBefore.songs);
  else ok(`${label}: プレビュー曲数反映`);
  if (!previewBefore.hasSearch || !previewBefore.hasRandom) fail(`${label}: プレビュー公開UI`, JSON.stringify(previewBefore));
  else ok(`${label}: プレビュー公開UI要素`);
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

  await page.click('#accSongs .acc-head');
  await page.waitForTimeout(80);
  await page.click('.song-check');
  await page.waitForTimeout(120);
  const previewAfterRemove = await page.evaluate(() => document.querySelector('#previewFrame .pv-stat-num')?.textContent);
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

  await browser.close();
}

await run('mobile', 390, 844);
await run('pc', 1280, 800);

if (failed) {
  console.error(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
