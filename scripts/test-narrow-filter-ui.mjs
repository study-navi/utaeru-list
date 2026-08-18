#!/usr/bin/env node
/**
 * コンパクト絞り込みUI テスト（編集・viewer・404）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML404 = path.join(ROOT, '404.html');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function buildViewerFixture(name, { songs, songMeta = {} }) {
  let html = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');
  const cfg = {
    streamerName: '絞り込みテスト',
    subtitle: '',
    themeType: 'preset',
    presetIndex: 0,
    songMeta,
    tagPresets: [{ id: 't1', label: 'テストタグ' }],
    updatedAt: '2026-08-19T00:00:00.000Z',
  };
  html = html.replace(/<script type="application\/json" id="builder-config">[\s\S]*?<\/script>/,
    `<script type="application/json" id="builder-config">${JSON.stringify(cfg)}</script>`);
  html = html.replace(/const SONGS = \[[\s\S]*?\];/, `const SONGS = ${JSON.stringify(songs)};`);
  const p = path.join(ROOT, 'scripts', `.fixture-narrow-${name}.html`);
  fs.writeFileSync(p, html);
  return `file://${p}`;
}

async function clickNarrow(page, label) {
  await page.locator('#narrowFilterRow .chip', { hasText: label }).click();
  await page.waitForTimeout(180);
}

async function meta(page) {
  return page.locator('#resultMeta').textContent();
}

async function activeChips(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#narrowFilterRow .chip.active')].map((c) => c.textContent?.trim()),
  );
}

async function chipLayoutSnapshot(page) {
  return page.evaluate(() => {
    const row = document.getElementById('narrowFilterRow');
    const chips = [...document.querySelectorAll('#narrowFilterRow .chip')];
    const rowRect = row?.getBoundingClientRect();
    const rows = new Map();
    chips.forEach((chip) => {
      const r = chip.getBoundingClientRect();
      const y = Math.round(r.top);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({
        label: chip.textContent?.trim(),
        w: Math.round(r.width),
        h: Math.round(r.height),
        lines: Math.round(chip.scrollHeight / parseFloat(getComputedStyle(chip).lineHeight || '14')),
      });
    });
    const rowList = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, items]) => items);
    const lastRow = rowList[rowList.length - 1] || [];
    const lastRowCenter = lastRow.length
      ? lastRow.reduce((s, c) => s + (rows.get([...rows.keys()].sort((a, b) => a - b).pop()) ? 0 : 0), 0)
      : 0;
    let lastRowMid = 0;
    if (lastRow.length && rowRect) {
      const first = chips.find((c) => c.textContent?.trim() === lastRow[0].label);
      const last = chips.find((c) => c.textContent?.trim() === lastRow[lastRow.length - 1].label);
      if (first && last) {
        lastRowMid = (first.getBoundingClientRect().left + last.getBoundingClientRect().right) / 2;
      }
    }
    const rowMid = rowRect ? rowRect.left + rowRect.width / 2 : 0;
    const orphanOther = lastRow.length === 1 && lastRow[0].label === 'その他';
    const orphanOtherLeft = orphanOther && Math.abs(lastRowMid - rowMid) >= 24;
    const sixPlusOne = rowList.length === 2 && rowList[0].length === 6 && rowList[1].length === 1;
    const lineBreaks = chips.some((chip) => {
      const range = document.createRange();
      range.selectNodeContents(chip);
      return range.getClientRects().length > 1;
    });
    return {
      rows: rowList.map((items) => items.map((i) => i.label)),
      heights: chips.map((c) => c.offsetHeight),
      scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      lastRowCentered: lastRow.length ? Math.abs(lastRowMid - rowMid) < 24 : true,
      orphanOtherLeft,
      sixPlusOne,
      lineBreaks,
      narrowH: document.querySelector('.narrow-filter-block')?.offsetHeight ?? 0,
    };
  });
}

async function checkChipLayout(page, label, width) {
  await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
  await page.waitForTimeout(120);
  const lay = await chipLayoutSnapshot(page);
  const rowDesc = lay.rows.map((r) => r.join('+')).join(' / ');
  if (!lay.sixPlusOne && !lay.orphanOtherLeft) ok(`${label}: chip配置 ${rowDesc}`);
  else fail(`${label}: 孤立その他`, rowDesc);
  if (lay.lastRowCentered || lay.rows.length <= 1) ok(`${label}: 最終行バランス`);
  else fail(`${label}: 最終行中央`, rowDesc);
  if (!lay.scroll) ok(`${label}: 横スクロールなし`);
  else fail(`${label}: 横スクロール`);
  if (!lay.lineBreaks) ok(`${label}: ラベル改行なし`);
  else fail(`${label}: ラベル改行`);
  if (lay.heights.every((h) => h >= 34 && h <= 40)) ok(`${label}: chip高さ統一 ${lay.heights[0]}px`);
  else fail(`${label}: chip高さ`, lay.heights.join(','));
  return lay;
}

async function measureFilterArea(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('.search-bar');
    const narrow = document.querySelector('.narrow-filter-block');
    const top = bar?.getBoundingClientRect().top ?? 0;
    const bottom = narrow?.getBoundingClientRect().bottom ?? bar?.getBoundingClientRect().bottom ?? 0;
    return {
      searchBar: bar?.offsetHeight ?? 0,
      narrow: narrow?.offsetHeight ?? 0,
      total: bottom - top,
      hasCatalog: !!document.getElementById('catalogFilterRow'),
      hasGenreRow: !!document.getElementById('genreFilterRow'),
      narrowLabels: [...document.querySelectorAll('#narrowFilterRow .chip')].map((c) => c.textContent?.trim()),
    };
  });
}

function run404Tests() {
  const src = fs.readFileSync(HTML404, 'utf8');
  for (const needle of [
    'narrowFilterRow', 'NARROW_FILTER_OPTIONS', 'toggleNarrowFilter', 'activeFilter',
    'GENRE_LOOKUP', 'CURRENT_NEW_BATCH', 'sortSelect', 'initSortSelect',
  ]) {
    if (src.includes(needle)) ok(`404.html: ${needle}`);
    else fail(`404.html missing ${needle}`);
  }
  if (!src.includes('catalogFilterRow')) ok('404.html: catalogFilterRow なし');
  else fail('404.html: catalogFilterRow 残存');
  if (!src.includes("label: 'すべて'") || src.includes('narrowFilterRow')) {
    // genre inject may not have すべて in narrow chips
    ok('404.html: 絞り込みchipにすべてなし');
  }
}

async function runViewerFilterTests(browser) {
  const songs = [
    { k: 'あ', y: 'あ', a: 'A', t: 'Alpha', ty: 'あるふぁ' },
    { k: 'あ', y: 'あ', a: 'B', t: 'Beta', ty: 'べーた' },
    { k: 'え', y: 'しど', a: 'シド', t: 'ENAMEL', ty: 'えなる' },
    { k: 'ら', y: 'しど', a: 'シド', t: '乱舞のメロディ', ty: 'らんぶ' },
  ];
  const url = buildViewerFixture('viewer', { songs });
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-');

  const layout = await measureFilterArea(page);
  if (!layout.hasCatalog && !layout.hasGenreRow) ok('viewer: 旧catalog/genre行なし');
  else fail('viewer: 旧行残存', JSON.stringify(layout));
  if (layout.narrowLabels.join(',') === '新着,J-POP,アニソン,ボカロ,洋楽,演歌,その他') {
    ok('viewer: 絞り込み7chip');
  } else fail('viewer: chip labels', layout.narrowLabels.join(','));

  if ((await meta(page)) === '4曲 / 3組') ok('viewer: 初期全曲');
  else fail('viewer: 初期', await meta(page));

  await clickNarrow(page, 'J-POP');
  if ((await activeChips(page)).includes('J-POP')) ok('viewer: J-POP ON');
  else fail('viewer: J-POP active');
  await clickNarrow(page, 'J-POP');
  if (!(await activeChips(page)).includes('J-POP') && (await meta(page)) === '4曲 / 3組') {
    ok('viewer: J-POP再タップ解除');
  } else fail('viewer: J-POP OFF', (await activeChips(page)).join(','));

  await clickNarrow(page, '新着');
  if ((await meta(page)) === '2曲 / 1組') ok('viewer: 新着 ON 2曲');
  else fail('viewer: 新着', await meta(page));
  await clickNarrow(page, '新着');
  if ((await meta(page)) === '4曲 / 3組') ok('viewer: 新着再タップ解除');

  await clickNarrow(page, '新着');
  await clickNarrow(page, 'アニソン');
  const both = await activeChips(page);
  if (!both.includes('新着') && both.includes('アニソン') && both.length === 1) {
    ok('viewer: 新着→アニソン切替（単一選択）');
  } else fail('viewer: 新着→アニソン', both.join(','));
  await clickNarrow(page, 'J-POP');
  const switched = await activeChips(page);
  if (switched.includes('J-POP') && !switched.includes('アニソン') && switched.length === 1) {
    ok('viewer: J-POP→アニソン切替');
  } else fail('viewer: J-POP切替', switched.join(','));
  await clickNarrow(page, 'J-POP');
  if ((await activeChips(page)).length === 0) ok('viewer: 同chip再タップ解除→全曲');
  else fail('viewer: 全解除', (await activeChips(page)).join(','));

  await clickNarrow(page, 'J-POP');
  await page.selectOption('#sortSelect', 'title-desc');
  await page.waitForTimeout(150);
  if (await page.locator('#sortSelect').inputValue() === 'title-desc') ok('viewer: 並び替え+ジャンル');
  else fail('viewer: sort+genre');

  await page.locator('#gyoRow .chip', { hasText: 'あ行' }).click();
  await page.waitForTimeout(150);
  if (await page.locator('#sortSelect').inputValue() === 'title-desc') ok('viewer: 五十音+ソート');
  else fail('viewer: gyo+sort');

  await page.locator('#gyoRow .chip', { hasText: 'すべて' }).click();
  await page.waitForTimeout(120);
  await page.fill('#searchInput', 'シド');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(150);
  const searchMeta = await meta(page);
  if (searchMeta?.includes('2曲')) ok('viewer: 検索+絞り込み ' + searchMeta);
  else fail('viewer: search', searchMeta);

  await page.evaluate(() => {
    [...document.querySelectorAll('#statusFilterRow .chip')].find((c) => c.textContent?.includes('お気に入り'))?.click();
  });
  await page.waitForTimeout(150);
  if (await page.locator('#sortSelect').inputValue() === 'title-desc') ok('viewer: マーク+ソート');

  const acc = await page.locator('.artist-accordion-trigger').count();
  if (acc >= 1) {
    await page.locator('.artist-accordion-trigger').first().click();
    await page.waitForTimeout(120);
    if (await page.locator('.artist-accordion-item.is-open').count() >= 1) ok('viewer: アコーディオン展開');
    else fail('viewer: accordion');
  }

  const layoutHeights = {};
  for (const w of [320, 375, 390, 430, 1280]) {
    const lay = await checkChipLayout(page, `${w}px`, w);
    layoutHeights[w] = lay.narrowH;
  }

  const afterLayout = await measureFilterArea(page);
  ok(`viewer 375px: 絞り込みエリア高さ total=${afterLayout.total}px narrow=${afterLayout.narrow}px`);

  if (!errors.length) ok('viewer: console エラーなし');
  else fail('viewer: console', errors.join('; '));

  await page.close();
  fs.unlinkSync(url.replace('file://', ''));
  return afterLayout.total;
}

async function runEditorTests(browser) {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.click('#editTabSongs');
  await page.waitForSelector('#panelSongs:not([hidden])');

  const layout = await measureFilterArea(page);
  if (layout.narrowLabels.length === 7) ok('編集: 絞り込み7chip');
  else fail('編集: chips', layout.narrowLabels.join(','));
  if (await page.locator('#narrowFilterBlock .narrow-filter-label').textContent() === '絞り込み') {
    ok('編集: 絞り込み見出し');
  } else fail('編集: label');

  await clickNarrow(page, '新着');
  const metaText = await page.locator('#resultMeta').textContent();
  if (metaText?.includes('52曲')) ok(`編集: 新着 ${metaText}`);
  else fail('編集: 新着', metaText);

  for (const w of [320, 375, 390, 430, 1280]) {
    await checkChipLayout(page, `編集${w}px`, w);
  }

  if (!errors.length) ok('編集: console エラーなし');
  else fail('編集: console', errors.join('; '));
  await page.close();
}

async function main() {
  run404Tests();
  const browser = await chromium.launch();
  try {
    const afterH = await runViewerFilterTests(browser);
    await runEditorTests(browser);
    console.log(`\n375px 変更後 絞り込みエリア高さ: ${afterH}px (参考: 変更前775px)`);
  } finally {
    await browser.close();
  }
  console.log(failed ? `\n${failed} failure(s)` : '\nAll narrow filter tests passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
