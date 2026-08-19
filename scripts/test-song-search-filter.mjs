#!/usr/bin/env node
/**
 * 検索モード（曲名 / アーティスト）+ 五十音 + テキスト検索 回帰テスト
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function openSongs(page) {
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.click('#editTabSongs');
  await page.waitForSelector('#panelSongs:not([hidden])', { timeout: 5000 });
  await page.evaluate(() => {
    document.querySelector('.song-search-block')?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(80);
}

async function clickGyo(page, label) {
  await page.evaluate((gyoLabel) => {
    const chips = [...document.querySelectorAll('#gyoRow .chip')];
    const chip = chips.find((c) => c.textContent === (gyoLabel ? `${gyoLabel}行` : 'すべて'));
    chip?.click();
  }, label);
  await page.waitForTimeout(120);
}

async function clickSubKana(page, char) {
  await page.evaluate((kana) => {
    const chips = [...document.querySelectorAll('#gyoSubRow .chip')];
    const chip = chips.find((c) => c.textContent === (kana || 'すべて'));
    chip?.click();
  }, char);
  await page.waitForTimeout(120);
}

async function setSearchTarget(page, target) {
  await page.evaluate((t) => {
    const id = t === 'artist' ? 'searchTargetArtist' : 'searchTargetTitle';
    document.getElementById(id)?.click();
  }, target);
  await page.waitForTimeout(100);
}

async function setSearch(page, text) {
  await page.fill('#searchInput', text);
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(120);
}

async function clickGenre(page, label) {
  await page.evaluate((genreLabel) => {
    const chip = [...document.querySelectorAll('#narrowFilterRow .chip')].find((c) => c.textContent === genreLabel);
    chip?.click();
  }, label);
  await page.waitForTimeout(120);
}

async function runViewport(label, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openSongs(page);

  if (errors.length) fail(`${label}: JSエラー`, errors.join('; '));
  else ok(`${label}: JSエラーなし`);

  const defaultMode = await page.evaluate(() => ({
    target: searchTarget,
    artistTabActive: document.getElementById('searchTargetArtist')?.classList.contains('active'),
    gyoVisible: document.getElementById('gyoRow')?.style.display !== 'none',
    placeholder: document.getElementById('searchInput')?.placeholder,
  }));
  if (defaultMode.target !== 'artist' || !defaultMode.artistTabActive) {
    fail(`${label}: 初期モードはアーティスト`, JSON.stringify(defaultMode));
  } else ok(`${label}: 初期モードはアーティスト`);
  if (!defaultMode.gyoVisible) fail(`${label}: 五十音表示`, JSON.stringify(defaultMode));
  else ok(`${label}: 五十音表示`);
  if (defaultMode.placeholder !== 'アーティスト名を入力') fail(`${label}: プレースホルダ`, defaultMode.placeholder);
  else ok(`${label}: プレースホルダ`);

  const segment = await page.evaluate(() => {
    const seg = document.querySelector('.search-mode-segment');
    const tabs = [...document.querySelectorAll('.search-mode-tab')];
    return {
      width: seg?.getBoundingClientRect().width || 0,
      minTabHeight: tabs.length ? Math.min(...tabs.map((t) => t.getBoundingClientRect().height)) : 0,
    };
  });
  if (width >= 375 && segment.minTabHeight < 44) fail(`${label}: タップ領域44px`, String(segment.minTabHeight));
  else if (width >= 375) ok(`${label}: タップ領域44px以上`);
  else ok(`${label}: 320px レイアウト確認`);

  await setSearchTarget(page, 'artist');
  await clickGyo(page, 'あ');
  const subA = await page.evaluate(() => ({
    visible: !document.getElementById('gyoSubRow')?.hidden,
    chars: [...document.querySelectorAll('#gyoSubRow .chip')].map((c) => c.textContent),
  }));
  if (!subA.visible || !subA.chars.includes('あ')) fail(`${label}: あ行→第2フィルター`, JSON.stringify(subA));
  else ok(`${label}: あ行→第2フィルター`);

  await clickSubKana(page, 'あ');
  const onlyA = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return { count: filtered.length, allA: filtered.every((s) => s.k === 'あ') };
  });
  if (!onlyA.count || !onlyA.allA) fail(`${label}: アーティストあ行→あ`, JSON.stringify(onlyA));
  else ok(`${label}: アーティストあ行→あ (${onlyA.count}曲)`);

  await clickGyo(page, null);
  await setSearchTarget(page, 'title');
  const titleMode = await page.evaluate(() => ({
    target: searchTarget,
    gyoVisible: document.getElementById('gyoRow')?.style.display !== 'none',
    placeholder: document.getElementById('searchInput')?.placeholder,
    flat: !document.querySelector('.artist-group'),
  }));
  if (titleMode.target !== 'title' || !titleMode.gyoVisible) fail(`${label}: 曲名モード五十音`, JSON.stringify(titleMode));
  else ok(`${label}: 曲名モード五十音表示`);
  if (titleMode.placeholder !== '曲名を入力') fail(`${label}: 曲名プレースホルダ`, titleMode.placeholder);
  else ok(`${label}: 曲名プレースホルダ`);

  await clickGyo(page, 'さ');
  const titleSa = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    const samples = filtered.filter((s) => ['新時代', 'シャルル', 'シルエット'].includes(s.t)).map((s) => s.t);
    return {
      count: filtered.length,
      allTkSa: filtered.every((s) => s.tk && gyoOf(s.tk) === 'さ'),
      samples,
    };
  });
  if (!titleSa.count || !titleSa.allTkSa) fail(`${label}: 曲名さ行`, JSON.stringify(titleSa));
  else ok(`${label}: 曲名さ行 (${titleSa.count}曲, 例:${titleSa.samples.join('/')})`);

  await clickGyo(page, null);
  await setSearch(page, 'Story');
  const titleSearch = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return {
      count: filtered.length,
      titleOnly: filtered.every((s) => matchesTitleSearch(s, norm('Story'))),
      hasArtistInMain: !!document.querySelector('.flat-title-primary'),
    };
  });
  if (!titleSearch.count || !titleSearch.titleOnly) fail(`${label}: 曲名テキスト検索`, JSON.stringify(titleSearch));
  else ok(`${label}: 曲名テキスト検索 (${titleSearch.count}曲)`);

  await setSearch(page, '');
  await setSearchTarget(page, 'artist');
  await setSearch(page, '相川');
  const artistNameSearch = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return { count: filtered.length, ok: filtered.every((s) => matchesArtistSearch(s, norm('相川'))) };
  });
  if (!artistNameSearch.count || !artistNameSearch.ok) fail(`${label}: アーティスト名検索`, JSON.stringify(artistNameSearch));
  else ok(`${label}: アーティスト名検索 (${artistNameSearch.count}曲)`);

  await setSearch(page, '');
  await setSearch(page, '大塚愛');
  const ohtsuka = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    const grouped = buildArtistGroups(filtered, {
      sortMode: 'artist-asc',
      sourceList: MASTER_SONGS,
      keyOf,
      getTitleTy: (s) => s.ty || '',
      getArtistY: (s) => s.y,
      getAddedAt: () => null,
      getBatchOrder: () => undefined,
    });
    const stored = MASTER_SONGS.filter((s) => s.a === '大塚 愛' || s.a === '大塚愛').map((s) => s.a);
    return {
      count: filtered.length,
      groupCount: grouped.length,
      groupArtist: grouped[0]?.artist,
      stored,
      allMatch: filtered.every((s) => matchesArtistSearch(s, '大塚愛')),
    };
  });
  if (ohtsuka.count !== 9 || !ohtsuka.allMatch || ohtsuka.groupCount !== 1) fail(`${label}: 大塚愛検索9曲`, JSON.stringify(ohtsuka));
  else ok(`${label}: 大塚愛検索9曲（スペースあり含む）`);
  if (ohtsuka.stored.includes('大塚 愛') && ohtsuka.stored.includes('大塚愛')) ok(`${label}: 大塚愛の保存表記は変更なし`);
  else fail(`${label}: 大塚愛表記保持`, ohtsuka.stored.join(','));

  await setSearch(page, '大塚 愛');
  const ohtsukaSp = await page.evaluate(() => filterSongsForList(MASTER_SONGS).length);
  if (ohtsukaSp !== 9) fail(`${label}: 大塚 愛検索`, String(ohtsukaSp));
  else ok(`${label}: 大塚 愛検索も9曲`);

  await setSearch(page, 'いきものがかり');
  const ikimono = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return {
      count: filtered.length,
      artists: [...new Set(filtered.map((s) => s.a))],
      titles: filtered.map((s) => displaySongTitle(s.t)),
    };
  });
  if (ikimono.count !== 10 || ikimono.artists.join() !== 'いきものがかり') {
    fail(`${label}: いきものがかり検索`, JSON.stringify(ikimono));
  } else ok(`${label}: いきものがかり検索10曲`);
  if (ikimono.titles.includes('コイスルオトメ') && !ikimono.titles.some((t) => t.startsWith('い,いきものがかり'))) {
    ok(`${label}: コイスルオトメ表示`);
  } else fail(`${label}: コイスルオトメ表示`, ikimono.titles.join(' / '));

  await setSearch(page, '');
  await clickGyo(page, 'か');
  await clickSubKana(page, 'こ');
  await setSearch(page, 'コブクロ');
  const combined = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return {
      count: filtered.length,
      gyoOk: filtered.every((s) => gyoOf(s.k) === 'か' && s.k === 'こ'),
      artistOk: filtered.every((s) => matchesArtistSearch(s, norm('コブクロ'))),
    };
  });
  if (!combined.count || !combined.gyoOk || !combined.artistOk) fail(`${label}: 五十音+検索AND`, JSON.stringify(combined));
  else ok(`${label}: 五十音+検索AND (${combined.count}曲)`);

  await setSearch(page, '');
  await clickGyo(page, null);
  await clickGenre(page, 'アニソン');
  await setSearchTarget(page, 'title');
  await clickGyo(page, 'さ');
  const genreAndGyo = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return {
      count: filtered.length,
      genreOk: filtered.every((s) => songMatchesNarrowFilter(s)),
      tkOk: filtered.every((s) => s.tk && gyoOf(s.tk) === 'さ'),
    };
  });
  if (!genreAndGyo.count || !genreAndGyo.genreOk || !genreAndGyo.tkOk) fail(`${label}: ジャンル+曲名五十音`, JSON.stringify(genreAndGyo));
  else ok(`${label}: ジャンル+曲名五十音 (${genreAndGyo.count}曲)`);

  const genreAfterModeSwitch = await page.evaluate(() => activeFilter);
  await setSearchTarget(page, 'artist');
  const genreKept = await page.evaluate(() => activeFilter);
  if (genreKept !== genreAfterModeSwitch || genreKept !== 'アニソン') fail(`${label}: モード切替でジャンル維持`, genreKept);
  else ok(`${label}: モード切替でジャンル維持`);

  await clickGyo(page, null);
  await clickGenre(page, 'アニソン');
  await setSearchTarget(page, 'artist');
  const accordion = await page.evaluate(() => !!document.querySelector('.artist-group'));
  if (!accordion) fail(`${label}: アーティストモードアコーディオン`);
  else ok(`${label}: アーティストモードアコーディオン`);

  const scroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (scroll) fail(`${label}: 横スクロール`);
  else ok(`${label}: 横スクロールなし`);

  await browser.close();
}

const val = spawnSync(process.execPath, ['scripts/validate-master-songs.mjs'], { cwd: ROOT, encoding: 'utf8' });
if (val.status !== 0) {
  process.stdout.write(val.stdout || '');
  process.stderr.write(val.stderr || '');
  process.exit(val.status || 1);
}
ok('MASTER_SONGS validate-master-songs.mjs');

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
console.log('\nAll song search/filter checks passed.');
