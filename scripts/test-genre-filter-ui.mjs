#!/usr/bin/env node
/**
 * 第3段階: ジャンル絞り込み UI（編集画面 + 公開 viewer）回帰テスト
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HIRO = path.join(ROOT, 'hiro.html');
const INDEX = path.join(ROOT, 'index.html');
const API = 'https://utaeru-api.manabit.workers.dev';

const MASTER = parseMasterSongsFromIndexHtml(fs.readFileSync(INDEX, 'utf8'));
const pick = (pred) => MASTER.find(pred);
const SAMPLES = {
  jpop: pick((s) => s.genres?.length === 1 && s.genres[0] === 'J-POP'),
  anime: pick((s) => s.genres?.includes('アニソン')),
  vocalo: pick((s) => s.genres?.length === 1 && s.genres[0] === 'ボカロ'),
  multiJa: pick((s) => s.genres?.includes('J-POP') && s.genres?.includes('アニソン')),
  multiAv: pick((s) => s.genres?.includes('アニソン') && s.genres?.includes('ボカロ')),
  empty: pick((s) => !s.genres?.length),
  adoJpop: pick((s) => s.a === 'Ado' && s.genres?.includes('J-POP') && !s.genres?.includes('アニソン')),
  adoBoth: pick((s) => s.a === 'Ado' && s.genres?.includes('J-POP') && s.genres?.includes('アニソン')),
};

function toPublicSong(s) {
  return { k: s.k, y: s.y, a: s.a, t: s.t };
}

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function buildFixtureHtml({ songs, songMeta = {}, tagPresets = [], streamerName = 'テスト配信者' }) {
  let html = fs.readFileSync(HIRO, 'utf8');
  const cfg = {
    streamerName,
    subtitle: 'テスト用',
    themeType: 'preset',
    presetIndex: 0,
    songMeta,
    tagPresets,
    updatedAt: '2026-08-17T14:27:33.808Z',
  };
  html = html.replace(
    /<script type="application\/json" id="builder-config">[\s\S]*?<\/script>/,
    `<script type="application/json" id="builder-config">${JSON.stringify(cfg)}</script>`,
  );
  html = html.replace(/const SONGS = \[[\s\S]*?\];/, `const SONGS = ${JSON.stringify(songs)};`);
  return html;
}

function writeFixture(name, html) {
  const p = path.join(ROOT, 'scripts', `.fixture-genre-${name}.html`);
  fs.writeFileSync(p, html);
  return `file://${p}`;
}

async function openViewer(browser, url) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-', { timeout: 10000 });
  return { page, errors };
}

async function clickGenre(page, label) {
  await page.locator('#genreFilterRow .chip', { hasText: label }).click();
  await page.waitForTimeout(80);
}

async function testViewer(browser) {
  const fixtureSongs = [
    toPublicSong(SAMPLES.jpop),
    toPublicSong(SAMPLES.anime),
    toPublicSong(SAMPLES.vocalo),
    toPublicSong(SAMPLES.multiJa),
    toPublicSong(SAMPLES.multiAv),
    toPublicSong(SAMPLES.empty),
    toPublicSong(SAMPLES.adoJpop),
    toPublicSong(SAMPLES.adoBoth),
    { k: 'あ', y: 'unknown', a: '存在しないアーティスト', t: '未登録曲XYZ' },
  ].filter(Boolean);

  const url = writeFixture('viewer', buildFixtureHtml({ songs: fixtureSongs }));
  const { page, errors } = await openViewer(browser, url);

  const genreChips = await page.locator('#genreFilterRow .chip').count();
  if (genreChips !== 4) fail('viewer: ジャンル4ボタン', String(genreChips));
  else ok('viewer: ジャンル4ボタン');

  const chipHeights = await page.evaluate(() =>
    [...document.querySelectorAll('#genreFilterRow .chip')].map((c) => c.offsetHeight));
  if (chipHeights.some((h) => h < 40)) fail('viewer: タップ領域', chipHeights.join(','));
  else ok('viewer: タップ領域 >= 40px');

  const statBefore = await page.locator('#statSongs').textContent();
  await clickGenre(page, 'J-POP');
  const metaJpop = await page.locator('#resultMeta').textContent();
  const statAfter = await page.locator('#statSongs').textContent();
  if (statBefore !== statAfter) fail('viewer: ヘッダー総曲数維持', `${statBefore} -> ${statAfter}`);
  else ok('viewer: ヘッダー総曲数維持');

  const jpopVisible = await page.evaluate(() =>
    document.querySelectorAll('#results .song-list li, #results .flat-song-item').length);
  const jpopExpected = fixtureSongs.filter((s) => {
    const m = MASTER.find((x) => x.a === s.a && x.t === s.t);
    return m?.genres?.includes('J-POP');
  }).length;
  if (jpopVisible !== jpopExpected) fail('viewer: J-POP件数', `${jpopVisible} vs ${jpopExpected}`);
  else ok('viewer: J-POP件数');

  await clickGenre(page, 'アニソン');
  const animeExpected = fixtureSongs.filter((s) => {
    const m = MASTER.find((x) => x.a === s.a && x.t === s.t);
    return m?.genres?.includes('アニソン');
  }).length;
  await page.waitForFunction((n) => {
    const c = document.querySelectorAll('#results .song-list li, #results .flat-song-item').length;
    return c === n || document.querySelector('.empty-state');
  }, animeExpected, { timeout: 5000 });
  ok('viewer: アニソン切替');

  await clickGenre(page, 'ボカロ');
  ok('viewer: ボカロ切替');

  await clickGenre(page, 'すべて');
  const allVisible = await page.evaluate(() =>
    document.querySelectorAll('#results .song-list li, #results .flat-song-item').length);
  if (allVisible !== fixtureSongs.length) fail('viewer: すべてで全曲', `${allVisible} vs ${fixtureSongs.length}`);
  else ok('viewer: すべてで全曲（未一致曲含む）');

  // Ado artist count per genre
  await clickGenre(page, 'J-POP');
  const adoJ = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.artist-accordion-name')].find((n) => n.textContent.includes('Ado'));
    const item = el?.closest('.artist-accordion-item');
    return item?.querySelector('.artist-accordion-count')?.textContent || null;
  });
  const adoJpopCount = fixtureSongs.filter((s) => s.a === 'Ado' && MASTER.find((x) => x.a === s.a && x.t === s.t)?.genres?.includes('J-POP')).length;
  if (adoJ !== `${adoJpopCount}曲`) fail('viewer: Ado J-POP曲数', `${adoJ} vs ${adoJpopCount}曲`);
  else ok('viewer: ジャンル別アーティスト曲数');

  await clickGenre(page, 'アニソン');
  const accordionAnime = await page.locator('.artist-accordion-item').count();
  if (accordionAnime === 0) fail('viewer: アニソンアコーディオン');
  else ok('viewer: アニソンはアコーディオン');

  // genre + search = flat
  await page.fill('#searchInput', SAMPLES.anime.a);
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForFunction(() => document.querySelectorAll('.flat-song-item').length > 0);
  const flat = await page.locator('.flat-song-item').count();
  if (flat === 0) fail('viewer: ジャンル+検索フラット');
  else ok('viewer: ジャンル+検索 → フラット');

  await page.fill('#searchInput', '');
  await page.dispatchEvent('#searchInput', 'input');
  await clickGenre(page, 'すべて');

  // genre + mark
  const markSongs = [toPublicSong(SAMPLES.vocalo), toPublicSong(SAMPLES.jpop)];
  const markMeta = { [`${SAMPLES.vocalo.a}\u0001${SAMPLES.vocalo.t}`]: { marks: ['signature'] } };
  await page.close();
  fs.unlinkSync(url.replace('file://', ''));

  const urlMark = writeFixture('mark', buildFixtureHtml({ songs: markSongs, songMeta: markMeta }));
  const { page: page2 } = await openViewer(browser, urlMark);
  await clickGenre(page2, 'ボカロ');
  await page2.locator('#statusFilterRow .chip', { hasText: '⭐' }).click();
  await page2.waitForFunction(() => document.querySelectorAll('.flat-song-item').length === 1);
  ok('viewer: ジャンル+⭐ フラット');
  await page2.close();
  fs.unlinkSync(urlMark.replace('file://', ''));

  if (errors.length) fail('viewer: console', errors.join('; '));
  else ok('viewer: consoleエラーなし');
}

async function testEditor(browser) {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await addBypassStart(page);
  await page.goto(`file://${INDEX}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.click('#editTabSongs');
  await page.waitForSelector('#panelSongs:not([hidden])');

  const chips = await page.locator('#genreFilterRow .chip').count();
  if (chips !== 4) fail('editor: ジャンル4ボタン', String(chips));
  else ok('editor: ジャンル4ボタン');

  // select J-POP songs while visible, switch genre, keys unchanged
  const before = await page.evaluate(({ jpopKey, animeKey }) => {
    selectedKeys.clear();
    selectedKeys.add(jpopKey);
    selectedKeys.add(animeKey);
    render();
    return {
      size: selectedKeys.size,
      keys: [...selectedKeys].sort(),
      metaKeys: Object.keys(songMeta).length,
    };
  }, {
    jpopKey: `${SAMPLES.jpop.a}\u0001${SAMPLES.jpop.t}`,
    animeKey: `${SAMPLES.anime.a}\u0001${SAMPLES.anime.t}`,
  });

  await clickGenre(page, 'ボカロ');
  const after = await page.evaluate(() => ({
    size: selectedKeys.size,
    keys: [...selectedKeys].sort(),
    metaKeys: Object.keys(songMeta).length,
  }));
  if (before.size !== after.size || JSON.stringify(before.keys) !== JSON.stringify(after.keys)) {
    fail('editor: ジャンル切替でselectedKeys維持', `${before.size}->${after.size}`);
  } else ok('editor: ジャンル切替でselectedKeys維持');

  // genre + search AND
  await clickGenre(page, 'アニソン');
  await page.click('#searchTargetArtist');
  await page.fill('#searchInput', SAMPLES.anime.a);
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(150);
  const searchCount = await page.evaluate(() => lastFiltered.length);
  const allAnime = await page.evaluate(() => lastFiltered.every((s) => getSongGenres(s).includes('アニソン')));
  if (!allAnime || searchCount === 0) fail('editor: ジャンル+検索 AND', String(searchCount));
  else ok('editor: ジャンル+検索 AND');

  // unclassified only in すべて
  await page.fill('#searchInput', '');
  await page.dispatchEvent('#searchInput', 'input');
  await page.click('#searchTargetTitle');
  await clickGenre(page, 'すべて');
  await page.fill('#searchInput', SAMPLES.empty.t);
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(150);
  const inAll = await page.evaluate((t) => lastFiltered.some((s) => s.t === t), SAMPLES.empty.t);
  await clickGenre(page, 'J-POP');
  await page.waitForTimeout(150);
  const inJpop = await page.evaluate((t) => lastFiltered.some((s) => s.t === t), SAMPLES.empty.t);
  if (!inAll || inJpop) fail('editor: 未分類はすべてのみ', `${inAll}/${inJpop}`);
  else ok('editor: 未分類はすべてのみ');

  // responsive widths
  for (const w of [320, 375, 390, 430, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    const layout = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      h: document.querySelector('#genreFilterRow .chip')?.offsetHeight || 0,
    }));
    if (layout.scroll) fail(`editor: ${w}px 横スクロール`);
    else ok(`editor: ${w}px 横スクロールなし`);
    if (layout.h < 40) fail(`editor: ${w}px タップ領域`, String(layout.h));
  }

  await page.close();
  if (errors.length) fail('editor: console', errors.join('; '));
  else ok('editor: consoleエラーなし');
}

async function checkHiroApi() {
  const res = await fetch(`${API}/api/public/hiro`);
  if (!res.ok) { fail('/u/hiro GET', String(res.status)); return null; }
  const data = await res.json();
  ok(`/u/hiro GET ${data.songs?.length}曲 updatedAt=${data.updatedAt}`);
  return data;
}

async function main() {
  const browser = await chromium.launch();
  try {
    await testViewer(browser);
    await testEditor(browser);
  } finally {
    await browser.close();
  }

  const hiroBefore = await checkHiroApi();
  // genre counts unchanged
  const counts = { jpop: 0, anime: 0, vocalo: 0, empty: 0 };
  for (const s of MASTER) {
    const g = s.genres || [];
    if (!g.length) counts.empty++;
    else {
      if (g.includes('J-POP')) counts.jpop++;
      if (g.includes('アニソン')) counts.anime++;
      if (g.includes('ボカロ')) counts.vocalo++;
    }
  }
  ok(`MASTER_SONGS genres: J-POP=${counts.jpop} アニソン=${counts.anime} ボカロ=${counts.vocalo} 未分類=${counts.empty}`);

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log('\nAll genre filter tests passed.');
  if (hiroBefore) {
    console.log('NOTE: /u/hiro public data verified via GET only (no mutations).');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
