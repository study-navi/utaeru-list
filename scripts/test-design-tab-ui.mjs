#!/usr/bin/env node
/**
 * Utalis v1.0: デザインタブ UI（テーマカラー選択・小見本・タブ✓なし）
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

async function runViewport(label, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof selectPreset === 'function', { timeout: 15000 });

  await page.click('#editTabDesign');
  await page.waitForTimeout(120);

  const tabState = await page.evaluate(() => {
    const designTab = document.getElementById('editTabDesign');
    const badge = document.getElementById('tabBadgeDesign');
    const tabText = designTab?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      badgeHidden: badge?.hidden ?? true,
      badgeText: badge?.textContent?.trim() || '',
      tabText,
      hasCheckInTab: tabText.includes('✓'),
      docScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      panelScroll: document.getElementById('panelDesign')?.scrollWidth > document.getElementById('panelDesign')?.clientWidth,
    };
  });

  if (tabState.hasCheckInTab || !tabState.badgeHidden) {
    fail(`${label}: デザインタブに✓なし`, JSON.stringify(tabState));
  } else ok(`${label}: デザインタブに✓なし`);
  if (tabState.docScroll || tabState.panelScroll) {
    fail(`${label}: 横スクロールなし`, JSON.stringify(tabState));
  } else ok(`${label}: 横スクロールなし`);

  const preset1 = await page.evaluate(() => {
    selectPreset(1);
    const theme = resolveTheme();
    const mini = document.getElementById('themeMiniPreview');
    const hex = document.getElementById('themeCurrentHex')?.textContent?.trim();
    const selected = document.querySelector('#swatchPresets .swatch.selected');
    const style = selected ? getComputedStyle(selected) : null;
    return {
      accent: theme.light.toUpperCase(),
      hex,
      tmAccent: mini ? getComputedStyle(mini).getPropertyValue('--tm-accent').trim().toUpperCase() : '',
      selectedScale: style?.transform || '',
      hasCheck: !!selected?.querySelector('.check'),
    };
  });

  if (preset1.hasCheck) fail(`${label}: スウォッチに✓なし`);
  else ok(`${label}: スウォッチに✓なし`);
  if (preset1.hex !== preset1.accent || preset1.tmAccent !== preset1.accent) {
    fail(`${label}: プリセット即時反映`, JSON.stringify(preset1));
  } else ok(`${label}: プリセット即時反映 (${preset1.accent})`);
  if (!preset1.selectedScale || preset1.selectedScale === 'none') {
    fail(`${label}: 選択スウォッチ強調`, preset1.selectedScale);
  } else ok(`${label}: 選択スウォッチ強調`);

  const custom = await page.evaluate(() => {
    selectCustom('#E34948');
    const theme = resolveTheme();
    const mini = document.getElementById('themeMiniPreview');
    return {
      accent: theme.light.toUpperCase(),
      hex: document.getElementById('themeCurrentHex')?.textContent?.trim(),
      tmAccent: mini ? getComputedStyle(mini).getPropertyValue('--tm-accent').trim().toUpperCase() : '',
      customSelected: document.getElementById('customColorBtn')?.classList.contains('selected'),
    };
  });

  if (!custom.customSelected || custom.hex !== custom.accent || custom.tmAccent !== custom.accent) {
    fail(`${label}: 自由色即時反映`, JSON.stringify(custom));
  } else ok(`${label}: 自由色即時反映`);

  await page.evaluate(() => {
    document.getElementById('streamerName').value = 'テーマ見本テスト';
    document.getElementById('subtitle').value = 'サブ見本';
    updateSelectedCount();
  });
  await page.waitForTimeout(80);

  const names = await page.evaluate(() => ({
    miniName: document.getElementById('themeMiniName')?.textContent,
    miniSub: document.getElementById('themeMiniSub')?.textContent,
  }));
  if (names.miniName !== 'テーマ見本テスト' || names.miniSub !== 'サブ見本') {
    fail(`${label}: 見本テキスト同期`, JSON.stringify(names));
  } else ok(`${label}: 見本テキスト同期`);

  await page.click('#editTabPreview');
  await page.waitForTimeout(120);
  const preview = await page.evaluate(() => ({
    accent: getComputedStyle(document.getElementById('previewFrame')).getPropertyValue('--pv-accent').trim().toUpperCase(),
    title: document.querySelector('#previewFrame .pv-title')?.textContent,
  }));
  if (preview.title !== 'テーマ見本テスト') fail(`${label}: 確認プレビュー同期`, preview.title);
  else ok(`${label}: 確認プレビュー同期`);
  if (preview.accent !== custom.accent) fail(`${label}: 確認プレビュー色`, `${preview.accent} vs ${custom.accent}`);
  else ok(`${label}: 確認プレビュー色一致`);

  const groups = await page.evaluate(() => ({
    basicGroups: document.querySelectorAll('#panelBasic .ui-field-group').length,
    songSearch: !!document.querySelector('#panelSongs .song-search-block'),
    songFilter: !!document.querySelector('#panelSongs .song-filter-block'),
    songBulk: !!document.querySelector('#panelSongs .song-bulk-block'),
    previewShell: !!document.querySelector('#panelPreview .preview-shell-block'),
    moreGroups: document.querySelectorAll('#panelMore .ui-field-group').length,
  }));
  if (groups.basicGroups < 3 || !groups.songSearch || !groups.songFilter || !groups.songBulk) {
    fail(`${label}: 境界グループ`, JSON.stringify(groups));
  } else ok(`${label}: 境界グループ`);
  if (!groups.previewShell || groups.moreGroups < 2) fail(`${label}: プレビュー/管理グループ`, JSON.stringify(groups));
  else ok(`${label}: プレビュー/管理グループ`);

  if (errors.length) fail(`${label}: JSエラー`, errors.join('; '));
  else ok(`${label}: JSエラーなし`);

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
console.log('\nAll design-tab UI checks passed.');
