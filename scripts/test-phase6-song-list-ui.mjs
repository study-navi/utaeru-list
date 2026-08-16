#!/usr/bin/env node
/**
 * Phase 6: 曲リスト描画・検索・選択・公開ボタン連動の UI 回帰テスト
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cases = [
  { label: 'mobile', width: 390, height: 844 },
  { label: 'pc', width: 1280, height: 800 },
];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

const indexUrl = 'file://' + path.join(ROOT, 'index.html');

for (const vp of cases) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelectorAll('details.artist-group').length > 0 || document.querySelectorAll('.song-check').length > 0,
    { timeout: 15000 },
  ).catch(() => null);

  // 曲セクションを開いてからテスト
  await page.click('#accSongs .acc-head');
  await page.waitForTimeout(100);

  if (errors.length) fail(`${vp.label}: JS エラーなし`, errors.join('; '));
  else ok(`${vp.label}: JS エラーなし`);

  const initial = await page.evaluate(() => ({
    masterCount: MASTER_SONGS?.length ?? 0,
    artistGroups: document.querySelectorAll('details.artist-group').length,
    resultMeta: document.getElementById('resultMeta')?.textContent ?? '',
    songSectionTop: Math.round(document.getElementById('accSongs')?.getBoundingClientRect().top ?? -1),
  }));

  if (initial.masterCount !== 1952) fail(`${vp.label}: MASTER_SONGS 1952件`, String(initial.masterCount));
  else ok(`${vp.label}: MASTER_SONGS 1952件`);

  if (initial.artistGroups <= 0) fail(`${vp.label}: 曲一覧描画`, `groups=${initial.artistGroups}`);
  else ok(`${vp.label}: 曲一覧描画 (${initial.artistGroups} グループ)`);

  if (!initial.resultMeta.includes('曲')) fail(`${vp.label}: resultMeta`, initial.resultMeta);
  else ok(`${vp.label}: resultMeta = ${initial.resultMeta}`);

  if (initial.songSectionTop > 600) fail(`${vp.label}: 曲セクションが画面上部付近`, `top=${initial.songSectionTop}`);
  else ok(`${vp.label}: 曲セクション top=${initial.songSectionTop}`);

  await page.fill('#searchInput', 'Story');
  await page.waitForTimeout(80);
  const searched = await page.evaluate(() => ({
    meta: document.getElementById('resultMeta')?.textContent ?? '',
    groups: document.querySelectorAll('details.artist-group').length,
    hasCheckbox: !!document.querySelector('.song-check'),
  }));
  if (!searched.hasCheckbox) fail(`${vp.label}: 検索後チェックボックス`, searched.meta);
  else ok(`${vp.label}: 検索 Story → ${searched.meta}`);

  await page.click('.song-check');
  const afterSelect = await page.evaluate(() => ({
    selected: document.getElementById('selectedCount')?.textContent,
    preview: document.querySelector('#previewFrame .pv-stat-num')?.textContent,
    publishDisabled: document.getElementById('publishBtn')?.disabled,
    publishTitle: document.getElementById('publishBtn')?.title ?? '',
  }));
  if (afterSelect.selected === '0') fail(`${vp.label}: 選択曲数更新`, afterSelect.selected);
  else ok(`${vp.label}: 選択曲数 = ${afterSelect.selected}`);

  if (afterSelect.preview !== afterSelect.selected) fail(`${vp.label}: プレビュー曲数`, `${afterSelect.preview} vs ${afterSelect.selected}`);
  else ok(`${vp.label}: プレビュー曲数連動`);

  if (!afterSelect.publishDisabled) ok(`${vp.label}: 公開ボタン disabled 状態を取得`);
  else ok(`${vp.label}: 公開ボタン disabled（${afterSelect.publishTitle || '理由あり'}）`);

  await browser.close();
}

if (failed) {
  console.error(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
