#!/usr/bin/env node
/**
 * Phase 9: 曲追加・削除 / 選択済み管理 UI
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

async function runViewport(label, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.click('#accSongs .acc-head');
  await page.waitForSelector('#accSongs.open', { timeout: 5000 });

  if (errors.length) fail(`${label}: JS エラーなし`, errors.join('; '));
  else ok(`${label}: JS エラーなし`);

  // 曲を2曲選択
  await page.fill('#searchInput', 'Story');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(150);
  await page.locator('.song-check').first().check();
  await page.fill('#searchInput', 'AI');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(150);
  const checks = await page.locator('.song-check');
  const count = await checks.count();
  if (count > 0) await checks.nth(0).check();

  const selectedCount = await page.evaluate(() => selectedKeys.size);
  if (selectedCount < 1) fail(`${label}: 曲選択`, String(selectedCount));
  else ok(`${label}: 曲選択 (${selectedCount}曲)`);

  // 選択中タブ
  await page.click('#viewTabSelected');
  await page.waitForTimeout(150);

  const selectedUi = await page.evaluate(() => ({
    gyoHidden: document.getElementById('gyoRow')?.style.display === 'none',
    removeBtns: document.querySelectorAll('.song-remove-btn').length,
    selectVisibleHidden: document.getElementById('selectVisibleBtn')?.style.display === 'none',
    placeholder: document.getElementById('searchInput')?.placeholder || '',
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    toolBtnH: document.getElementById('clearVisibleBtn')?.offsetHeight || 0,
  }));

  if (!selectedUi.gyoHidden) fail(`${label}: 選択中タブで行フィルター非表示`);
  else ok(`${label}: 選択中タブで行フィルター非表示`);
  if (selectedUi.removeBtns < 1) fail(`${label}: 外すボタン表示`, String(selectedUi.removeBtns));
  else ok(`${label}: 外すボタン ${selectedUi.removeBtns}件`);
  if (!selectedUi.selectVisibleHidden) fail(`${label}: 選択中で「表示中をすべて選択」非表示`);
  else ok(`${label}: 選択中で追加系ボタン非表示`);
  if (!selectedUi.placeholder.includes('選択中')) fail(`${label}: 選択中placeholder`, selectedUi.placeholder);
  else ok(`${label}: 選択中placeholder`);
  if (selectedUi.overflow) fail(`${label}: 横スクロールなし`);
  else ok(`${label}: 横スクロールなし`);
  if (selectedUi.toolBtnH < 44) fail(`${label}: ボタン高さ44px+`, String(selectedUi.toolBtnH));
  else ok(`${label}: ボタン高さ44px+ (${selectedUi.toolBtnH}px)`);

  // 外すボタン
  const beforeRemove = await page.evaluate(() => selectedKeys.size);
  await page.locator('.song-remove-btn').first().click();
  await page.waitForTimeout(100);
  const afterRemove = await page.evaluate(() => selectedKeys.size);
  if (afterRemove >= beforeRemove) fail(`${label}: 外すボタンで選択解除`, `${beforeRemove}→${afterRemove}`);
  else ok(`${label}: 外すボタンで選択解除`);

  // すべてタブ: 行タップで選択
  await page.click('#viewTabAll');
  await page.waitForTimeout(100);
  await page.fill('#searchInput', 'Story');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(150);
  const beforeTap = await page.evaluate(() => selectedKeys.size);
  await page.evaluate(() => {
    const row = document.querySelector('.song-row.is-tappable');
    if (row) row.click();
  });
  await page.waitForTimeout(100);
  const afterTap = await page.evaluate(() => selectedKeys.size);
  if (afterTap <= beforeTap) fail(`${label}: 行タップで選択追加`, `${beforeTap}→${afterTap}`);
  else ok(`${label}: 行タップで選択追加`);

  await browser.close();
}

for (const [label, w, h] of [
  ['mobile 320', 320, 640],
  ['mobile 375', 375, 812],
  ['mobile 390', 390, 844],
  ['mobile 430', 430, 932],
  ['pc 1280', 1280, 800],
]) {
  await runViewport(label, w, h);
}

console.log(failed ? `\n${failed} failure(s)` : '\nAll Phase 9 song selection checks passed.');
process.exit(failed ? 1 : 0);
