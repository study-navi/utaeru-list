#!/usr/bin/env node
/**
 * 曲一覧UI・単一選択絞り込み 回帰テスト
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');
const LONG_TITLE_QUERY = 'Tot Musica';

const VIEWPORTS = [
  { label: '320px', width: 320 },
  { label: '375px', width: 375 },
  { label: '390px', width: 390 },
  { label: '430px', width: 430 },
  { label: '1280px', width: 1280 },
];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function openSongsTab(page) {
  await page.click('#editTabSongs');
  await page.waitForSelector('#panelSongs:not([hidden])');
}

async function openFirstArtistGroup(page) {
  await page.waitForSelector('details.artist-group', { timeout: 10000 });
  await page.locator('details.artist-group').first().evaluate((el) => { el.open = true; });
  await page.waitForSelector('.song-item', { timeout: 10000 });
}

async function songRowSnapshot(page) {
  return page.evaluate(() => {
    const item = document.querySelector('.song-item');
    if (!item) return null;
    const cs = getComputedStyle(item);
    const row = item.querySelector('.song-row');
    const title = item.querySelector('.song-title');
    const artist = item.querySelector('.song-artist');
    const btn = item.querySelector('.song-settings-btn');
    const checkCell = item.querySelector('.song-check-cell');
    const check = item.querySelector('.song-check');
    const bodyRight = item.querySelector('.song-artist')?.getBoundingClientRect().right ?? 0;
    const btnLeft = btn?.getBoundingClientRect().left ?? 0;
    const btnStyle = btn ? getComputedStyle(btn, '::before') : null;
    return {
      borderBottom: cs.borderBottomWidth,
      paddingTop: cs.paddingTop,
      hasCheckCell: !!checkCell,
      checkCellW: checkCell?.offsetWidth ?? 0,
      checkCellH: checkCell?.offsetHeight ?? 0,
      checkW: check?.offsetWidth ?? 0,
      hasTitle: !!title,
      hasArtist: !!artist,
      settingsRight: btn && row ? btnLeft > bodyRight - 20 : false,
      btnW: btn?.offsetWidth ?? 0,
      btnH: btn?.offsetHeight ?? 0,
      btnTapW: btn ? btn.offsetWidth + 12 : 0,
      btnTapH: btn ? btn.offsetHeight + 20 : 0,
      titleLines: (() => {
        if (!title) return 0;
        const range = document.createRange();
        range.selectNodeContents(title);
        return [...range.getClientRects()].filter((r) => r.width > 0).length || 1;
      })(),
      settingsWhiteSpace: btn ? getComputedStyle(btn).whiteSpace : '',
      scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      gridCols: row ? getComputedStyle(row).gridTemplateColumns : '',
    };
  });
}

async function checkSongRow(page, label) {
  await openSongsTab(page);
  await openFirstArtistGroup(page);
  const row = await songRowSnapshot(page);
  if (!row) { fail(`${label}: 曲行`, 'not found'); return; }
  if (row.hasCheckCell && row.hasTitle && row.hasArtist && row.settingsRight) {
    ok(`${label}: 曲名/アーティスト/右設定`);
  } else fail(`${label}: 曲行構造`, JSON.stringify(row));
  if (parseFloat(row.borderBottom) >= 1 && parseFloat(row.paddingTop) >= 8) ok(`${label}: 区切り線+padding`);
  else fail(`${label}: 境界`, JSON.stringify(row));
  if (row.checkCellW >= 44 && row.checkCellH >= 44) ok(`${label}: チェックタップ ${row.checkCellW}x${row.checkCellH}px`);
  else fail(`${label}: チェックタップ`, `${row.checkCellW}x${row.checkCellH}`);
  if (row.btnTapW >= 44 && row.btnTapH >= 44) ok(`${label}: 設定タップ ${row.btnTapW}x${row.btnTapH}px`);
  else fail(`${label}: 設定タップ`, `${row.btnTapW}x${row.btnTapH}`);
  if (row.settingsWhiteSpace === 'nowrap') ok(`${label}: 設定ボタン改行なし`);
  else fail(`${label}: 設定改行`, row.settingsWhiteSpace);
  if (!row.scroll) ok(`${label}: 横スクロールなし`);
  else fail(`${label}: 横スクロール`);
}

async function resetFilters(page) {
  await page.evaluate(() => {
    activeFilter = null;
    refreshNarrowFilterChips?.();
    setSearchTarget('artist');
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(150);
}

async function useTitleSearch(page, query) {
  await page.evaluate((term) => {
    setSearchTarget('title');
    searchInput.value = term;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await page.waitForTimeout(200);
}

async function checkLongTitle(page, label) {
  await resetFilters(page);
  await useTitleSearch(page, LONG_TITLE_QUERY);
  const info = await page.evaluate(() => {
    const item = document.querySelector('.song-item');
    const title = item?.querySelector('.song-title');
    const btn = item?.querySelector('.song-settings-btn');
    if (!item || !title || !btn) return null;
    const range = document.createRange();
    range.selectNodeContents(title);
    const titleRects = [...range.getClientRects()].filter((r) => r.width > 0);
    const itemRect = item.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    return {
      titleLines: titleRects.length || 1,
      btnInside: btnRect.right <= itemRect.right + 1,
      btnLeft: btnRect.left,
      titleRight: Math.max(...titleRects.map((r) => r.right), 0),
      scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      settingsWhiteSpace: getComputedStyle(btn).whiteSpace,
    };
  });
  if (!info) { fail(`${label}: 長い曲名`, 'row not found'); return; }
  const needWrap = label !== '1280px';
  if (!needWrap || info.titleLines >= 2) ok(`${label}: 長い曲名 ${info.titleLines}行`);
  else fail(`${label}: 長い曲名`, `${info.titleLines}行`);
  if (info.btnInside && info.btnLeft > info.titleRight - 40) ok(`${label}: 長い曲名でも設定右固定`);
  else fail(`${label}: 長い曲名レイアウト`, JSON.stringify(info));
  if (!info.scroll) ok(`${label}: 長い曲名 横スクロールなし`);
  else fail(`${label}: 長い曲名 横スクロール`);
}

async function checkSettingsExpand(page, label) {
  await resetFilters(page);
  await useTitleSearch(page, 'Story');
  const row = page.locator('.song-item')
    .filter({ has: page.locator('.song-title', { hasText: /^Story$/ }) })
    .filter({ has: page.locator('.song-artist', { hasText: /^AI$/ }) })
    .first();
  await row.locator('.song-settings-btn').click();
  await page.waitForTimeout(150);
  const info = await page.evaluate(() => {
    const item = document.querySelector('.song-item.is-expanded');
    const panel = item?.querySelector('.song-meta-panel');
    const next = item?.nextElementSibling;
    const panelCs = panel ? getComputedStyle(panel) : null;
    const itemCs = item ? getComputedStyle(item) : null;
    const hasTagUi = !!panel?.textContent?.includes('自由タグ');
    return {
      expanded: !!item,
      panelBelowRow: panel && item?.querySelector('.song-row')?.compareDocumentPosition(panel) === Node.DOCUMENT_POSITION_FOLLOWING,
      panelBorderTop: panelCs ? parseFloat(panelCs.borderTopWidth) >= 1 : false,
      panelBorderBottom: panelCs ? parseFloat(panelCs.borderBottomWidth) >= 1 : false,
      itemBorderBottom: itemCs ? parseFloat(itemCs.borderBottomWidth) >= 1 : false,
      nextHasBorder: next ? parseFloat(getComputedStyle(next).borderTopWidth) >= 0 : true,
      hasMarks: !!panel?.querySelector('.mark-btn'),
      hasTagUi,
    };
  });
  if (info.expanded && info.panelBelowRow && info.hasMarks && !info.hasTagUi) {
    ok(`${label}: 設定展開（パネル直下・マークあり・自由タグなし）`);
  } else fail(`${label}: 設定展開`, JSON.stringify(info));
  if (info.panelBorderTop && info.panelBorderBottom) ok(`${label}: 設定パネル境界線`);
  else fail(`${label}: パネル境界`, JSON.stringify(info));
  if (info.itemBorderBottom) ok(`${label}: 展開後も曲行境界`);
  else fail(`${label}: 展開後境界`);
}

async function checkMarkToggle(page, label) {
  const btn = page.locator('.song-item.is-expanded .mark-btn[data-value="favorite"]');
  const before = await btn.evaluate((el) => el.classList.contains('active'));
  await btn.click();
  await page.waitForTimeout(120);
  const after = await btn.evaluate((el) => el.classList.contains('active'));
  if (before !== after) ok(`${label}: マーク操作`);
  else fail(`${label}: マーク操作`, `${before}->${after}`);
}

async function checkAccordionSongs(page, label) {
  await resetFilters(page);
  await page.waitForSelector('details.artist-group', { timeout: 15000 });
  await openFirstArtistGroup(page);
  const info = await page.evaluate(() => {
    const group = document.querySelector('details.artist-group[open]');
    const head = group?.querySelector('.artist-head');
    const song = group?.querySelector('.song-item');
    if (!group || !head || !song) return null;
    const headRect = head.getBoundingClientRect();
    const songRect = song.getBoundingClientRect();
    return {
      nested: songRect.top > headRect.bottom - 1,
      hasBorder: parseFloat(getComputedStyle(song).borderBottomWidth) >= 1,
      hasGrid: getComputedStyle(song.querySelector('.song-row')).display === 'grid',
      settingsRight: !!song.querySelector('.song-row-actions .song-settings-btn'),
    };
  });
  if (info?.nested && info.hasBorder && info.hasGrid && info.settingsRight) {
    ok(`${label}: アコーディオン内曲行`);
  } else fail(`${label}: アコーディオン内`, JSON.stringify(info));
}

async function checkFilterSingleSelect(page, label) {
  await resetFilters(page);

  const click = async (text) => {
    await page.locator('#narrowFilterRow .chip', { hasText: text }).click();
    await page.waitForTimeout(120);
  };
  const active = () => page.evaluate(() =>
    [...document.querySelectorAll('#narrowFilterRow .chip.active')].map((c) => c.textContent?.trim()),
  );

  await click('新着');
  let chips = await active();
  if (chips.length === 1 && chips[0] === '新着') ok(`${label}: 新着単独選択`);
  else fail(`${label}: 新着`, chips.join(','));

  await click('J-POP');
  chips = await active();
  if (chips.length === 1 && chips[0] === 'J-POP') ok(`${label}: 新着→J-POP切替`);
  else fail(`${label}: J-POP切替`, chips.join(','));

  await click('アニソン');
  chips = await active();
  if (chips.length === 1 && chips[0] === 'アニソン') ok(`${label}: J-POP→アニソン切替`);
  else fail(`${label}: アニソン切替`, chips.join(','));

  await click('アニソン');
  chips = await active();
  if (chips.length === 1 && chips[0] === 'すべて') ok(`${label}: 再タップ→すべて`);
  else fail(`${label}: 解除`, chips.join(','));

  await click('J-POP');
  await page.fill('#searchInput', 'aiko');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(150);
  const meta = await page.locator('#resultMeta').textContent();
  if (meta && !meta.startsWith('0曲')) ok(`${label}: 検索AND ${meta.trim()}`);
  else fail(`${label}: 検索AND`, meta);
}

async function checkCheckboxToggle(page, label) {
  await resetFilters(page);
  await useTitleSearch(page, 'Story');
  const check = page.locator('.song-item')
    .filter({ has: page.locator('.song-title', { hasText: /^Story$/ }) })
    .filter({ has: page.locator('.song-artist', { hasText: /^AI$/ }) })
    .locator('.song-check');
  const before = await check.isChecked();
  await check.click({ force: true });
  await page.waitForTimeout(100);
  const after = await check.isChecked();
  if (before !== after) ok(`${label}: チェック操作`);
  else fail(`${label}: チェック操作`, `${before}->${after}`);
}

async function main() {
  console.log('=== test-song-list-ui.mjs ===\n');
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await addBypassStart(page);
    await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 20000 });
    await checkSongRow(page, vp.label);
    await checkLongTitle(page, vp.label);
    if (vp.label === '375px') {
      await checkFilterSingleSelect(page, vp.label);
      await checkSettingsExpand(page, vp.label);
      await checkMarkToggle(page, vp.label);
      await checkCheckboxToggle(page, vp.label);
    }
    await checkAccordionSongs(page, vp.label);
    if (!errors.length) ok(`${vp.label}: Consoleエラーなし`);
    else fail(`${vp.label}: Console`, errors.join('; '));
    await page.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} failure(s)` : '\nAll song list UI tests passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
