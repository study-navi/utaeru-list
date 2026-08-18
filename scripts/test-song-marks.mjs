#!/usr/bin/env node
/**
 * Utalis v1.0: 曲マーク仕様（⭐ おはこ / ❤️ お気に入り / 🔰 練習中）
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBypassStart } from './lib/test-bypass-start.mjs';

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
  await page.evaluate((title) => {
    setSearchTarget('title');
    searchInput.value = title;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }, songTitle);
  await page.waitForTimeout(150);
  const row = page.locator('.song-item').filter({
    has: page.locator('.song-title', { hasText: new RegExp(`^${songTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }),
  }).first();
  await row.waitFor({ timeout: 5000 });
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
  for (const value of ['signature', 'favorite', 'learning']) {
    const shouldBeOn = marks.includes(value);
    const btn = page.locator(`.song-meta-panel .mark-btn[data-value="${value}"]`);
    if (!(await btn.count())) continue;
    const isActive = await btn.evaluate((el) => el.classList.contains('active'));
    if (isActive !== shouldBeOn) {
      await btn.click();
      await page.waitForTimeout(120);
    }
  }
}

async function readDraftMarks(page, songTitle) {
  return page.evaluate((title) => {
    const song = MASTER_SONGS.find((s) => s.t === title);
    if (!song) return null;
    const key = song.a + '\u0001' + song.t;
    const payload = buildDraftDataPayload();
    return payload.songMeta[key]?.marks || [];
  }, songTitle);
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

  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.waitForFunction(() => typeof MARK_ORDER !== 'undefined', { timeout: 15000 });

  const ui = await page.evaluate(() => ({
    hasWelcome: document.body.textContent.includes('リクエストOK'),
    hasStatusLabel: document.body.textContent.includes('状態（1つだけ'),
    hasMarkLabel: document.body.textContent.includes('この曲につけるマーク'),
    hasFreeTagLabel: document.body.textContent.includes('自由タグ'),
  }));
  if (ui.hasWelcome || ui.hasStatusLabel) fail(`${label}: 旧仕様UI削除`, JSON.stringify(ui));
  else ok(`${label}: 旧仕様UI削除`);
  if (!ui.hasMarkLabel) fail(`${label}: 曲マークUI`, JSON.stringify(ui));
  else ok(`${label}: 曲マークUI`);
  if (ui.hasFreeTagLabel) fail(`${label}: 自由タグUI撤去`, JSON.stringify(ui));
  else ok(`${label}: 自由タグUIなし`);

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
  let uiMarks = await readMarks(page, songA);
  let draftMarks = await readDraftMarks(page, songA);
  if (uiMarks.includes('signature') && uiMarks.length === 1 && draftMarks.includes('signature') && draftMarks.length === 1) ok(`${label}: UIトグル ON 保存`);
  else fail(`${label}: UIトグル ON`, JSON.stringify({ uiMarks, draftMarks }));

  await setMarksViaUi(page, songA, []);
  uiMarks = await readMarks(page, songA);
  draftMarks = await readDraftMarks(page, songA);
  if (!uiMarks.length && !draftMarks.length) ok(`${label}: UIトグル OFF 保存`);
  else fail(`${label}: UIトグル OFF`, JSON.stringify({ uiMarks, draftMarks }));

  await setMarks(page, songA, ['signature', 'learning']);
  await page.click('#editTabPreview');
  await page.waitForTimeout(150);
  const previewA = await readPreviewMarks(page, songA);
  const previewB = await readPreviewMarks(page, songB);
  if (JSON.stringify(previewA) !== JSON.stringify(['⭐ おはこ', '🔰 練習中'])) fail(`${label}: プレビュー Story`, JSON.stringify(previewA));
  else ok(`${label}: プレビュー Story`);
  if (JSON.stringify(previewB) !== JSON.stringify(['⭐ おはこ', '❤️ お気に入り', '🔰 練習中'])) fail(`${label}: プレビュー カブトムシ`, JSON.stringify(previewB));
  else ok(`${label}: プレビュー カブトムシ`);

  const favText = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#previewFrame .pv-mark')].find((n) => n.textContent.includes('❤️'));
    return el?.textContent?.trim() || '';
  });
  if (favText !== '❤️ お気に入り') fail(`${label}: お気に入り表記`, favText);
  else ok(`${label}: ❤️ お気に入り 表記`);

  await page.click('#editTabSongs');
  await page.waitForTimeout(100);
  await page.click('.view-tab[data-view="selected"]');
  await page.waitForTimeout(120);
  await page.waitForSelector('.song-item .song-title', { timeout: 5000 });
  const layout = await page.evaluate(() => {
    const row = document.querySelector('.song-item');
    const settingsBtn = row?.querySelector('.song-settings-btn');
    const title = row?.querySelector('.song-title');
    const artist = row?.querySelector('.song-artist');
    const bodyRect = row?.querySelector('.song-row-body')?.getBoundingClientRect();
    const btnRect = settingsBtn?.getBoundingClientRect();
    return {
      docScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      hasTitle: !!title,
      hasArtist: !!artist,
      settingsRight: btnRect && bodyRect ? btnRect.left >= bodyRect.right - 12 : false,
      settingsTapW: settingsBtn ? settingsBtn.offsetWidth + 12 : 0,
      settingsTapH: settingsBtn ? settingsBtn.offsetHeight + 20 : 0,
    };
  });
  if (layout.hasTitle && layout.hasArtist && layout.settingsRight) ok(`${label}: 曲行レイアウト（曲名/アーティスト/右設定）`);
  else fail(`${label}: 曲行レイアウト`, JSON.stringify(layout));
  if (layout.settingsTapW >= 44 && layout.settingsTapH >= 44) ok(`${label}: 設定ボタンタップ領域`);
  else fail(`${label}: 設定ボタンタップ`, JSON.stringify(layout));
  if (!layout.docScroll) ok(`${label}: 横スクロールなし`);
  else fail(`${label}: 横スクロール`, JSON.stringify(layout));

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

async function runStorageAndDraftCase() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined' && draftBootComplete === true, { timeout: 15000 });
  await page.fill('#streamerName', 'マーク保存値テスト');
  await selectSong(page, 'カブトムシ');
  await setMarks(page, 'カブトムシ', ['signature', 'favorite', 'learning']);
  const internal = await page.evaluate(() => {
    const song = MASTER_SONGS.find((s) => s.t === 'カブトムシ');
    const key = song.a + '\u0001' + song.t;
    return {
      marks: songMeta[key]?.marks || [],
      draftRaw: localStorage.getItem('utalis_draft_v1'),
    };
  });
  if (JSON.stringify(internal.marks) !== JSON.stringify(['signature', 'favorite', 'learning'])) {
    fail('内部保存値', JSON.stringify(internal.marks));
  } else ok('内部保存値: signature / favorite / learning のまま');
  if (internal.draftRaw && (internal.draftRaw.includes('⭐') || internal.draftRaw.includes('🔰'))) {
    fail('draft JSON に表示用絵文字ラベルが混入');
  } else ok('draft JSON: 表示ラベル非保存');

  await page.evaluate(() => saveDraftToStorage());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => draftBootComplete === true, { timeout: 15000 });
  await page.waitForTimeout(200);
  const marksAfter = await readMarks(page, 'カブトムシ');
  if (JSON.stringify(marksAfter) !== JSON.stringify(['signature', 'favorite', 'learning'])) {
    fail('リロード後の内部マーク', JSON.stringify(marksAfter));
  } else ok('リロード後: 3マーク維持');
  await page.click('#editTabPreview');
  await page.waitForTimeout(150);
  const preview = await readPreviewMarks(page, 'カブトムシ');
  if (JSON.stringify(preview) !== JSON.stringify(['⭐ おはこ', '❤️ お気に入り', '🔰 練習中'])) {
    fail('リロード後プレビュー', JSON.stringify(preview));
  } else ok('リロード後プレビュー: 3マーク表示');
  await browser.close();
}

await runStorageAndDraftCase();

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll song-mark checks passed.');
