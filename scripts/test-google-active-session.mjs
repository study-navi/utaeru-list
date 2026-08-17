#!/usr/bin/env node
/**
 * Google編集セッション継続（activeStreamerId復元・別アカウント等）テスト
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
    presetIndex: 0,
    streamerId: sid,
    songs,
    songMeta: {},
    tagPresets: [],
    updatedAt: new Date().toISOString(),
  };
}

async function mockAuthWithOwned(page, ownedIds) {
  await page.route('**/api/auth/google', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'session-test@example.com', accessToken: 'mock.token' }),
  }));
  await page.route('**/api/auth/me', (route) => {
    const auth = route.request().headers()['authorization'];
    if (!auth) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'session-test@example.com', ownedStreamerIds: ownedIds }),
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

async function bootWithToken(page, ownedIds) {
  await addBypassStart(page);
  await page.addInitScript((owned) => {
    localStorage.removeItem('utalis_draft_v1');
    localStorage.setItem('utalis_active_streamer_v1', JSON.stringify({ streamerId: 'hiro' }));
    sessionStorage.setItem('utaeru_access_token', 'mock.stored.token');
  }, ownedIds);
  await mockAuthWithOwned(page, ownedIds);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function testM() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await bootWithToken(page, ['hiro']);
  const state = await page.evaluate(() => ({
    active: activeOwnedStreamerId,
    sid: streamerIdInput.value,
    count: selectedKeys.size,
    stored: localStorage.getItem('utalis_active_streamer_v1'),
  }));
  if (state.active === 'hiro' && state.sid === 'hiro' && state.count === 13) {
    ok('M: 次回アクセス → activeStreamerId 復元＋hiro 13曲');
  } else {
    fail('M: 次回アクセス → activeStreamerId 復元＋hiro 13曲', JSON.stringify(state));
  }
  await browser.close();
}

async function testL() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await addBypassStart(page);
  await page.addInitScript(() => {
    localStorage.removeItem('utalis_draft_v1');
    localStorage.setItem('utalis_active_streamer_v1', JSON.stringify({ streamerId: 'hiro' }));
  });
  let meOwned = ['other-page'];
  await page.route('**/api/auth/google', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'other@example.com', accessToken: 'mock.token' }),
  }));
  await page.route('**/api/auth/me', (route) => {
    const auth = route.request().headers()['authorization'];
    if (!auth) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'other@example.com', ownedStreamerIds: meOwned }),
    });
  });
  await page.route('**/api/public/**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const sid = decodeURIComponent(route.request().url().split('/api/public/')[1] || '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makePublicPayload(sid, 5)),
    });
  });
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.evaluate(async () => {
    setOnlineMode('google', { openPanel: false });
    await completeUtaeruLogin({ googleAccessToken: 'mock' });
  });
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({
    active: activeOwnedStreamerId,
    sid: streamerIdInput.value,
  }));
  if (state.active === 'other-page' && state.sid === 'other-page') {
    ok('L: 別アカウント → 前の hiro を編集対象にしない（1件所有なら other-page）');
  } else {
    fail('L: 別アカウント → 前の hiro を編集対象にしない', JSON.stringify(state));
  }
  await browser.close();
}

async function testDraftMismatch() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await addBypassStart(page);
  await page.addInitScript(() => {
    localStorage.setItem('utalis_draft_v1', JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      streamerId: 'anonymous-draft-id',
      data: {
        streamerName: '匿名下書き',
        subtitle: '',
        streamerId: 'anonymous-draft-id',
        selectedSongIds: [1],
        songMeta: {},
        tagPresets: [],
        themeType: 'preset',
        presetIndex: 0,
        customHex: null,
        customColorConfigured: false,
      },
    }));
  });
  await mockAuthWithOwned(page, ['hiro']);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.evaluate(async () => {
    setOnlineMode('google', { openPanel: false });
    await completeUtaeruLogin({ googleAccessToken: 'mock' });
  });
  await page.waitForTimeout(500);
  const modal = await page.evaluate(() => !document.getElementById('googleDraftChoiceModal').hidden);
  if (!modal) {
    fail('F(不一致): 下書きあり → モーダル表示');
  } else {
    ok('F(不一致): 下書きあり → モーダル表示');
  }
  await page.click('#googleDraftContinueBtn');
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => ({
    name: streamerNameInput.value,
    active: activeOwnedStreamerId,
    sid: streamerIdInput.value,
  }));
  if (state.name === '匿名下書き' && !state.active) ok('F(不一致): 下書き続行 → hiro に紐づけない');
  else fail('F(不一致): 下書き続行 → hiro に紐づけない', JSON.stringify(state));
  await browser.close();
}

async function testPageSwitchConfirm() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await addBypassStart(page);
  await page.addInitScript(() => {
    localStorage.removeItem('utalis_draft_v1');
    localStorage.removeItem('utalis_active_streamer_v1');
  });
  await page.route('**/api/auth/google', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'session-test@example.com', accessToken: 'mock.token' }),
  }));
  await page.route('**/api/auth/me', (route) => {
    const auth = route.request().headers()['authorization'];
    if (!auth) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'session-test@example.com', ownedStreamerIds: ['alpha', 'beta'] }),
    });
  });
  await page.route('**/api/public/**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const sid = decodeURIComponent(route.request().url().split('/api/public/')[1] || '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makePublicPayload(sid, 3)),
    });
  });
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.evaluate(async () => {
    setOnlineMode('google', { openPanel: false });
    await completeUtaeruLogin({ googleAccessToken: 'mock' });
  });
  await page.waitForTimeout(300);
  await page.click('.google-page-pick-edit[data-streamer-id="alpha"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    streamerNameInput.value = 'alpha を編集';
    scheduleDraftSave(true);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    setOnlineMode('google', { openPanel: true });
  });
  await page.click('#switchOwnedPageBtn');
  await page.waitForTimeout(200);
  await page.click('.google-page-pick-edit[data-streamer-id="beta"]');
  await page.waitForTimeout(200);
  const confirmVisible = await page.evaluate(() => !document.getElementById('loadPublicDataModal').hidden);
  if (confirmVisible) ok('I(切替): 未公開編集あり → ページ切替で確認');
  else fail('I(切替): 未公開編集あり → ページ切替で確認');
  await browser.close();
}

async function main() {
  console.log('=== test-google-active-session.mjs ===\n');
  await testM();
  await testL();
  await testDraftMismatch();
  await testPageSwitchConfirm();
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
