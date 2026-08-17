#!/usr/bin/env node
/**
 * 曲解除の確認モーダル + 元に戻す 回帰テスト
 */
import { chromium } from 'playwright';
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

async function setupEditor(page) {
  await addBypassStart(page);
  await page.addInitScript(() => {
    localStorage.removeItem('utalis_draft_v1');
    sessionStorage.removeItem('utalis_song_removal_undo_v1');
  });
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.click('#editTabSongs');
  await page.waitForTimeout(150);
}

async function selectNSongs(page, n) {
  await page.evaluate((count) => {
    selectedKeys.clear();
    songMeta = {};
    for (const s of MASTER_SONGS.slice(0, count)) selectedKeys.add(keyOf(s));
    render();
    updateSelectedCount();
  }, n);
}

async function testA() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  await selectNSongs(page, 3);
  await page.evaluate(() => removeSelectedKeys([keyOf(MASTER_SONGS[0])]));
  const state = await page.evaluate(() => ({
    count: selectedKeys.size,
    toast: !document.getElementById('songRemovalUndoToast').hidden,
    modal: !document.getElementById('bulkRemoveSongsModal').hidden,
    msg: document.getElementById('songRemovalUndoMsg')?.textContent,
  }));
  if (state.count === 2 && !state.modal) ok('A: 1曲解除 → 確認なし');
  else fail('A: 1曲解除 → 確認なし', JSON.stringify(state));
  if (state.toast && state.msg === '1曲を選択から外しました') ok('A: Undo表示');
  else fail('A: Undo表示', state.msg);
  await browser.close();
}

async function testB() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  const key = await page.evaluate(() => {
    const s = MASTER_SONGS[0];
    const k = keyOf(s);
    selectedKeys.clear();
    selectedKeys.add(k);
    songMeta[k] = { marks: ['signature', 'favorite'], tags: ['anime'], addedAt: '2026-08-01' };
    tagPresets.push({ id: 'anime', label: 'アニメ' });
    render();
    updateSelectedCount();
    return k;
  });
  await page.evaluate((k) => removeSelectedKeys([k]), key);
  await page.click('#songRemovalUndoBtn');
  await page.waitForTimeout(200);
  const state = await page.evaluate((k) => ({
    count: selectedKeys.size,
    meta: JSON.stringify(songMeta[k]),
  }), key);
  if (state.count === 1 && state.meta.includes('signature') && state.meta.includes('anime')) ok('B: 1曲Undo → songMeta復元');
  else fail('B: 1曲Undo → songMeta復元', JSON.stringify(state));
  await browser.close();
}

async function testC() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  await selectNSongs(page, 4);
  await page.evaluate(() => removeSelectedKeys([...selectedKeys].slice(0, 4)));
  const modal = await page.evaluate(() => !document.getElementById('bulkRemoveSongsModal').hidden);
  const count = await page.evaluate(() => selectedKeys.size);
  if (!modal && count === 0) ok('C: 4曲解除 → 確認なし');
  else fail('C: 4曲解除 → 確認なし', `modal=${modal} count=${count}`);
  await browser.close();
}

async function testD() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  await selectNSongs(page, 5);
  await page.evaluate(() => removeSelectedKeys([...selectedKeys]));
  const modal = await page.evaluate(() => ({
    visible: !document.getElementById('bulkRemoveSongsModal').hidden,
    title: document.getElementById('bulkRemoveSongsTitle')?.textContent,
  }));
  if (modal.visible && modal.title === '5曲を選択から外しますか？') ok('D: 5曲解除 → 確認モーダル');
  else fail('D: 5曲解除 → 確認モーダル', JSON.stringify(modal));
  await browser.close();
}

async function testE() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  await selectNSongs(page, 13);
  await page.click('#clearAllBtn');
  await page.waitForTimeout(200);
  const count = await page.evaluate(() => selectedKeys.size);
  if (count === 13) ok('E: 13曲解除キャンセル → 変更なし');
  else fail('E: 13曲解除キャンセル → 変更なし', String(count));
  await page.click('#bulkRemoveSongsCancel');
  await browser.close();
}

async function testF() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  await selectNSongs(page, 13);
  await page.click('#clearAllBtn');
  await page.waitForTimeout(200);
  await page.click('#bulkRemoveSongsConfirm');
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    count: selectedKeys.size,
    toast: document.getElementById('songRemovalUndoMsg')?.textContent,
  }));
  if (state.count === 0 && state.toast === '13曲を選択から外しました') ok('F: 13曲解除実行 + Undo');
  else fail('F: 13曲解除実行 + Undo', JSON.stringify(state));
  await browser.close();
}

async function testG() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  await selectNSongs(page, 13);
  await page.click('#clearAllBtn');
  await page.click('#bulkRemoveSongsConfirm');
  await page.waitForTimeout(300);
  await page.click('#songRemovalUndoBtn');
  await page.waitForTimeout(200);
  const count = await page.evaluate(() => selectedKeys.size);
  if (count === 13) ok('G: 13曲Undo → 全復元');
  else fail('G: 13曲Undo → 全復元', String(count));
  await browser.close();
}

