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
  await page.click('#editTabSongs');
  await page.waitForSelector('#panelSongs:not([hidden])', { timeout: 5000 });

  if (errors.length) fail(`${label}: JS エラーなし`, errors.join('; '));
  else ok(`${label}: JS エラーなし`);

  // 曲名の長さが異なる複数曲を選択
  await page.fill('#searchInput', '');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(100);
  const pickCount = await page.evaluate(async () => {
    const picks = [];
    const seen = new Set();
    for (const song of MASTER_SONGS) {
      const key = song.a + '\u0001' + song.t;
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push(song.id);
      selectedKeys.add(key);
      if (picks.length >= 4) break;
    }
    render();
    updateSelectedCount();
    updatePreviewPanel();
    updateAccSummaries();
    return picks.length;
  });
  await page.waitForTimeout(120);
  if (pickCount < 3) fail(`${label}: 複数曲選択`, String(pickCount));
  else ok(`${label}: 複数曲選択 (${pickCount}曲)`);

  // 選択中タブ
  await page.click('#viewTabSelected');
  await page.waitForTimeout(150);

  const selectedUi = await page.evaluate(() => ({
    gyoHidden: document.getElementById('gyoRow')?.style.display === 'none',
    subHidden: document.getElementById('gyoSubRow')?.hidden || document.getElementById('gyoSubRow')?.style.display === 'none',
    removeBtns: document.querySelectorAll('.song-remove-btn').length,
    selectVisibleHidden: document.getElementById('selectVisibleBtn')?.style.display === 'none',
    placeholder: document.getElementById('searchInput')?.placeholder || '',
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    toolBtnH: document.getElementById('clearVisibleBtn')?.offsetHeight || 0,
  }));

  if (!selectedUi.gyoHidden || !selectedUi.subHidden) fail(`${label}: 選択中タブで行フィルター非表示`);
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

  const alignment = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.song-item')];
    const samples = rows.slice(0, 6).map((row) => {
      const remove = row.querySelector('.song-remove-btn');
      const settings = row.querySelector('.song-settings-btn');
      const removeRect = remove?.getBoundingClientRect();
      const settingsRect = settings?.getBoundingClientRect();
      return {
        removeRight: removeRect?.right ?? null,
        removeLeft: removeRect?.left ?? null,
        settingsRight: settingsRect?.right ?? null,
        settingsLeft: settingsRect?.left ?? null,
        settingsBeforeRemove: !!(settingsRect && removeRect && settingsRect.right <= removeRect.left + 1),
        removeHeight: removeRect?.height ?? 0,
        settingsHeight: settingsRect?.height ?? 0,
      };
    }).filter((s) => s.removeRight != null);
    const removeRights = samples.map((s) => s.removeRight);
    const removeRightSpread = removeRights.length
      ? Math.max(...removeRights) - Math.min(...removeRights)
      : 0;
    const settingsBeforeRemoveAll = samples.every((s) => s.settingsBeforeRemove);
    const heightsOk = samples.every((s) => s.removeHeight >= 44 && s.settingsHeight >= 44);
    const overlap = samples.some((s) => s.settingsRight != null && s.removeLeft != null && s.settingsRight > s.removeLeft + 1);
    return {
      count: samples.length,
      removeRightSpread,
      settingsBeforeRemoveAll,
      heightsOk,
      overlap,
      docScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (alignment.count < 3) fail(`${label}: 配置確認用の曲行`, String(alignment.count));
  else ok(`${label}: 配置確認 ${alignment.count}行`);
  if (alignment.removeRightSpread > 2) fail(`${label}: 外すボタン右端統一`, String(alignment.removeRightSpread));
  else ok(`${label}: 外すボタン右端統一 (${alignment.removeRightSpread.toFixed(1)}px)`);
  if (!alignment.settingsBeforeRemoveAll) fail(`${label}: 設定は外すの左`);
  else ok(`${label}: 設定は外すの左`);
  if (!alignment.heightsOk) fail(`${label}: 操作ボタン高さ統一`);
  else ok(`${label}: 操作ボタン高さ統一`);
  if (alignment.overlap) fail(`${label}: ボタン重なり`);
  else ok(`${label}: ボタン重なりなし`);
  if (alignment.docScroll) fail(`${label}: 選択中リスト横スクロール`);
  else ok(`${label}: 選択中リスト横スクロールなし`);

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
