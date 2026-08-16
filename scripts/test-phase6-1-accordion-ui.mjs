#!/usr/bin/env node
/**
 * Phase 6.1: アコーディオン UI 回帰テスト
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function runViewport(label, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });

  if (errors.length) fail(`${label}: JS エラーなし`, errors.join('; '));
  else ok(`${label}: JS エラーなし`);

  const init = await page.evaluate(() => ({
    basicOpen: document.getElementById('accBasic')?.classList.contains('open'),
    songsOpen: document.getElementById('accSongs')?.classList.contains('open'),
    designOpen: document.getElementById('accDesign')?.classList.contains('open'),
    basicSummary: document.getElementById('accSummaryBasic')?.textContent,
    songsSummary: document.getElementById('accSummarySongs')?.textContent,
    stackHeight: Math.round(document.getElementById('mainAccStack')?.getBoundingClientRect().height ?? 0),
    groups: document.querySelectorAll('details.artist-group').length,
  }));

  if (!init.basicOpen) fail(`${label}: 初期状態で基本情報が開く`);
  else ok(`${label}: 初期状態で基本情報が開く`);
  if (init.songsOpen || init.designOpen) fail(`${label}: 他主要セクションは閉じる`, `songs=${init.songsOpen} design=${init.designOpen}`);
  else ok(`${label}: 他主要セクションは閉じている`);
  if (!init.songsSummary?.includes('まだ曲')) fail(`${label}: 曲要約（未選択）`, init.songsSummary);
  else ok(`${label}: 曲要約 = ${init.songsSummary}`);
  if (init.stackHeight > 700) fail(`${label}: 折りたたみ時の縦長`, `height=${init.stackHeight}`);
  else ok(`${label}: 折りたたみ時 stack 高さ ${init.stackHeight}px`);

  await page.click('#accSongs .acc-head');
  await page.waitForTimeout(100);
  const afterOpenSongs = await page.evaluate(() => ({
    basicOpen: document.getElementById('accBasic')?.classList.contains('open'),
    songsOpen: document.getElementById('accSongs')?.classList.contains('open'),
    groups: document.querySelectorAll('details.artist-group').length,
  }));
  if (afterOpenSongs.basicOpen) fail(`${label}: 曲を開くと基本情報が閉じる`);
  else ok(`${label}: 曲を開くと基本情報が閉じる`);
  if (!afterOpenSongs.songsOpen || afterOpenSongs.groups <= 0) fail(`${label}: 曲セクション展開+描画`, String(afterOpenSongs.groups));
  else ok(`${label}: 曲セクション展開 (${afterOpenSongs.groups} グループ)`);

  await page.click('#accBasic .acc-head');
  await page.waitForTimeout(80);
  await page.fill('#streamerName', 'テスト配信者');
  await page.fill('#streamerIdInput', 'test-id-abc');
  await page.click('#accBasic .acc-head');
  await page.waitForTimeout(80);
  const basicSummary = await page.evaluate(() => document.getElementById('accSummaryBasic')?.textContent);
  if (!basicSummary?.includes('テスト配信者')) fail(`${label}: 閉じた基本情報要約`, basicSummary);
  else ok(`${label}: 閉じた基本情報要約 = ${basicSummary}`);

  await page.click('#accSongs .acc-head');
  await page.waitForTimeout(80);
  await page.click('[data-next="design"]');
  await page.waitForTimeout(100);
  const afterNext = await page.evaluate(() => ({
    designOpen: document.getElementById('accDesign')?.classList.contains('open'),
    songsOpen: document.getElementById('accSongs')?.classList.contains('open'),
  }));
  if (!afterNext.designOpen || afterNext.songsOpen) fail(`${label}: 次へでデザインへ`, JSON.stringify(afterNext));
  else ok(`${label}: 次へでデザインセクションを開く`);

  await page.click('#accSongs .acc-head');
  await page.fill('#searchInput', 'Story');
  await page.waitForTimeout(100);
  const search = await page.evaluate(() => ({
    flat: !!document.querySelector('.flat-list'),
    head: document.querySelector('.search-results-head')?.textContent,
    checks: document.querySelectorAll('.song-check').length,
    groups: document.querySelectorAll('details.artist-group').length,
  }));
  if (!search.flat || search.groups > 0) fail(`${label}: 検索はフラット表示`, JSON.stringify(search));
  else ok(`${label}: 検索フラット ${search.head} (${search.checks}件)`);

  await page.click('.song-check');
  const selected = await page.evaluate(() => ({
    count: document.getElementById('selectedCount')?.textContent,
    summary: document.getElementById('accSummarySongs')?.textContent,
    done: document.getElementById('accDoneSongs')?.classList.contains('visible'),
  }));
  if (selected.count === '0') fail(`${label}: 曲選択`, selected.count);
  else ok(`${label}: 曲選択 count=${selected.count} summary=${selected.summary}`);
  if (!selected.done) fail(`${label}: 曲選択✓表示`);
  else ok(`${label}: 曲選択✓表示`);

  await page.click('#viewTabSelected');
  await page.waitForTimeout(80);
  const selectedView = await page.evaluate(() => ({
    flat: !!document.querySelector('.flat-list'),
    meta: document.getElementById('resultMeta')?.textContent,
    checks: document.querySelectorAll('.song-check').length,
  }));
  if (!selectedView.flat || !selectedView.meta?.includes('選択中')) fail(`${label}: 選択中タブ`, JSON.stringify(selectedView));
  else ok(`${label}: 選択中タブ ${selectedView.meta}`);

  await page.click('#accMore .acc-head');
  await page.waitForTimeout(80);
  const more = await page.evaluate(() => document.getElementById('accMore')?.classList.contains('open'));
  if (!more) fail(`${label}: その他セクションを開ける`);
  else ok(`${label}: その他セクション独立開閉`);

  await browser.close();
}

await runViewport('mobile', 390, 844);
await runViewport('pc', 1280, 800);

if (failed) {
  console.error(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
