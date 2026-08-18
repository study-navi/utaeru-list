#!/usr/bin/env node
/**
 * 並び替え機能 ユニット + UI 回帰テスト
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import {
  SORT_OPTIONS,
  compareReading,
  readingSortTier,
  sortSongsList,
  sortArtistGroups,
  buildArtistGroups,
  shouldUseFlatListMode,
  defaultSortForSearchTarget,
  withinGroupSortMode,
} from './lib/song-sort.mjs';
import { buildNewBatchOrderMap } from './lib/new-batch-lookup.mjs';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';
import { getCurrentBatch } from './data/new-song-batches.mjs';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');
const HTML404 = path.join(ROOT, '404.html');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

const keyOf = (s) => `${s.a}\u0001${s.t}`;

function runUnitTests() {
  if (SORT_OPTIONS.length === 7) ok('SORT_OPTIONS 7件');
  else fail('SORT_OPTIONS count', String(SORT_OPTIONS.length));

  if (defaultSortForSearchTarget('artist') === 'artist-asc') ok('初期: アーティスト→artist-asc');
  else fail('default artist');
  if (defaultSortForSearchTarget('title') === 'title-asc') ok('初期: 曲名→title-asc');
  else fail('default title');

  if (readingSortTier('あいう') === 0 && readingSortTier('ABC') === 1) ok('readingSortTier 日本語/英字');
  else fail('readingSortTier');

  const songs = [
    { k: 'あ', y: 'よ', a: 'B', t: 'Z', ty: 'ぜっと' },
    { k: 'あ', y: 'あ', a: 'A', t: 'Alpha', ty: 'あるふぁ' },
    { k: 'あ', y: 'ん', a: 'C', t: 'End', ty: 'えんど' },
    { k: 'あ', y: 'え', a: 'D', t: 'English', ty: 'english' },
  ];
  const src = [...songs];
  const baseOpts = {
    sourceList: src,
    keyOf,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: () => null,
    getBatchOrder: () => undefined,
  };

  const titleAsc = sortSongsList(songs, { sortMode: 'title-asc', ...baseOpts });
  if (titleAsc.map((s) => s.t).join(',') === 'Alpha,End,Z,English') ok('曲名 あ→ん ty');
  else fail('曲名 あ→ん', titleAsc.map((s) => s.t).join(','));

  const titleDesc = sortSongsList(songs, { sortMode: 'title-desc', ...baseOpts });
  if (titleDesc.map((s) => s.t).join(',') === 'Z,End,Alpha,English') ok('曲名 ん→あ ty');
  else fail('曲名 ん→あ', titleDesc.map((s) => s.t).join(','));

  const artistAsc = sortSongsList(songs, { sortMode: 'artist-asc', ...baseOpts });
  if (artistAsc.map((s) => s.a).join(',') === 'A,D,B,C') ok('アーティスト あ→ん y');
  else fail('アーティスト あ→ん', artistAsc.map((s) => s.a).join(','));

  const artistDesc = sortSongsList(songs, { sortMode: 'artist-desc', ...baseOpts });
  if (artistDesc.map((s) => s.a).join(',') === 'C,B,D,A') ok('アーティスト ん→あ y');
  else fail('アーティスト ん→あ', artistDesc.map((s) => s.a).join(','));

  const tieSongs = [
    { k: 'あ', y: 'あ', a: 'Zeta', t: 'T1', ty: 'さめ' },
    { k: 'あ', y: 'い', a: 'Alpha', t: 'T2', ty: 'さめ' },
    { k: 'あ', y: 'う', a: 'Beta', t: 'T3', ty: 'さめ' },
  ];
  const tieSorted = sortSongsList(tieSongs, {
    sortMode: 'title-asc',
    sourceList: tieSongs,
    keyOf,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: () => null,
  });
  if (tieSorted.map((s) => s.a).join(',') === 'Zeta,Alpha,Beta') ok('同一 ty → y → 登録順');
  else fail('同一 ty tie-break', tieSorted.map((s) => s.a).join(','));

  const dated = [
    { k: 'あ', y: 'あ', a: 'A', t: 'Old', ty: 'おーるど' },
    { k: 'あ', y: 'あ', a: 'B', t: 'New', ty: 'にゅー' },
    { k: 'あ', y: 'あ', a: 'C', t: 'NoDate', ty: 'のーでーと' },
  ];
  const meta = {
    'A\u0001Old': { addedAt: '2024-01-01' },
    'B\u0001New': { addedAt: '2025-06-01' },
  };
  const addedDesc = sortSongsList(dated, {
    sortMode: 'added-desc',
    sourceList: dated,
    keyOf,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: (s) => (meta[keyOf(s)] || {}).addedAt,
  });
  if (addedDesc.map((s) => s.t).join(',') === 'New,Old,NoDate') ok('追加が新しい順 + 日時なし後ろ');
  else fail('added-desc', addedDesc.map((s) => s.t).join(','));

  const addedAsc = sortSongsList(dated, {
    sortMode: 'added-asc',
    sourceList: dated,
    keyOf,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: (s) => (meta[keyOf(s)] || {}).addedAt,
  });
  if (addedAsc.map((s) => s.t).join(',') === 'Old,New,NoDate') ok('追加が古い順 + 日時なし後ろ');
  else fail('added-asc', addedAsc.map((s) => s.t).join(','));

  const batchSongs = [
    { k: 'あ', y: 'あ', a: 'A', t: 'Later', ty: 'れーた' },
    { k: 'あ', y: 'い', a: 'B', t: 'First', ty: 'ふぁーすと' },
    { k: 'あ', y: 'う', a: 'C', t: 'Other', ty: 'あざー' },
  ];
  const batchOrder = { 'B\u0001First': 0, 'A\u0001Later': 1 };
  const batchSorted = sortSongsList(batchSongs, {
    sortMode: 'batch-order',
    sourceList: batchSongs,
    keyOf,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: () => null,
    getBatchOrder: (s) => batchOrder[keyOf(s)],
  });
  if (batchSorted.map((s) => s.t).join(',') === 'First,Later,Other') ok('UTAEMO新着順: batch→その他');
  else fail('batch-order', batchSorted.map((s) => s.t).join(','));

  const groups = [
    { artist: 'Z', songs: [{ k: 'あ', y: 'ぜっと', a: 'Z', t: 'z2', ty: 'ぜっと2' }, { k: 'あ', y: 'ぜっと', a: 'Z', t: 'z1', ty: 'ぜっと1' }] },
    { artist: 'A', songs: [{ k: 'あ', y: 'あ', a: 'A', t: 'a1', ty: 'あいう' }] },
  ];
  const built = buildArtistGroups(
    groups.flatMap((g) => g.songs),
    {
      sortMode: 'artist-asc',
      sourceList: groups.flatMap((g) => g.songs),
      keyOf,
      getTitleTy: (s) => s.ty,
      getArtistY: (s) => s.y,
      getAddedAt: () => null,
      getBatchOrder: () => undefined,
    },
  );
  if (built.map((g) => g.artist).join(',') === 'A,Z') ok('アコーディオン: アーティスト あ→ん');
  else fail('buildArtistGroups artist', built.map((g) => g.artist).join(','));
  if (built[1].songs.map((s) => s.t).join(',') === 'z1,z2') ok('アコーディオン内: 曲名 あ→ん');
  else fail('within group title', built[1].songs.map((s) => s.t).join(','));

  if (withinGroupSortMode('artist-asc') === 'title-asc') ok('withinGroupSortMode');
  else fail('withinGroupSortMode');

  if (shouldUseFlatListMode({ sortMode: 'title-asc', searchTarget: 'artist', q: '', songListView: null, newOnly: false, activeMark: false, activeTagsSize: 0, catalogScope: 'all' })) {
    ok('shouldUseFlatListMode: 曲名ソート');
  } else fail('shouldUseFlatListMode title sort');

  const masterSongs = parseMasterSongsFromIndexHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  const orderMap = buildNewBatchOrderMap(masterSongs);
  const batch = getCurrentBatch();
  if (Object.keys(orderMap).length === batch.songs.length) ok(`NEW_BATCH_ORDER ${Object.keys(orderMap).length}件`);
  else fail('NEW_BATCH_ORDER count', `${Object.keys(orderMap).length} vs ${batch.songs.length}`);

  const jaBeforeEn = compareReading('あ', 'english', 1);
  if (jaBeforeEn < 0) ok('日本語読みは英字より前');
  else fail('日本語 vs 英字 tier', String(jaBeforeEn));
}

function buildViewerFixture(name, { songs, songMeta = {} }) {
  let html = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');
  const cfg = {
    streamerName: 'ソートテスト',
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
  const p = path.join(ROOT, 'scripts', `.fixture-sort-${name}.html`);
  fs.writeFileSync(p, html);
  return `file://${p}`;
}

async function setSort(page, value) {
  await page.selectOption('#sortSelect', value);
  await page.waitForTimeout(150);
}

async function setSearchTarget(page, target) {
  await page.evaluate((t) => {
    document.getElementById(t === 'artist' ? 'searchTargetArtist' : 'searchTargetTitle')?.click();
  }, target);
  await page.waitForTimeout(100);
}

async function getFlatTitles(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.flat-title-primary, .flat-song-item .song-title')].map((el) => el.textContent.trim()),
  );
}

async function getAccordionArtists(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.artist-accordion-trigger .artist-accordion-name')].map((el) => el.textContent.trim()),
  );
}

async function runEditorUiTests(browser) {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.click('#editTabSongs');
  await page.waitForSelector('#panelSongs:not([hidden])');

  const initialSort = await page.locator('#sortSelect').inputValue();
  if (initialSort === 'artist-asc') ok(`編集: 初期ソート ${initialSort}`);
  else fail('編集: 初期ソート', initialSort);

  const h = await page.locator('#sortSelect').evaluate((el) => el.offsetHeight);
  if (h >= 44) ok(`編集: sortSelect 高さ ${h}px`);
  else fail('編集: sortSelect タップ領域', String(h));

  const addedOptDisabled = await page.evaluate(() => {
    const o = [...document.querySelectorAll('#sortSelect option')].find((x) => x.value === 'added-desc');
    return o?.disabled;
  });
  if (addedOptDisabled) ok('編集: 全曲表示で added ソート disabled');
  else fail('編集: added ソート should be disabled for all songs');

  await setSort(page, 'title-asc');
  await setSearchTarget(page, 'title');
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll('.flat-title-primary')].slice(0, 5).map((el) => el.textContent.trim()),
  );
  if (titles.length >= 3) ok(`編集: 曲名 あ→ん flat ${titles.length}件`);
  else fail('編集: 曲名 flat', String(titles.length));

  await setSearchTarget(page, 'artist');
  await setSort(page, 'artist-asc');
  const artists = await page.evaluate(() =>
    [...document.querySelectorAll('.artist-group .artist-name')].slice(0, 5).map((el) => el.textContent.trim()),
  );
  if (artists.length >= 2) ok(`編集: アーティスト あ→ん accordion ${artists.length}組`);
  else fail('編集: accordion', String(artists.length));

  await setSort(page, 'batch-order');
  await page.evaluate(() => [...document.querySelectorAll('#catalogFilterRow .chip')].find((c) => c.textContent === '新着')?.click());
  await page.waitForTimeout(200);
  const batchMeta = await page.locator('#resultMeta').textContent();
  if (batchMeta?.includes('52曲')) ok(`編集: 新着+batch-order ${batchMeta}`);
  else fail('編集: 新着+batch-order', batchMeta);

  await page.evaluate(() => [...document.querySelectorAll('#catalogFilterRow .chip')].find((c) => c.textContent === 'すべて')?.click());
  await setSort(page, 'title-desc');
  await setSearchTarget(page, 'artist');
  const keptSort = await page.locator('#sortSelect').inputValue();
  if (keptSort === 'title-desc') ok('編集: 検索モード切替でソート維持');
  else fail('編集: ソート維持', keptSort);

  if (!errors.length) ok('編集: console エラーなし');
  else fail('編集: console', errors.join('; '));
  await page.close();
}

async function runViewerUiTests(browser) {
  const songs = [
    { k: 'さ', y: 'み', a: 'M', t: 'Mid', ty: 'みっど' },
    { k: 'あ', y: 'あ', a: 'A', t: 'Alpha', ty: 'あるふぁ' },
    { k: 'ん', y: 'ん', a: 'Z', t: 'Zen', ty: 'ぜん' },
  ];
  const songMeta = {
    'A\u0001Alpha': { addedAt: '2024-01-01' },
    'Z\u0001Zen': { addedAt: '2025-01-01' },
    'M\u0001Mid': { addedAt: '2023-01-01' },
  };
  const url = buildViewerFixture('viewer', { songs, songMeta });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-');

  const initialSort = await page.locator('#sortSelect').inputValue();
  if (initialSort === 'artist-asc') ok(`viewer: 初期ソート ${initialSort}`);
  else fail('viewer: 初期ソート', initialSort);

  await setSearchTarget(page, 'title');
  await setSort(page, 'title-asc');
  let flat = await getFlatTitles(page);
  if (flat.join(',') === 'Alpha,Zen,Mid') ok('viewer: 曲名 あ→ん');
  else fail('viewer: 曲名 あ→ん', flat.join(','));

  await setSort(page, 'title-desc');
  flat = await getFlatTitles(page);
  if (flat.join(',') === 'Mid,Zen,Alpha') ok('viewer: 曲名 ん→あ');
  else fail('viewer: 曲名 ん→あ', flat.join(','));

  await setSearchTarget(page, 'artist');
  await setSort(page, 'artist-asc');
  let acc = await getAccordionArtists(page);
  if (acc.join(',') === 'A,M,Z') ok('viewer: アーティスト あ→ん');
  else fail('viewer: アーティスト あ→ん', acc.join(','));

  await setSort(page, 'artist-desc');
  acc = await getAccordionArtists(page);
  if (acc.join(',') === 'Z,M,A') ok('viewer: アーティスト ん→あ');
  else fail('viewer: アーティスト ん→あ', acc.join(','));

  await setSort(page, 'added-desc');
  flat = await getFlatTitles(page);
  if (flat.join(',') === 'Zen,Alpha,Mid') ok('viewer: 追加が新しい順');
  else fail('viewer: added-desc', flat.join(','));

  await setSort(page, 'added-asc');
  flat = await getFlatTitles(page);
  if (flat.join(',') === 'Mid,Alpha,Zen') ok('viewer: 追加が古い順');
  else fail('viewer: added-asc', flat.join(','));

  await setSearchTarget(page, 'artist');
  await setSort(page, 'title-asc');
  flat = await getFlatTitles(page);
  if (flat.join(',') === 'Alpha,Zen,Mid') ok('viewer: アーティストモード+曲名 あ→ん flat');
  else fail('viewer: cross mode sort', flat.join(','));

  await page.locator('#genreFilterRow .chip', { hasText: 'J-POP' }).click();
  await page.waitForTimeout(150);
  const sortAfterGenre = await page.locator('#sortSelect').inputValue();
  if (sortAfterGenre === 'title-asc') ok('viewer: ジャンル切替でソート維持');
  else fail('viewer: ジャンル+ソート', sortAfterGenre);

  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientW = await page.evaluate(() => document.documentElement.clientWidth);
  if (scrollW <= clientW + 1) ok('viewer 390px: 横スクロールなし');
  else fail('viewer 390px 横スクロール', `${scrollW} > ${clientW}`);

  if (!errors.length) ok('viewer: console エラーなし');
  else fail('viewer: console', errors.join('; '));

  await page.close();
  fs.unlinkSync(url.replace('file://', ''));
}

async function runFilterComboTests(browser) {
  const songs = [
    { k: 'あ', y: 'あ', a: 'A', t: 'One', ty: 'わん' },
    { k: 'さ', y: 'し', a: 'Sid', t: 'ENAMEL', ty: 'えなる' },
  ];
  const url = buildViewerFixture('combo', { songs, songMeta: { 'A\u0001One': { marks: ['favorite'] } } });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-');

  await setSort(page, 'title-desc');
  await page.evaluate(() => {
    [...document.querySelectorAll('#statusFilterRow .chip')].find((c) => c.textContent?.includes('お気に入り'))?.click();
  });
  await page.waitForTimeout(150);
  const markSort = await page.locator('#sortSelect').inputValue();
  if (markSort === 'title-desc') ok('viewer: マーク+ソート維持');
  else fail('viewer: マーク+ソート', markSort);

  await page.locator('#gyoRow .chip', { hasText: 'あ行' }).click();
  await page.waitForTimeout(150);
  const gyoSort = await page.locator('#sortSelect').inputValue();
  if (gyoSort === 'title-desc') ok('viewer: 五十音+ソート維持');
  else fail('viewer: 五十音+ソート', gyoSort);

  await page.close();
  fs.unlinkSync(url.replace('file://', ''));
}

async function runEmptySingleTests(browser) {
  const url = buildViewerFixture('empty', { songs: [] });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  const emptyOk = await page.locator('.empty-state').count();
  if (emptyOk >= 1) ok('0曲: empty state');
  else fail('0曲表示');
  await page.close();
  fs.unlinkSync(url.replace('file://', ''));

  const singleUrl = buildViewerFixture('single', { songs: [{ k: 'あ', y: 'あ', a: 'Solo', t: 'Only', ty: 'おんりー' }] });
  const page2 = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page2.goto(singleUrl, { waitUntil: 'domcontentloaded' });
  await setSort(page2, 'title-asc');
  const one = await getFlatTitles(page2);
  if (one.join(',') === 'Only') ok('1曲: ソート');
  else fail('1曲', one.join(','));
  await page2.close();
  fs.unlinkSync(singleUrl.replace('file://', ''));
}

async function runViewportTests(browser) {
  for (const w of [320, 375, 430, 1280]) {
    const page = await browser.newPage({ viewport: { width: w, height: 800 } });
    const url = buildViewerFixture(`vp-${w}`, {
      songs: [{ k: 'あ', y: 'あ', a: 'A', t: 'Test', ty: 'てすと' }],
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('sortSelect'));
    const h = await page.locator('#sortSelect').evaluate((el) => el.offsetHeight);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    if (h >= 40 && scrollW <= clientW + 1) ok(`${w}px: sort UI h=${h} 横スクロールなし`);
    else fail(`${w}px viewport`, `h=${h} scroll=${scrollW}/${clientW}`);
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }
}

function run404SyncTests() {
  if (!fs.existsSync(HTML404)) {
    fail('404.html not found — run build-404-html.mjs first');
    return;
  }
  const src = fs.readFileSync(HTML404, 'utf8');
  for (const needle of [
    'sortMode', 'SORT_OPTIONS', 'sortSelect', 'sortSongsList', 'buildArtistGroups',
    'buildSortedArtistGroups', 'shouldUseFlatListMode', 'applyDefaultSortForSearchTarget',
    'NEW_BATCH_ORDER', 'getBatchOrderIndex', 'batch-order', 'title-asc',
    'GENRE_LOOKUP', 'CURRENT_NEW_BATCH', 'NEW_BATCH_LOOKUP',
  ]) {
    if (src.includes(needle)) ok(`404.html contains ${needle}`);
    else fail(`404.html missing ${needle}`);
  }
}

async function main() {
  runUnitTests();
  run404SyncTests();

  const browser = await chromium.launch();
  try {
    await runEditorUiTests(browser);
    await runViewerUiTests(browser);
    await runFilterComboTests(browser);
    await runEmptySingleTests(browser);
    await runViewportTests(browser);
  } finally {
    await browser.close();
  }

  console.log(failed ? `\n${failed} failure(s)` : '\nAll sort tests passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
