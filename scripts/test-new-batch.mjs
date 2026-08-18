#!/usr/bin/env node
/**
 * UTAEMO新着バッチ ユニット + UI 回帰テスト
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';
import { runBatchMatchReport, buildNewBatchLookup } from './lib/new-batch-lookup.mjs';
import { CURRENT_NEW_BATCH, NEW_SONG_BATCHES, getCurrentBatch } from './data/new-song-batches.mjs';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function unitTests() {
  const batch = getCurrentBatch();
  if (batch.songs.length === 52) ok('抽出52曲（重複なし）');
  else fail('曲数', String(batch.songs.length));

  const titles = batch.songs.map((s) => `${s.artist}|${s.title}`);
  if (new Set(titles).size === 52) ok('重複除外後52曲');
  else fail('重複あり', String(new Set(titles).size));

  const songs = parseMasterSongsFromIndexHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  if (songs.length === 1952) ok('MASTER_SONGS 1952曲維持');
  else fail('MASTER_SONGS曲数', String(songs.length));

  const report = runBatchMatchReport(songs);
  if (report.registered.length === 52) ok(`登録済み ${report.registered.length}件`);
  else fail('登録済み', String(report.registered.length));
  if (report.unregistered.length === 0) ok('未登録0件');
  else fail('未登録', String(report.unregistered.length));
  if (report.needsReview.length === 0) ok('要確認0件（SEVEN DAYS部分一致含む）');
  else fail('要確認', String(report.needsReview.length));

  const lookup = buildNewBatchLookup(songs);
  if (Object.keys(lookup).length === 52) ok('lookup 52キー');
  else fail('lookup keys', String(Object.keys(lookup).length));

  const html404 = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
  for (const needles of [
    'CURRENT_NEW_BATCH', 'NEW_BATCH_LOOKUP', 'isCurrentNewBatchSong',
    'narrowFilterRow', 'activeFilter', 'songMatchesNarrowFilter', 'toggleNarrowFilter',
  ]) {
    if (html404.includes(needles)) ok(`404.html contains ${needles}`);
    else fail(`404.html missing ${needles}`);
  }
}

function buildViewerFixture(name, { songs, songMeta = {} }) {
  let html = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');
  const cfg = {
    streamerName: '新着テスト',
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
  const p = path.join(ROOT, 'scripts', `.fixture-new-batch-${name}.html`);
  fs.writeFileSync(p, html);
  return `file://${p}`;
}

async function uiTests(browser) {
  // Editor: 新着フィルタで52曲
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await addBypassStart(page);
    await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
    await page.click('#editTabSongs');
    await page.waitForSelector('#panelSongs:not([hidden])');
    await page.evaluate(() => {
      const chips = [...document.querySelectorAll('#narrowFilterRow .chip')];
      chips.find((c) => c.textContent === '新着')?.click();
    });
    await page.waitForTimeout(200);
    const meta = await page.locator('#resultMeta').textContent();
    if (meta.includes('52曲')) ok(`編集: 新着フィルタ ${meta}`);
    else fail('編集: 新着52曲', meta);
    const h = await page.locator('#narrowFilterRow .chip', { hasText: '新着' }).evaluate((el) => el.offsetHeight);
    if (h >= 34) ok(`編集: 新着chip 高さ ${h}px`);
    else fail('編集: 新着chip タップ領域', String(h));
    if (!errors.length) ok('編集: console エラーなし');
    else fail('編集: console', errors.join('; '));
    await page.close();
  }

  // Viewer: 公開曲2件のみ表示
  {
    const url = buildViewerFixture('viewer', {
      songs: [
        { k: 'え', y: 'しど', a: 'シド', t: 'ENAMEL' },
        { k: 'あ', y: 'あいこ', a: 'aiko', t: 'カブトムシ' },
        { k: 'ら', y: 'らんぶ', a: 'シド', t: '乱舞のメロディ' },
      ],
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-');
    await page.evaluate(() => {
      setSearchPanelExpanded(true);
      [...document.querySelectorAll('#narrowFilterRow .chip')].find((c) => c.textContent === '新着')?.click();
    });
    await page.waitForTimeout(200);
    const meta = await page.locator('#resultMeta').textContent();
    if (meta === '2曲 / 1組') ok(`viewer: 新着は公開曲 intersect ${meta}`);
    else fail('viewer: 新着 intersect', meta);
    const flat = await page.locator('.flat-song-item').count();
    if (flat === 2) ok('viewer: 新着 flat 2曲');
    else fail('viewer: flat count', String(flat));
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }

  // 新着 + ジャンル AND
  {
    const url = buildViewerFixture('genre-and', {
      songs: [
        { k: 'え', y: 'しど', a: 'シド', t: 'ENAMEL' },
        { k: 'ぼ', y: 'ぼかろ', a: 'cosMo@暴走P', t: '初音ミクの暴走' },
      ],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-');
    await page.evaluate(() => {
      setSearchPanelExpanded(true);
      [...document.querySelectorAll('#narrowFilterRow .chip')].find((c) => c.textContent === '新着')?.click();
    });
    await page.waitForTimeout(120);
    await page.evaluate(() => setSearchPanelExpanded(true));
    await page.waitForTimeout(120);
    await page.evaluate(() => {
      [...document.querySelectorAll('#narrowFilterRow .chip')].find((c) => c.textContent === 'ボカロ')?.click();
    });
    await page.waitForTimeout(200);
    const meta = await page.locator('#resultMeta').textContent();
    if (meta === '1曲 / 1組') ok(`viewer: 新着+ボカロ ${meta}`);
    else fail('viewer: 新着+ジャンル', meta);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    if (scrollW <= clientW + 1) ok('430px: 横スクロールなし');
    else fail('430px 横スクロール', `${scrollW}/${clientW}`);
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }

  for (const w of [320, 1280]) {
    const url = buildViewerFixture(`vp-${w}`, {
      songs: [{ k: 'え', y: 'しど', a: 'シド', t: 'ENAMEL' }],
    });
    const page = await browser.newPage({ viewport: { width: w, height: 800 } });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#narrowFilterRow');
    await page.evaluate(() => { setSearchPanelExpanded(true); applySearchPanelState(); });
    await page.waitForTimeout(120);
    const h = await page.locator('#narrowFilterRow .chip').first().evaluate((el) => el.offsetHeight);
    if (h >= 34) ok(`${w}px: narrow chip h=${h}`);
    else fail(`${w}px chip height`, String(h));
    await page.close();
    fs.unlinkSync(url.replace('file://', ''));
  }
}

async function main() {
  unitTests();
  const browser = await chromium.launch();
  try {
    await uiTests(browser);
  } finally {
    await browser.close();
  }
  console.log(failed ? `\n${failed} failure(s)` : '\nAll new-batch tests passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
