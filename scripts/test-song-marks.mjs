#!/usr/bin/env node
/**
 * Utalis v1.0: 曲マーク仕様（おはこ / お気に入り ❤️ / 練習中）
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

async function selectSong(page, songTitle) {
  await page.evaluate((title) => {
    const song = MASTER_SONGS.find((s) => s.t === title);
    if (song) selectedKeys.add(song.a + '\u0001' + song.t);
    updateSelectedCount();
    render();
  }, songTitle);
  await page.waitForTimeout(60);
}

async function openSongSettings(page, songTitle) {
  await page.click('#editTabSongs');
  await page.waitForTimeout(100);
  await page.fill('#searchInput', songTitle);
  await page.waitForTimeout(120);
  const row = page.locator('.song-item').filter({ hasText: songTitle }).first();
  const settingsBtn = row.locator('.song-settings-btn');
  const expanded = await settingsBtn.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await settingsBtn.click();
    await page.waitForSelector('.song-meta-panel', { timeout: 5000 });
  }
  await page.waitForTimeout(80);
}

async function setMarksViaUi(page, songTitle, marks) {
  await openSongSettings(page, songTitle);
  await page.evaluate((wanted) => {
    const panel = document.querySelector('.song-meta-panel');
    if (!panel) throw new Error('settings panel missing');
    panel.querySelectorAll('.mark-btn').forEach((btn) => {
      const on = wanted.includes(btn.dataset.value);
      if (btn.classList.contains('active') !== on) btn.click();
    });
  }, marks);
  await page.waitForTimeout(80);
}

async function setMarks(page, songTitle, marks) {
  await page.evaluate(({ title, wanted }) => {
    const song = MASTER_SONGS.find((s) => s.t === title);
    if (!song) throw new Error(`song not found: ${title}`);
    const key = song.a + '\u0001' + song.t;
    updateSongMeta(key, (m) => {
      m.marks = MARK_ORDER.filter((v) => wanted.includes(v));
    });
  }, { title: songTitle, wanted: marks });
  await page.waitForTimeout(80);
}

async function readMarks(page, songTitle) {
  return page.evaluate((title) => {
    const song = MASTER_SONGS.find((s) => s.t === title);
    if (!song) return null;
    const key = song.a + '\u0001' + song.t;
    return normalizedMarks(songMeta[key] || {});
  }, songTitle);
}

async function readPreviewMarks(page, songTitle) {
  return page.evaluate((title) => {
    const row = [...document.querySelectorAll('#previewFrame .pv-song-title')]
      .find((el) => el.textContent === title);
    if (!row) return null;
    const li = row.closest('li');
    return [...li.querySelectorAll('.pv-mark')].map((el) => el.textContent.trim());
  }, songTitle);
}

async function runViewport(label, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MARK_ORDER !== 'undefined', { timeout: 15000 });

  const ui = await page.evaluate(() => ({
    hasWelcome: document.body.textContent.includes('リクエストOK'),
    hasStatusLabel: document.body.textContent.includes('状態（1つだけ'),
    hasMarkLabel: document.body.textContent.includes('この曲につけるマーク'),
    hasFreeTagLabel: document.body.textContent.includes('自由タグ'),
  }));
  if (ui.hasWelcome || ui.hasStatusLabel) fail(`${label}: 旧仕様UI削除`, JSON.stringify(ui));
  else ok(`${label}: 旧仕様UI削除`);
  if (!ui.hasMarkLabel || !ui.hasFreeTagLabel) fail(`${label}: 曲マークUI`, JSON.stringify(ui));
  else ok(`${label}: 曲マークUI`);

  const songA = 'Story';
  const songB = 'カブトムシ';
  const songC = '天体観測';

  await selectSong(page, songA);
  await selectSong(page, songB);
  await selectSong(page, songC);

  await setMarks(page, songA, []);
  let marks = await readMarks(page, songA);
  if (marks?.length) fail(`${label}: マークなし`, JSON.stringify(marks));
  else ok(`${label}: マークなし`);

  await setMarks(page, songA, ['signature']);
  marks = await readMarks(page, songA);
  if (JSON.stringify(marks) !== JSON.stringify(['signature'])) fail(`${label}: おはこのみ`, JSON.stringify(marks));
  else ok(`${label}: おはこのみ`);

  await setMarks(page, songB, ['favorite']);
  marks = await readMarks(page, songB);
  if (JSON.stringify(marks) !== JSON.stringify(['favorite'])) fail(`${label}: お気に入りのみ`, JSON.stringify(marks));
  else ok(`${label}: お気に入りのみ`);

  await setMarks(page, songC, ['learning']);
  marks = await readMarks(page, songC);
  if (JSON.stringify(marks) !== JSON.stringify(['learning'])) fail(`${label}: 練習中のみ`, JSON.stringify(marks));
  else ok(`${label}: 練習中のみ`);

  await setMarks(page, songA, ['signature', 'favorite']);
  marks = await readMarks(page, songA);
  if (JSON.stringify(marks) !== JSON.stringify(['signature', 'favorite'])) fail(`${label}: おはこ+お気に入り`, JSON.stringify(marks));
  else ok(`${label}: おはこ+お気に入り`);

  await setMarks(page, songA, ['signature', 'learning']);
  marks = await readMarks(page, songA);
  if (JSON.stringify(marks) !== JSON.stringify(['signature', 'learning'])) fail(`${label}: おはこ+練習中`, JSON.stringify(marks));
  else ok(`${label}: おはこ+練習中`);

  await setMarks(page, songB, ['favorite', 'learning']);
  marks = await readMarks(page, songB);
  if (JSON.stringify(marks) !== JSON.stringify(['favorite', 'learning'])) fail(`${label}: お気に入り+練習中`, JSON.stringify(marks));
  else ok(`${label}: お気に入り+練習中`);

  await setMarks(page, songB, ['signature', 'favorite', 'learning']);
  marks = await readMarks(page, songB);
  if (JSON.stringify(marks) !== JSON.stringify(['signature', 'favorite', 'learning'])) fail(`${label}: 3つすべて`, JSON.stringify(marks));
  else ok(`${label}: 3つすべて`);

  await setMarksViaUi(page, songA, ['signature']);
  const uiMarks = await readMarks(page, songA);
  if (!uiMarks.includes('signature') || uiMarks.length !== 1) fail(`${label}: UIトグル`, JSON.stringify(uiMarks));
  else ok(`${label}: UIトグル ON/OFF`);

  await setMarks(page, songA, ['signature', 'learning']);
  await page.click('#editTabPreview');
  await page.waitForTimeout(150);
  const previewA = await readPreviewMarks(page, songA);
  const previewB = await readPreviewMarks(page, songB);
  if (JSON.stringify(previewA) !== JSON.stringify(['おはこ', '練習中'])) fail(`${label}: プレビュー Story`, JSON.stringify(previewA));
  else ok(`${label}: プレビュー Story`);
  if (JSON.stringify(previewB) !== JSON.stringify(['おはこ', 'お気に入り ❤️', '練習中'])) fail(`${label}: プレビュー カブトムシ`, JSON.stringify(previewB));
  else ok(`${label}: プレビュー カブトムシ`);

  const favText = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#previewFrame .pv-mark')].find((n) => n.textContent.includes('❤️'));
    return el?.textContent?.trim() || '';
  });
  if (favText !== 'お気に入り ❤️') fail(`${label}: お気に入り表記`, favText);
  else ok(`${label}: お気に入り ❤️ 表記`);

  await page.click('#editTabSongs');
  await page.waitForTimeout(80);
  const layout = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.song-item')].find((el) => el.textContent.includes('カブトムシ'));
    const rect = row?.getBoundingClientRect();
    return {
      docScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rowScroll: row ? row.scrollWidth > row.clientWidth + 1 : false,
      rowWidth: rect?.width ?? 0,
    };
  });
  if (layout.docScroll || (layout.rowScroll && width <= 430)) fail(`${label}: 横スクロール`, JSON.stringify(layout));
  else ok(`${label}: 横スクロールなし`);

  if (errors.length) fail(`${label}: JSエラー`, errors.join('; '));
  else ok(`${label}: JSエラーなし`);

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
console.log('\nAll song-mark checks passed.');
