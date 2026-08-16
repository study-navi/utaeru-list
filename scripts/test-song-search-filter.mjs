#!/usr/bin/env node
/**
 * Utalis v1.0: 曲検索・五十音フィルター改善 回帰テスト
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

async function openSongs(page) {
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.click('#editTabSongs');
  await page.waitForSelector('#panelSongs:not([hidden])', { timeout: 5000 });
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
  await page.click(target === 'artist' ? '#searchTargetArtist' : '#searchTargetTitle');
  await page.waitForTimeout(80);
}

async function setSearch(page, text) {
  await page.fill('#searchInput', text);
  await page.dispatchEvent('#searchInput', 'input');
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

  await clickGyo(page, 'あ');
  const subA = await page.evaluate(() => ({
    visible: !document.getElementById('gyoSubRow')?.hidden,
    chars: [...document.querySelectorAll('#gyoSubRow .chip')].map((c) => c.textContent),
  }));
  if (!subA.visible || !subA.chars.includes('あ') || !subA.chars.includes('う')) {
    fail(`${label}: あ行→第2フィルター`, JSON.stringify(subA));
  } else ok(`${label}: あ行→第2フィルター`);

  await clickSubKana(page, 'あ');
  const onlyA = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return {
      count: filtered.length,
      allA: filtered.every((s) => s.k === 'あ'),
      meta: document.getElementById('resultMeta')?.textContent || '',
    };
  });
  if (!onlyA.count || !onlyA.allA) fail(`${label}: あ行→あ`, JSON.stringify(onlyA));
  else ok(`${label}: あ行→あ (${onlyA.count}曲)`);

  await clickSubKana(page, 'う');
  const onlyU = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return { count: filtered.length, allU: filtered.every((s) => s.k === 'う') };
  });
  if (!onlyU.count || !onlyU.allU) fail(`${label}: あ行→う`, JSON.stringify(onlyU));
  else ok(`${label}: あ行→う (${onlyU.count}曲)`);

  await clickGyo(page, 'か');
  const resetSub = await page.evaluate(() => ({
    activeKana: activeKana,
    subChars: [...document.querySelectorAll('#gyoSubRow .chip')].map((c) => c.textContent),
    activeGyo,
  }));
  if (resetSub.activeKana !== null || !resetSub.subChars.includes('こ')) {
    fail(`${label}: 行変更で子文字リセット`, JSON.stringify(resetSub));
  }   else ok(`${label}: 行変更で子文字リセット`);

  await clickGyo(page, null);
  await setSearch(page, '');

  await setSearchTarget(page, 'title');
  await setSearch(page, 'Story');
  const titleSearch = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return {
      count: filtered.length,
      titleOnly: filtered.every((s) => norm(s.t).includes(norm('Story'))),
      artistFalse: filtered.every((s) => !norm(s.a).includes(norm('Story')) || norm(s.t).includes(norm('Story'))),
    };
  });
  if (!titleSearch.count || !titleSearch.titleOnly) fail(`${label}: 曲名検索`, JSON.stringify(titleSearch));
  else ok(`${label}: 曲名検索 (${titleSearch.count}曲)`);

  await setSearch(page, '');
  await setSearchTarget(page, 'artist');
  await setSearch(page, '相川');
  const artistSearch = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return {
      count: filtered.length,
      artistOnly: filtered.every((s) => norm(s.a).includes(norm('相川'))),
      noTitleOnly: filtered.every((s) => norm(s.t).includes(norm('相川')) || norm(s.a).includes(norm('相川'))),
    };
  });
  if (!artistSearch.count || !artistSearch.artistOnly) fail(`${label}: アーティスト検索`, JSON.stringify(artistSearch));
  else ok(`${label}: アーティスト検索 (${artistSearch.count}曲)`);

  await setSearch(page, '');
  await clickGyo(page, 'か');
  await clickSubKana(page, 'こ');
  await setSearchTarget(page, 'artist');
  await setSearch(page, 'コブクロ');
  const combined = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return {
      count: filtered.length,
      gyoOk: filtered.every((s) => gyoOf(s.k) === 'か' && s.k === 'こ'),
      artistOk: filtered.every((s) => norm(s.a).includes(norm('コブクロ'))),
    };
  });
  if (!combined.count || !combined.gyoOk || !combined.artistOk) fail(`${label}: 五十音+検索AND`, JSON.stringify(combined));
  else ok(`${label}: 五十音+検索AND (${combined.count}曲)`);

  await setSearch(page, '');
  await clickGyo(page, null);
  const afterClear = await page.evaluate(() => ({
    count: filterSongsForList(MASTER_SONGS).length,
    master: MASTER_SONGS.length,
    subHidden: document.getElementById('gyoSubRow')?.hidden,
  }));
  if (afterClear.count !== afterClear.master || !afterClear.subHidden) fail(`${label}: 検索解除`, JSON.stringify(afterClear));
  else ok(`${label}: 検索解除`);

  await page.evaluate(() => {
    selectedKeys.clear();
    selectedKeys.add(keyOf(MASTER_SONGS[0]));
    selectedKeys.add(keyOf(MASTER_SONGS[1]));
    render();
    updateSelectedCount();
  });
  await setSearchTarget(page, 'title');
  await page.click('#viewTabSelected');
  await page.waitForTimeout(120);

  const selectedUi = await page.evaluate(() => ({
    gyoHidden: document.getElementById('gyoRow')?.style.display === 'none',
    subHidden: document.getElementById('gyoSubRow')?.hidden || document.getElementById('gyoSubRow')?.style.display === 'none',
    titlePh: document.getElementById('searchInput')?.placeholder || '',
    scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  if (!selectedUi.gyoHidden || !selectedUi.subHidden) fail(`${label}: 選択中は五十音非表示`, JSON.stringify(selectedUi));
  else ok(`${label}: 選択中は五十音非表示`);
  if (!selectedUi.titlePh.includes('選択中') || !selectedUi.titlePh.includes('曲名')) {
    fail(`${label}: 選択中曲名placeholder`, selectedUi.titlePh);
  } else ok(`${label}: 選択中曲名placeholder`);

  await setSearchTarget(page, 'artist');
  const selectedArtistPh = await page.evaluate(() => document.getElementById('searchInput')?.placeholder || '');
  if (!selectedArtistPh.includes('アーティスト')) fail(`${label}: 選択中アーティストplaceholder`, selectedArtistPh);
  else ok(`${label}: 選択中アーティストplaceholder`);

  await setSearchTarget(page, 'title');
  const firstTitlePrefix = await page.evaluate(() => MASTER_SONGS[0].t.slice(0, 2));
  await setSearch(page, firstTitlePrefix);
  const selectedSearch = await page.evaluate(() => filterSongsForList(MASTER_SONGS).length);
  if (selectedSearch < 1) fail(`${label}: 選択中曲名検索`, String(selectedSearch));
  else ok(`${label}: 選択中曲名検索`);

  await page.click('#viewTabAll');
  await page.waitForTimeout(80);
  const preserved = await page.evaluate(() => selectedKeys.size);
  if (preserved < 2) fail(`${label}: タブ往復で選択保持`, String(preserved));
  else ok(`${label}: タブ往復で選択保持 (${preserved})`);

  if (selectedUi.scroll) fail(`${label}: 横スクロール`);
  else ok(`${label}: 横スクロールなし`);

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
console.log('\nAll song search/filter checks passed.');
