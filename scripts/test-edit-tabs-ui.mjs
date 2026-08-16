#!/usr/bin/env node
/**
 * Utalis v1.0: 編集画面横タブ UI 回帰テスト
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

const TAB_IDS = {
  basic: 'editTabBasic',
  songs: 'editTabSongs',
  design: 'editTabDesign',
  preview: 'editTabPreview',
  more: 'editTabMore',
};

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function switchTab(page, tab) {
  await page.click(`#${TAB_IDS[tab]}`);
  await page.waitForTimeout(100);
}

async function runViewport(label, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });

  if (errors.length) fail(`${label}: JSエラー`, errors.join('; '));
  else ok(`${label}: JSエラーなし`);

  const init = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.edit-panel')];
    const visible = panels.filter((p) => !p.hidden);
    return {
      tagline: !!document.querySelector('.brand-tagline'),
      note: !!document.querySelector('.brand-note'),
      tablist: document.querySelector('.edit-tabs')?.getAttribute('role'),
      basicSelected: document.getElementById('editTabBasic')?.getAttribute('aria-selected'),
      basicVisible: !document.getElementById('panelBasic')?.hidden,
      songsHidden: document.getElementById('panelSongs')?.hidden,
      visiblePanelCount: visible.length,
      visibleId: visible[0]?.id || '',
      publishBtn: !!document.getElementById('publishBtn'),
      docScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      tabScroll: document.querySelector('.edit-tabs')?.scrollWidth > document.querySelector('.edit-tabs')?.clientWidth,
      tabFont: parseFloat(getComputedStyle(document.querySelector('.edit-tab')).fontSize),
    };
  });

  if (init.tagline || init.note) fail(`${label}: キャッチコピーなし`);
  else ok(`${label}: キャッチコピー削除`);
  if (init.tablist !== 'tablist') fail(`${label}: role=tablist`, init.tablist);
  else ok(`${label}: role=tablist`);
  if (init.basicSelected !== 'true' || !init.basicVisible || !init.songsHidden) {
    fail(`${label}: 初期状態=基本情報`, JSON.stringify(init));
  } else ok(`${label}: 初期状態=基本情報`);
  if (init.visiblePanelCount !== 1 || init.visibleId !== 'panelBasic') {
    fail(`${label}: 1パネルのみ表示`, `${init.visiblePanelCount}:${init.visibleId}`);
  } else ok(`${label}: 1パネルのみ表示`);
  if (!init.publishBtn) fail(`${label}: 公開ボタン維持`);
  else ok(`${label}: 公開ボタン維持`);
  if (init.docScroll || init.tabScroll) fail(`${label}: 横スクロールなし`, JSON.stringify(init));
  else ok(`${label}: 横スクロールなし`);
  if (init.tabFont < 12) fail(`${label}: タブ文字サイズ`, String(init.tabFont));
  else ok(`${label}: タブ文字サイズ ${init.tabFont}px`);

  for (const tab of ['songs', 'design', 'preview', 'more', 'basic']) {
    await switchTab(page, tab);
    const state = await page.evaluate((expectedId) => {
      const visible = [...document.querySelectorAll('.edit-panel')].filter((p) => !p.hidden);
      return {
        visibleCount: visible.length,
        visibleId: visible[0]?.id || '',
        selected: document.querySelector('.edit-tab.active')?.dataset.tab || '',
      };
    }, `panel${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    const expectedId = `panel${tab.charAt(0).toUpperCase() + tab.slice(1)}`;
    if (state.visibleCount !== 1 || state.visibleId !== expectedId || state.selected !== tab) {
      fail(`${label}: タブ切替 ${tab}`, JSON.stringify(state));
    } else ok(`${label}: タブ切替 ${tab}`);
  }

  await page.fill('#streamerName', 'タブ保持テスト');
  await page.fill('#subtitle', '長い一言サブタイトルの表示確認用テキスト');
  await switchTab(page, 'songs');
  await page.fill('#searchInput', 'Story');
  await page.waitForTimeout(80);
  await page.click('.song-check');
  await switchTab(page, 'design');
  await page.evaluate(() => { selectPreset(1); });
  await switchTab(page, 'preview');
  await switchTab(page, 'basic');

  const preserved = await page.evaluate(() => ({
    name: document.getElementById('streamerName')?.value,
    search: document.getElementById('searchInput')?.value,
    selected: document.getElementById('selectedCount')?.textContent,
  }));
  await switchTab(page, 'songs');
  if (preserved.name !== 'タブ保持テスト') fail(`${label}: 入力state保持`, preserved.name);
  else ok(`${label}: 入力state保持`);
  if (preserved.search !== 'Story') fail(`${label}: 検索文字保持`, preserved.search);
  else ok(`${label}: 検索文字保持`);
  if (preserved.selected === '0') fail(`${label}: 曲選択保持`, preserved.selected);
  else ok(`${label}: 曲選択保持 (${preserved.selected})`);

  await switchTab(page, 'preview');
  const preview = await page.evaluate(() => ({
    title: document.querySelector('#previewFrame .pv-title')?.textContent,
    accent: getComputedStyle(document.getElementById('previewFrame')).getPropertyValue('--pv-accent').trim(),
  }));
  if (preview.title !== 'タブ保持テスト') fail(`${label}: プレビュー更新`, preview.title);
  else ok(`${label}: プレビュー更新`);
  if (!preview.accent) fail(`${label}: デザイン保持`);
  else ok(`${label}: デザイン保持`);

  await switchTab(page, 'more');
  const moreHeading = await page.locator('.edit-panel-heading').textContent();
  if (!moreHeading?.includes('その他・データ管理')) fail(`${label}: •••タブ`, moreHeading || '');
  else ok(`${label}: •••タブ → その他・データ管理`);

  await browser.close();
}

for (const [label, width] of [
  ['320px', 320],
  ['375px', 375],
  ['390px', 390],
  ['430px', 430],
  ['PC1280', 1280],
]) {
  await runViewport(label, width, 844);
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll edit-tabs UI checks passed.');
