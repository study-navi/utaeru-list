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
  shouldUseFlatForAddedSort,
  hasAnyAddedAt,
} from './lib/song-sort.mjs';
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
  if (SORT_OPTIONS.length === 5) ok('SORT_OPTIONS 5件');
  else fail('SORT_OPTIONS count', String(SORT_OPTIONS.length));

  if (readingSortTier('あいう') === 0 && readingSortTier('ABC') === 1) ok('readingSortTier 日本語/英字');
  else fail('readingSortTier');

  const songs = [
    { k: 'あ', y: 'よ', a: 'B', t: 'Z', ty: 'ぜっと' },
    { k: 'あ', y: 'あ', a: 'A', t: 'Alpha', ty: 'あるふぁ' },
    { k: 'あ', y: 'ん', a: 'C', t: 'End', ty: 'えんど' },
    { k: 'あ', y: 'え', a: 'D', t: 'English', ty: 'english' },
  ];
  const src = [...songs];

  const titleAsc = sortSongsList(songs, {
    sortMode: 'kana-asc',
    searchTarget: 'title',
    sourceList: src,
    keyOf,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: () => null,
  });
  if (titleAsc.map((s) => s.t).join(',') === 'Alpha,End,Z,English') ok('曲名 あ→ん ty');
  else fail('曲名 あ→ん', titleAsc.map((s) => s.t).join(','));

  const titleDesc = sortSongsList(songs, {
    sortMode: 'kana-desc',
    searchTarget: 'title',
    sourceList: src,
    keyOf,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: () => null,
  });
  if (titleDesc.map((s) => s.t).join(',') === 'Z,End,Alpha,English') ok('曲名 ん→あ ty');
  else fail('曲名 ん→あ', titleDesc.map((s) => s.t).join(','));

  const artistAsc = sortSongsList(songs, {
    sortMode: 'kana-asc',
    searchTarget: 'artist',
    sourceList: src,
    keyOf,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: () => null,
  });
  if (artistAsc.map((s) => s.a).join(',') === 'A,D,B,C') ok('アーティスト あ→ん y (flat)');
  else fail('アーティスト あ→ん flat', artistAsc.map((s) => s.a).join(','));

  const tieSongs = [
    { k: 'あ', y: 'あ', a: 'Zeta', t: 'T1', ty: 'さめ' },
    { k: 'あ', y: 'い', a: 'Alpha', t: 'T2', ty: 'さめ' },
    { k: 'あ', y: 'う', a: 'Beta', t: 'T3', ty: 'さめ' },
  ];
  const tieSorted = sortSongsList(tieSongs, {
    sortMode: 'kana-asc',
    searchTarget: 'title',
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
    searchTarget: 'title',
    sourceList: dated,
    keyOf,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: (s) => (meta[keyOf(s)] || {}).addedAt,
  });
  if (addedDesc.map((s) => s.t).join(',') === 'New,Old,NoDate') ok('最近追加 added-desc + 日時なし後ろ');
  else fail('added-desc', addedDesc.map((s) => s.t).join(','));

  const addedAsc = sortSongsList(dated, {
    sortMode: 'added-asc',
    searchTarget: 'title',
    sourceList: dated,
    keyOf,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: (s) => (meta[keyOf(s)] || {}).addedAt,
  });
  if (addedAsc.map((s) => s.t).join(',') === 'Old,New,NoDate') ok('古く追加 added-asc + 日時なし後ろ');
  else fail('added-asc', addedAsc.map((s) => s.t).join(','));

  const defaultOrder = sortSongsList(songs, {
    sortMode: 'default',
    searchTarget: 'title',
    sourceList: src,
    keyOf,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: () => null,
  });
  if (defaultOrder.map((s) => s.t).join(',') === songs.map((s) => s.t).join(',')) ok('標準順は入力順維持');
  else fail('標準順');

  const groups = [
    { artist: 'Z', songs: [{ k: 'あ', y: 'ぜっと', a: 'Z', t: 'z1' }] },
    { artist: 'A', songs: [{ k: 'あ', y: 'あ', a: 'A', t: 'a1' }] },
    { artist: 'M', songs: [{ k: 'あ', y: 'み', a: 'M', t: 'm1' }] },
  ];
  const gAsc = sortArtistGroups(groups, { sortMode: 'kana-asc', getArtistY: (s) => s.y });
  if (gAsc.map((g) => g.artist).join(',') === 'A,Z,M') ok('アコーディオン アーティスト あ→ん');
  else fail('sortArtistGroups asc', gAsc.map((g) => g.artist).join(','));

  const gDesc = sortArtistGroups(groups, { sortMode: 'kana-desc', getArtistY: (s) => s.y });
  if (gDesc.map((g) => g.artist).join(',') === 'M,Z,A') ok('アコーディオン アーティスト ん→あ');
  else fail('sortArtistGroups desc', gDesc.map((g) => g.artist).join(','));

  if (shouldUseFlatForAddedSort('artist', 'added-desc') && !shouldUseFlatForAddedSort('artist', 'kana-asc')) {
    ok('shouldUseFlatForAddedSort');
  } else fail('shouldUseFlatForAddedSort');

  if (hasAnyAddedAt(dated, (s) => (meta[keyOf(s)] || {}).addedAt)) ok('hasAnyAddedAt true');
  else fail('hasAnyAddedAt');

  const jaBeforeEn = compareReading('あ', 'english', 1);
  if (jaBeforeEn < 0) ok('日本語読みは英字より前（tier 0 vs 1）');
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
    tagPresets: [],
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

  const sortBox = page.locator('#sortSelect');
  if (await sortBox.count()) ok('編集: sortSelect 存在');
  else fail('編集: sortSelect なし');

  const h = await sortBox.evaluate((el) => el.offsetHeight);
  if (h >= 44) ok(`編集: sortSelect 高さ ${h}px`);
  else fail('編集: sortSelect タップ領域', String(h));

  const addedOptDisabled = await page.evaluate(() => {
    const o = [...document.querySelectorAll('#sortSelect option')].find((x) => x.value === 'added-desc');
    return o?.disabled;
  });
  if (addedOptDisabled) ok('編集: 全曲表示で added ソート disabled');
  else fail('編集: added ソート should be disabled for all songs');

  await setSearchTarget(page, 'title');
  await setSort(page, 'kana-asc');
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll('.flat-title-primary')].slice(0, 5).map((el) => el.textContent.trim()),
  );
  if (titles.length >= 3) ok(`編集: 曲名モード あ→ん 表示 ${titles.length}件`);
  else fail('編集: 曲名モード flat 表示', String(titles.length));

  await setSearchTarget(page, 'artist');
  await setSort(page, 'kana-asc');
  const artists = await page.evaluate(() =>
    [...document.querySelectorAll('.artist-group .artist-name')].slice(0, 5).map((el) => el.textContent.trim()),
  );
  if (artists.length >= 2) ok(`編集: アーティスト あ→ん アコーディオン ${artists.length}組`);
  else fail('編集: アーティスト accordion');

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

  await setSearchTarget(page, 'title');
  await setSort(page, 'kana-asc');
  let flat = await getFlatTitles(page);
  if (flat.join(',') === 'Alpha,Zen,Mid') ok('viewer: 曲名 あ→ん');
  else fail('viewer: 曲名 あ→ん', flat.join(','));

  await setSort(page, 'kana-desc');
  flat = await getFlatTitles(page);
  if (flat.join(',') === 'Mid,Zen,Alpha') ok('viewer: 曲名 ん→あ');
  else fail('viewer: 曲名 ん→あ', flat.join(','));

  await setSearchTarget(page, 'artist');
  await setSort(page, 'kana-asc');
  let acc = await getAccordionArtists(page);
  if (acc.join(',') === 'A,M,Z') ok('viewer: アーティスト あ→ん');
  else fail('viewer: アーティスト あ→ん', acc.join(','));

  await setSort(page, 'added-desc');
  flat = await getFlatTitles(page);
  if (flat.join(',') === 'Zen,Alpha,Mid') ok('viewer: 最近追加 flat');
  else fail('viewer: 最近追加', flat.join(','));

  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientW = await page.evaluate(() => document.documentElement.clientWidth);
  if (scrollW <= clientW + 1) ok('viewer 390px: 横スクロールなし');
  else fail('viewer 390px 横スクロール', `${scrollW} > ${clientW}`);

  if (!errors.length) ok('viewer: console エラーなし');
  else fail('viewer: console', errors.join('; '));

  await page.close();
  fs.unlinkSync(url.replace('file://', ''));
}

async function runViewportTests(browser) {
  for (const w of [320, 375, 430, 1280]) {
    const page = await browser.newPage({ viewport: { width: w, height: 800 } });
    const url = buildViewerFixture(`vp-${w}`, {
      songs: [{ k: 'あ', y: 'あ', a: 'A', t: 'Test', ty: 'てすと' }],
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('sortSelect'));
    await page.evaluate(() => document.getElementById('sortSelect')?.scrollIntoView({ block: 'center' }));
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
    'sortMode', 'SORT_OPTIONS', 'sortSelect', 'sortSongsList', 'sortArtistGroups',
    'shouldUseFlatForAddedSort', 'applySortToFiltered', 'initSortSelect',
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
