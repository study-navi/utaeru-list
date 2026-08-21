#!/usr/bin/env node
/**
 * 公開ページ（/u/{id}）アコーディオンUI回帰テスト — ローカル hiro.html / 404.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HIRO = path.join(ROOT, 'hiro.html');
const API = 'https://utaeru-api.manabit.workers.dev';

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
  const p = path.join(ROOT, 'scripts', `.fixture-${name}.html`);
  fs.writeFileSync(p, html);
  return `file://${p}`;
}

async function openSearchPanel(page) {
  const expanded = await page.evaluate(() => document.getElementById('songSearchPanel')?.classList.contains('is-expanded'));
  if (!expanded) {
    await page.click('#songSearchPanelToggle');
    await page.waitForFunction(() => document.getElementById('songSearchPanel')?.classList.contains('is-expanded'));
  }
}

async function openPage(browser, url) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-', { timeout: 10000 });
  return { page, errors };
}

async function snapshot(page) {
  return page.evaluate(() => ({
    songCountLabel: document.querySelector('.header-song-count')?.textContent?.trim(),
    statSongs: document.getElementById('statSongs')?.textContent?.trim(),
    accordions: document.querySelectorAll('.artist-accordion-item').length,
    triggers: document.querySelectorAll('.artist-accordion-trigger').length,
    flatItems: document.querySelectorAll('.flat-song-item').length,
    visibleSongRows: document.querySelectorAll('#results .song-list li, #results .flat-song-item').length,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    firstTriggerHeight: document.querySelector('.artist-accordion-trigger')?.offsetHeight || 0,
    firstExpanded: document.querySelector('.artist-accordion-trigger')?.getAttribute('aria-expanded'),
    openPanels: document.querySelectorAll('.artist-accordion-item.is-open').length,
  }));
}

async function runScenario(browser, label, songs, opts = {}) {
  const url = writeFixture(label, buildFixtureHtml({ songs, ...opts }));
  const { page, errors } = await openPage(browser, url);
  const fn = opts.run;
  if (fn) await fn(page);
  const snap = await snapshot(page);
  await page.close();
  fs.unlinkSync(url.replace('file://', ''));
  if (errors.length) fail(`${label}: console`, errors.join('; '));
  return snap;
}

function makeSongs(count) {
  const songs = [];
  for (let i = 0; i < count; i++) {
    const artist = i < count / 2 ? 'Ado' : 'YOASOBI';
    songs.push({ k: 'あ', y: 'てすと', a: artist, t: `曲${String(i + 1).padStart(3, '0')}` });
  }
  return songs;
}

async function main() {
  const browser = await chromium.launch();

  // A. 1 artist 1 song
  {
    const snap = await runScenario(browser, 'a-one-one', [{ k: 'あ', y: 'あ', a: 'Ado', t: 'うっせぇわ' }]);
    if (snap.accordions !== 1) fail('A: 1アーティスト1曲 accordion', String(snap.accordions));
    else ok('A: 1アーティスト1曲');
    if (snap.firstExpanded !== 'false') fail('A: 初期は折りたたみ', snap.firstExpanded);
    else ok('A: 初期は折りたたみ');
    if (snap.openPanels !== 0) fail('A: 展開パネル0', String(snap.openPanels));
  }

  // B. 1 artist 10+ songs
  {
    const songs = Array.from({ length: 12 }, (_, i) => ({ k: 'あ', y: 'あ', a: 'Ado', t: `曲${i + 1}` }));
    const url = writeFixture('b', buildFixtureHtml({ songs }));
    const { page } = await openPage(browser, url);
    const countText = await page.locator('.artist-accordion-count').first().textContent();
    if (countText !== '12曲') fail('B: 曲数表示', countText);
    else ok('B: 1アーティスト12曲 曲数表示');
    await page.click('.artist-accordion-trigger');
    await page.waitForFunction(() => document.querySelector('.artist-accordion-trigger')?.getAttribute('aria-expanded') === 'true');
    const rows = await page.locator('#results .song-list li').count();
    if (rows !== 12) fail('B: 展開後12曲', String(rows));
    else ok('B: 展開後12曲');
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }

  // C. multiple artists
  {
    const snap = await runScenario(browser, 'c', [
      { k: 'あ', y: 'あ', a: 'Ado', t: 'A1' },
      { k: 'あ', y: 'あ', a: 'YOASOBI', t: 'Y1' },
      { k: 'あ', y: 'あ', a: 'Mrs. GREEN APPLE', t: 'M1' },
    ]);
    if (snap.accordions !== 3) fail('C: 3アーティスト', String(snap.accordions));
    else ok('C: 複数アーティスト');
  }

  // D. multiple accordions open
  {
    const songs = [
      { k: 'あ', y: 'あ', a: 'Ado', t: 'A1' },
      { k: 'あ', y: 'あ', a: 'YOASOBI', t: 'Y1' },
    ];
    const url = writeFixture('d', buildFixtureHtml({ songs }));
    const { page } = await openPage(browser, url);
    const triggers = page.locator('.artist-accordion-trigger');
    await triggers.nth(0).click();
    await triggers.nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('.artist-accordion-item.is-open').length === 2);
    const openCount = await page.locator('.artist-accordion-item.is-open').count();
    if (openCount !== 2) fail('D: 同時展開', String(openCount));
    else ok('D: 複数アコーディオン同時展開');
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }

  // E. open → close
  {
    const url = writeFixture('e', buildFixtureHtml({ songs: [{ k: 'あ', y: 'あ', a: 'Ado', t: 'A1' }] }));
    const { page } = await openPage(browser, url);
    const btn = page.locator('.artist-accordion-trigger');
    await btn.click();
    await page.waitForFunction(() => document.querySelector('.artist-accordion-trigger')?.getAttribute('aria-expanded') === 'true');
    await btn.click();
    await page.waitForFunction(() => document.querySelector('.artist-accordion-trigger')?.getAttribute('aria-expanded') === 'false');
    ok('E: 開く→閉じる');
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }

  // F/G search
  {
    const songs = [
      { k: 'あ', y: 'あ', a: 'Ado', t: '新時代' },
      { k: 'あ', y: 'あ', a: 'YOASOBI', t: '夜に駆ける' },
    ];
    const url = writeFixture('fg', buildFixtureHtml({ songs }));
    const { page } = await openPage(browser, url);
    await openSearchPanel(page);
    await page.click('#searchTargetTitle');
    await page.fill('#searchInput', '新時代');
    await page.dispatchEvent('#searchInput', 'input');
    await page.waitForFunction(() => document.querySelectorAll('.flat-song-item').length === 1);
    const title = await page.locator('.flat-song-item .flat-title-primary').first().textContent();
    const artist = await page.locator('.flat-song-item .flat-artist-sub').first().textContent();
    if (title !== '新時代' || artist !== 'Ado') fail('F: 曲名検索', `${title}/${artist}`);
    else ok('F: 曲名検索 → フラット一覧');
    await page.click('#searchTargetArtist');
    await page.fill('#searchInput', 'YOASOBI');
    await page.dispatchEvent('#searchInput', 'input');
    await page.waitForFunction(() => document.querySelectorAll('.flat-song-item').length === 1);
    ok('G: アーティスト検索 → フラット一覧');
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }

  // H/I/J mark filters
  for (const [markKey, label] of [['signature', 'H'], ['favorite', 'I'], ['learning', 'J']]) {
    const songs = [
      { k: 'あ', y: 'あ', a: 'Ado', t: 'marked' },
      { k: 'あ', y: 'あ', a: 'Ado', t: 'plain' },
    ];
    const songMeta = { 'Ado\u0001marked': { marks: [markKey] } };
    const url = writeFixture(`mark-${markKey}`, buildFixtureHtml({ songs, songMeta }));
    const { page } = await openPage(browser, url);
    await openSearchPanel(page);
    await page.locator('#statusFilterRow .chip').filter({ hasText: markKey === 'signature' ? '⭐' : markKey === 'favorite' ? '❤️' : '🔰' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.flat-song-item').length === 1);
    const hasMark = await page.locator('.song-mark').count();
    if (hasMark < 1) fail(`${label}: マーク絞り込み表示`, String(hasMark));
    else ok(`${label}: マーク絞り込み → フラット一覧`);
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }

  // K. multiple marks
  {
    const songs = [{ k: 'あ', y: 'あ', a: 'Ado', t: 'multi' }];
    const songMeta = { 'Ado\u0001multi': { marks: ['signature', 'favorite', 'learning'] } };
    const url = writeFixture('k', buildFixtureHtml({ songs, songMeta }));
    const { page } = await openPage(browser, url);
    await page.click('.artist-accordion-trigger');
    const marks = await page.locator('.song-mark').count();
    if (marks !== 3) fail('K: 複数マーク', String(marks));
    else ok('K: 複数マーク曲');
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }

  // L. free tags — UI撤去後は tagFilterRow 非表示（データは保持）
  {
    const songs = [{ k: 'あ', y: 'あ', a: 'Ado', t: 'tagged' }];
    const tagPresets = [{ id: 't1', label: 'リクエスト可' }];
    const songMeta = { 'Ado\u0001tagged': { tags: ['t1'] } };
    const url = writeFixture('l', buildFixtureHtml({ songs, songMeta, tagPresets }));
    const { page } = await openPage(browser, url);
    const hasTagRow = await page.evaluate(() => !!document.getElementById('tagFilterRow'));
    const tagChips = await page.locator('#tagFilterRow .chip').count();
    const vTags = await page.locator('.v-tag').count();
    if (!hasTagRow && tagChips === 0 && vTags === 0) ok('L: 自由タグUI撤去（データ保持）');
    else fail('L: 自由タグUI', `${hasTagRow}/${tagChips}/${vTags}`);
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }

  // M. 0 songs
  {
    const snap = await runScenario(browser, 'm', []);
    if (snap.statSongs !== '0') fail('M: 0曲', snap.statSongs);
    else ok('M: 0曲');
  }

  // N. 100+ songs
  {
    const snap = await runScenario(browser, 'n', makeSongs(128));
    if (snap.accordions !== 2) fail('N: 100曲以上 2アーティスト', String(snap.accordions));
    else ok('N: 128曲 アコーディオン表示');
    if (snap.songCountLabel !== '歌える曲 128曲') fail('N: 総曲数ラベル', snap.songCountLabel);
    else ok('N: 歌える曲 128曲');
  }

  // O/P/Q/R viewport + a11y + keyboard
  {
    const url = writeFixture('viewport', buildFixtureHtml({
      songs: [
        { k: 'あ', y: 'あ', a: 'Ado', t: 'A1' },
        { k: 'あ', y: 'あ', a: 'YOASOBI', t: 'Y1' },
      ],
    }));
    const { page, errors } = await openPage(browser, url);
    for (const w of [320, 375, 390, 430, 1280]) {
      await page.setViewportSize({ width: w, height: w <= 430 ? 844 : 900 });
      const snap = await snapshot(page);
      if (snap.firstTriggerHeight < 44) fail(`${w}px: タップ高さ`, String(snap.firstTriggerHeight));
      else ok(`${w}px: アーティスト行 44px+`);
      if (snap.scrollW > snap.clientW + 2) fail(`${w}px: 横スクロール`, `${snap.scrollW}/${snap.clientW}`);
      else ok(`${w}px: 横スクロールなし`);
    }
    const btn = page.locator('.artist-accordion-trigger').first();
    await btn.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.artist-accordion-trigger')?.getAttribute('aria-expanded') === 'true');
    ok('Q: キーボード Enter で展開');
    const expanded = await btn.getAttribute('aria-expanded');
    const controls = await btn.getAttribute('aria-controls');
    if (expanded !== 'true' || !controls) fail('R: aria-expanded/controls', `${expanded}/${controls}`);
    else ok('R: aria-expanded / aria-controls');
    if (errors.length) fail('T: console', errors.join('; '));
    else ok('T: Consoleエラーなし');
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }

  // 404.html sync
  const html404 = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
  for (const needle of ['artist-accordion', 'isFlatListMode', 'expandedArtists', 'flat-song-list', 'header-song-count']) {
    if (html404.includes(needle)) ok(`404.html: ${needle}`);
    else fail(`404.html: ${needle}`, 'missing');
  }

  // /u/hiro GET only — 本テストでは PUT/DELETE していないことの確認（値は参照のみ）
  const r = await fetch(`${API}/api/public/hiro`);
  const data = await r.json();
  if (r.status === 200 && data.streamerName && Array.isArray(data.songs)) {
    ok(`/u/hiro API GET: ${data.streamerName} / ${data.songs.length}曲 / updatedAt=${data.updatedAt}（参照のみ・未更新）`);
  } else {
    fail('/u/hiro API GET', JSON.stringify({ status: r.status, name: data.streamerName }));
  }

  // Local hiro.html default sample
  {
    const { page } = await openPage(browser, `file://${HIRO}`);
    const snap = await snapshot(page);
    if (snap.accordions !== 2) fail('hiro.html: 2アーティスト', String(snap.accordions));
    else ok('hiro.html: 相川七瀬 + aiko アコーディオン');
    if (snap.songCountLabel !== '歌える曲 14曲') fail('hiro.html: 総曲数', snap.songCountLabel);
    else ok('hiro.html: 歌える曲 14曲');
    await page.close();
  }

  await browser.close();

  console.log('');
  if (failed) {
    console.error(`${failed} 件失敗`);
    process.exit(1);
  }
  console.log('すべて成功');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
