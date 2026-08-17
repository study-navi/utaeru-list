#!/usr/bin/env node
/**
 * Google下書き選択モーダル UI 回帰（文言・メタ・レスポンシブ）
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

function makePublicPayload(sid, songCount = 13) {
  const songs = [];
  for (let i = 0; i < songCount; i += 1) {
    songs.push({ k: 'あ', y: 'y' + i, a: 'Artist', t: 'Song' + i });
  }
  return {
    streamerName: 'サーバー上の配信者名',
    subtitle: 'サブタイトル',
    configVersion: 2,
    themeType: 'preset',
    presetIndex: 1,
    streamerId: sid,
    songs,
    songMeta: {},
    tagPresets: [],
    updatedAt: '2026-08-17T02:42:00.000Z',
  };
}

async function mockAuth(page, ownedIds = ['hiro']) {
  await page.route('**/api/auth/google', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'modal-test@example.com', accessToken: 'mock.token' }),
  }));
  await page.route('**/api/auth/me', (route) => {
    const auth = route.request().headers()['authorization'];
    if (!auth) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'modal-test@example.com', ownedStreamerIds: ownedIds }),
    });
  });
  await page.route('**/api/public/**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const sid = decodeURIComponent(route.request().url().split('/api/public/')[1] || '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makePublicPayload(sid)),
    });
  });
}

async function setupWithDraft(page) {
  await addBypassStart(page);
  await page.addInitScript(() => {
    localStorage.removeItem('utalis_draft_v1');
    localStorage.removeItem('utalis_active_streamer_v1');
  });
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.fill('#streamerName', '下書きUIテスト');
  await page.fill('#streamerIdInput', 'hiro');
  await page.evaluate(() => {
    selectedKeys.clear();
    for (const s of MASTER_SONGS.slice(0, 5)) selectedKeys.add(keyOf(s));
    render();
    updateSelectedCount();
    scheduleDraftSave(true);
  });
  await page.waitForTimeout(700);
  await page.evaluate(async () => {
    setOnlineMode('google', { openPanel: false });
    await completeUtaeruLogin({ googleAccessToken: 'mock' });
  });
  await page.waitForTimeout(700);
}

async function testModalContent(width) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockAuth(page);
  await setupWithDraft(page);

  const ui = await page.evaluate(() => ({
    title: document.getElementById('googleDraftChoiceTitle')?.textContent?.trim(),
    lead: document.querySelector('.draft-choice-lead')?.textContent?.replace(/\s+/g, ' ').trim(),
    labels: [...document.querySelectorAll('.draft-choice-option-label')].map((el) => el.textContent.trim()),
    draftMeta: document.getElementById('googleDraftChoiceDraftMeta')?.textContent?.trim(),
    pubMeta: document.getElementById('googleDraftChoicePublishedMeta')?.textContent?.trim(),
    draftNew: !document.getElementById('googleDraftChoiceDraftNew')?.hidden,
    pubNew: !document.getElementById('googleDraftChoicePublishedNew')?.hidden,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    optionCount: document.querySelectorAll('.draft-choice-option').length,
  }));

  if (ui.title === '編集中のデータが2つあります') ok(`${width}px: タイトル`);
  else fail(`${width}px: タイトル`, ui.title);
  if (ui.lead?.includes('この端末に保存した下書き') && ui.lead?.includes('どちらから編集を始めるか')) ok(`${width}px: 説明文`);
  else fail(`${width}px: 説明文`, ui.lead);
  if (ui.labels.join(',') === 'この端末の下書き,現在の公開データ') ok(`${width}px: 選択カード見出し`);
  else fail(`${width}px: 選択カード見出し`, ui.labels.join(','));
  if (ui.optionCount === 2) ok(`${width}px: 2つの選択カード`);
  else fail(`${width}px: 2つの選択カード`, String(ui.optionCount));
  if (ui.draftMeta?.includes('最終保存') && ui.draftMeta?.includes('曲')) ok(`${width}px: 下書きメタ`);
  else fail(`${width}px: 下書きメタ`, ui.draftMeta);
  if (ui.pubMeta?.includes('最終公開') && ui.pubMeta?.includes('13曲')) ok(`${width}px: 公開メタ`);
  else fail(`${width}px: 公開メタ`, ui.pubMeta);
  if (ui.draftNew && !ui.pubNew) ok(`${width}px: 新しいバッジ（下書きが新しい）`);
  else fail(`${width}px: 新しいバッジ（下書きが新しい）`, JSON.stringify({ draftNew: ui.draftNew, pubNew: ui.pubNew }));
  if (!ui.overflow) ok(`${width}px: 横スクロールなし`);
  else fail(`${width}px: 横スクロールなし`);
  if (!errors.length) ok(`${width}px: JSエラーなし`);
  else fail(`${width}px: JSエラーなし`, errors.join('; '));

  await browser.close();
}

async function testActionsUnchanged() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page);
  await setupWithDraft(page);
  await page.click('#googleDraftContinueBtn');
  await page.waitForTimeout(300);
  const afterContinue = await page.evaluate(() => ({
    name: streamerNameInput.value,
    count: selectedKeys.size,
    active: activeOwnedStreamerId,
  }));
  if (afterContinue.name === '下書きUIテスト' && afterContinue.count === 5 && afterContinue.active === 'hiro') {
    ok('動作: 下書きから編集 → 下書き維持');
  } else {
    fail('動作: 下書きから編集 → 下書き維持', JSON.stringify(afterContinue));
  }
  await browser.close();

  const browser2 = await chromium.launch();
  const page2 = await browser2.newPage();
  await mockAuth(page2);
  await setupWithDraft(page2);
  await page2.click('#googleDraftLoadPublishedBtn');
  await page2.waitForTimeout(500);
  const afterLoad = await page2.evaluate(() => ({
    name: streamerNameInput.value,
    count: selectedKeys.size,
    sid: streamerIdInput.value,
  }));
  if (afterLoad.name === 'サーバー上の配信者名' && afterLoad.count === 13 && afterLoad.sid === 'hiro') {
    ok('動作: 公開データから編集 → サーバーデータ適用');
  } else {
    fail('動作: 公開データから編集 → サーバーデータ適用', JSON.stringify(afterLoad));
  }
  await browser2.close();
}

async function main() {
  console.log('=== test-google-draft-choice-modal.mjs ===\n');
  for (const width of [320, 375, 390, 430, 1280]) {
    await testModalContent(width);
  }
  console.log('');
  await testActionsUnchanged();
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