async function testMarkUndo(mark, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  const key = await page.evaluate((m) => {
    const s = MASTER_SONGS[0];
    const k = keyOf(s);
    selectedKeys.clear();
    selectedKeys.add(k);
    songMeta[k] = { marks: [m] };
    render();
    updateSelectedCount();
    return k;
  }, mark);
  await page.evaluate((k) => removeSelectedKeys([k]), key);
  await page.click('#songRemovalUndoBtn');
  const meta = await page.evaluate((k) => songMeta[k]?.marks || [], key);
  if (meta.includes(mark)) ok(`${label}: Undo → マーク復元`);
  else fail(`${label}: Undo → マーク復元`, JSON.stringify(meta));
  await browser.close();
}

async function testK() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  const key = await page.evaluate(() => {
    const s = MASTER_SONGS[0];
    const k = keyOf(s);
    tagPresets.push({ id: 'free1', label: '自由タグテスト' });
    selectedKeys.clear();
    selectedKeys.add(k);
    songMeta[k] = { tags: ['free1'] };
    render();
    updateSelectedCount();
    return k;
  });
  await page.evaluate((k) => removeSelectedKeys([k]), key);
  await page.click('#songRemovalUndoBtn');
  const tags = await page.evaluate((k) => songMeta[k]?.tags || [], key);
  if (tags.includes('free1')) ok('K: 自由タグ Undo復元');
  else fail('K: 自由タグ Undo復元', JSON.stringify(tags));
  await browser.close();
}

async function testL() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  await page.evaluate(() => {
    streamerNameInput.value = 'テスト配信者';
    draftBootComplete = true;
  });
  await selectNSongs(page, 6);
  await page.click('#clearAllBtn');
  await page.click('#bulkRemoveSongsConfirm');
  await page.waitForTimeout(400);
  const draftAfterRemove = await page.evaluate(() => {
    saveDraftToStorage();
    const raw = localStorage.getItem('utalis_draft_v1');
    return raw ? JSON.parse(raw).data.selectedSongIds.length : -1;
  });
  await page.click('#songRemovalUndoBtn');
  await page.waitForTimeout(400);
  const draftAfterUndo = await page.evaluate(() => {
    saveDraftToStorage();
    const raw = localStorage.getItem('utalis_draft_v1');
    return raw ? JSON.parse(raw).data.selectedSongIds.length : -1;
  });
  if (draftAfterRemove === 0 && draftAfterUndo === 6) ok('L: 解除→保存→Undo→再保存');
  else fail('L: 解除→保存→Undo→再保存', `${draftAfterRemove} → ${draftAfterUndo}`);
  await browser.close();
}

async function testP() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  await selectNSongs(page, 6);
  await page.evaluate(() => removeSelectedKeys([...selectedKeys]));
  await page.evaluate(() => {
    authUser = { email: 't@example.com', ownedStreamerIds: ['a', 'b'] };
    activeOwnedStreamerId = 'a';
    setActiveOwnedStreamerId('b');
  });
  const undo = await page.evaluate(() => lastSongRemovalUndo);
  if (!undo) ok('P: ページ切替 → Undo破棄');
  else fail('P: ページ切替 → Undo破棄');
  await browser.close();
}

async function testQ() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditor(page);
  await selectNSongs(page, 6);
  await page.evaluate(() => removeSelectedKeys([...selectedKeys]));
  await page.evaluate(() => {
    applyPublicDataToBuilder({ streamerName: 'X', songs: [], songMeta: {}, tagPresets: [] }, 'x');
  });
  const undo = await page.evaluate(() => lastSongRemovalUndo);
  if (!undo) ok('Q: 公開データ読込 → Undo破棄');
  else fail('Q: 公開データ読込 → Undo破棄');
  await browser.close();
}

async function testR(width) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await setupEditor(page);
  await selectNSongs(page, 1);
  await page.evaluate(() => removeSelectedKeys([keyOf(MASTER_SONGS[0])]));
  const box = await page.locator('#songRemovalUndoBtn').boundingBox();
  if (box && box.height >= 44) ok(`${width}px: Undoボタン44px以上`);
  else fail(`${width}px: Undoボタン44px以上`, JSON.stringify(box));
  await browser.close();
}

async function main() {
  console.log('=== test-song-removal-undo.mjs ===\n');
  await testA();
  await testB();
  await testC();
  await testD();
  await testE();
  await testF();
  await testG();
  await testMarkUndo('signature', 'H');
  await testMarkUndo('favorite', 'I');
  await testMarkUndo('learning', 'J');
  await testK();
  await testL();
  await testP();
  await testQ();
  for (const w of [320, 375, 390, 430, 1280]) await testR(w);
  console.log('');
  if (failed) {
    console.error(`\n${failed} 件失敗`);
    process.exit(1);
  }
  console.log('すべて成功');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
