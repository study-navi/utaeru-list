#!/usr/bin/env node
/**
 * Utalis v1.0: 曲検索・五十音フィルター改善 回帰テスト
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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

  const titleModeGyo = await page.evaluate(() => ({
    gyoHidden: document.getElementById('gyoRow')?.style.display === 'none',
    subHidden: document.getElementById('gyoSubRow')?.hidden,
    target: searchTarget,
  }));
  if (!titleModeGyo.gyoHidden || !titleModeGyo.subHidden || titleModeGyo.target !== 'title') {
    fail(`${label}: 曲名モードで五十音非表示`, JSON.stringify(titleModeGyo));
  } else ok(`${label}: 曲名モードで五十音非表示`);

  await setSearchTarget(page, 'artist');
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
    return { count: filtered.length, allA: filtered.every((s) => s.k === 'あ') };
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
    activeKana,
    subChars: [...document.querySelectorAll('#gyoSubRow .chip')].map((c) => c.textContent),
    activeGyo,
  }));
  if (resetSub.activeKana !== null) fail(`${label}: 行変更で子文字リセット`, JSON.stringify(resetSub));
  else ok(`${label}: 行変更で子文字リセット`);
  if (!resetSub.subChars.includes('こ')) fail(`${label}: か行の実データk`, JSON.stringify(resetSub.subChars));
  else ok(`${label}: か行の実データk`);

  await clickGyo(page, null);
  await setSearchTarget(page, 'title');
  await setSearch(page, 'Story');
  const titleSearch = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return {
      count: filtered.length,
      titleOnly: filtered.every((s) => norm(s.t).includes(norm('Story'))),
      gyoInactive: filtered.length === filterSongsForList(MASTER_SONGS.filter(() => true)).length || true,
    };
  });
  if (!titleSearch.count || !titleSearch.titleOnly) fail(`${label}: 曲名検索`, JSON.stringify(titleSearch));
  else ok(`${label}: 曲名検索 (${titleSearch.count}曲)`);

  await setSearch(page, '');
  await setSearchTarget(page, 'artist');
  await setSearch(page, '相川');
  const artistNameSearch = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return { count: filtered.length, ok: filtered.every((s) => norm(s.a).includes(norm('相川'))) };
  });
  if (!artistNameSearch.count || !artistNameSearch.ok) fail(`${label}: アーティスト名検索`, JSON.stringify(artistNameSearch));
  else ok(`${label}: アーティスト名検索 (${artistNameSearch.count}曲)`);

  await setSearch(page, 'あいかわななせ');
  const artistYomiSearch = await page.evaluate(() => {
    const filtered = filterSongsForList(MASTER_SONGS);
    return {
      count: filtered.length,
      ok: filtered.length > 0 && filtered.every((s) => norm(s.y).includes(norm('あいかわななせ'))),
    };
  });
  if (!artistYomiSearch.ok) fail(`${label}: アーティスト読み検索`, JSON.stringify(artistYomiSearch));
  else ok(`${label}: アーティスト読み検索 (${artistYomiSearch.count}曲)`);

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

  await setSearchTarget(page, 'title');
  const firstTitlePrefix = await page.evaluate(() => MASTER_SONGS[0].t.slice(0, 2));
  await setSearch(page, firstTitlePrefix);
  const selectedSearch = await page.evaluate(() => filterSongsForList(MASTER_SONGS).length);
  if (selectedSearch < 1) fail(`${label}: 選択中曲名検索`, String(selectedSearch));
  else ok(`${label}: 選択中曲名検索`);

  if (selectedUi.scroll) fail(`${label}: 横スクロール`);
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
