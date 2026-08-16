#!/usr/bin/env node
/**
 * Phase 6.2: ライトUI + 戻る/次へ導線 + state保持
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

async function run(label, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });

  if (errors.length) fail(`${label}: JS エラーなし`, errors.join('; '));
  else ok(`${label}: JS エラーなし`);

  const light = await page.evaluate(() => ({
    builderLight: document.documentElement.getAttribute('data-utaeru-builder'),
    pageBg: getComputedStyle(document.body).backgroundColor,
    textPrimary: getComputedStyle(document.body).color,
    muted: getComputedStyle(document.querySelector('.acc-summary')).color,
  }));
  if (light.builderLight !== 'light') fail(`${label}: 編集画面ライト固定`, light.builderLight);
  else ok(`${label}: data-utaeru-builder=light`);

  await page.fill('#streamerName', 'Phase62テスト');
  await page.fill('#streamerIdInput', 'phase62test');
  await page.click('[data-next="songs"]');
  await page.waitForTimeout(120);

  await page.fill('#searchInput', 'Story');
  await page.waitForTimeout(80);
  await page.click('.song-check');
  await page.click('[data-next="design"]');
  await page.waitForTimeout(120);

  await page.click('[data-prev="songs"]');
  await page.waitForTimeout(120);

  const afterBack = await page.evaluate(() => ({
    basicOpen: document.getElementById('accBasic')?.classList.contains('open'),
    songsOpen: document.getElementById('accSongs')?.classList.contains('open'),
    name: document.getElementById('streamerName')?.value,
    sid: document.getElementById('streamerIdInput')?.value,
    search: document.getElementById('searchInput')?.value,
    selected: document.getElementById('selectedCount')?.textContent,
    flat: !!document.querySelector('.flat-list'),
  }));

  if (!afterBack.songsOpen || afterBack.basicOpen) fail(`${label}: 戻るで曲セクション`, JSON.stringify(afterBack));
  else ok(`${label}: 戻るで曲セクションを開く`);
  if (afterBack.name !== 'Phase62テスト' || afterBack.sid !== 'phase62test') fail(`${label}: 入力値保持`, JSON.stringify(afterBack));
  else ok(`${label}: 配信者名/ID保持`);
  if (afterBack.search !== 'Story') fail(`${label}: 検索保持`, afterBack.search);
  else ok(`${label}: 検索文字保持`);
  if (afterBack.selected === '0') fail(`${label}: 選択曲保持`, afterBack.selected);
  else ok(`${label}: 選択曲数保持 (${afterBack.selected})`);

  await page.click('[data-prev="basic"]');
  await page.waitForTimeout(120);
  const basicOpen = await page.evaluate(() => document.getElementById('accBasic')?.classList.contains('open'));
  if (!basicOpen) fail(`${label}: 基本情報へ戻る`);
  else ok(`${label}: 基本情報へ戻る`);

  const navBtns = await page.evaluate(() => ({
    prev: document.querySelectorAll('.acc-prev').length,
    next: document.querySelectorAll('.acc-next').length,
  }));
  if (navBtns.prev < 3 || navBtns.next < 3) fail(`${label}: 戻る/次へボタン数`, JSON.stringify(navBtns));
  else ok(`${label}: 戻る${navBtns.prev} / 次へ${navBtns.next}`);

  await browser.close();
}

await run('mobile', 390, 844);
await run('pc', 1280, 800);

if (failed) {
  console.error(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
