#!/usr/bin/env node
/**
 * スタート画面 回帰テスト（A–K）
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
    streamerName: 'サーバー配信者',
    subtitle: 'sub',
    themeType: 'preset',
    presetIndex: 0,
    songs,
    songMeta: {},
    tagPresets: [],
  };
}

async function mockAuth(page, ownedIds = []) {
  await page.route('**/api/auth/google', (r) => r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'start@example.com', accessToken: 'mock.token' }),
  }));
  await page.route('**/api/auth/me', (r) => {
    const auth = r.request().headers()['authorization'];
    if (!auth) {
      return r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
    }
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'start@example.com', ownedStreamerIds: ownedIds }),
    });
  });
  await page.route('**/api/public/**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const sid = decodeURIComponent(route.request().url().split('/api/public/')[1] || 'hiro');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makePublicPayload(sid)),
    });
  });
}

async function gotoFresh(page) {
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.waitForTimeout(100);
}

async function testA() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await gotoFresh(page);
  const visible = await page.evaluate(() => !document.getElementById('startScreen').hidden);
  if (visible) ok('A: 初回スタート画面表示');
  else fail('A: 初回スタート画面表示');
  await browser.close();
}

async function testB() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await gotoFresh(page);
  await page.evaluate(async () => {
    await completeUtaeruLogin({ googleAccessToken: 'mock' });
  });
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => ({
    start: document.body.classList.contains('start-screen-active'),
    owned: document.querySelector('.owned-pages-heading')?.textContent,
    auth: !!authUser,
  }));
  if (!state.start && state.auth && state.owned?.includes('あなたの公開ページ')) ok('B: Googleログイン → 編集画面 + あなたの公開ページ');
  else fail('B: Googleログイン → 編集画面', JSON.stringify(state));
  await browser.close();
}

async function testC() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await page.addInitScript(() => {
    sessionStorage.setItem('utaeru_access_token', 'existing.token');
  });
  await gotoFresh(page);
  const state = await page.evaluate(() => ({
    start: document.body.classList.contains('start-screen-active'),
    auth: !!authUser,
  }));
  if (!state.start && state.auth) ok('C: ログイン済み → スタートスキップ');
  else fail('C: ログイン済み → スタートスキップ', JSON.stringify(state));
  await browser.close();
}

async function testD() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await gotoFresh(page);
  await page.click('#startGuestBtn');
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => ({
    start: document.body.classList.contains('start-screen-active'),
    tab: !!document.getElementById('editNav'),
  }));
  if (!state.start && state.tab) ok('D: ログインせず → 編集画面');
  else fail('D: ログインせず → 編集画面', JSON.stringify(state));
  await browser.close();
}

async function testE() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.fill('#streamerName', '下書きE');
  await page.evaluate(() => scheduleDraftSave(true));
  await page.waitForFunction(() => {
    try {
      const raw = localStorage.getItem('utalis_draft_v1');
      return raw && JSON.parse(raw).data?.streamerName === '下書きE';
    } catch { return false; }
  }, { timeout: 5000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('streamerName')?.value === '下書きE', { timeout: 5000 });
  const name = await page.inputValue('#streamerName');
  if (name === '下書きE') ok('E: 匿名下書き → リロード復元');
  else fail('E: 匿名下書き → リロード復元', name);
  await browser.close();
}

async function testF() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('utalis_draft_v1', JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      streamerId: '',
      data: { streamerName: '下書きF', subtitle: '', streamerId: '', selectedSongIds: [], songMeta: {}, tagPresets: [], themeType: 'preset', presetIndex: 0, customHex: null, customColorConfigured: false },
    }));
  });
  await mockAuth(page, ['hiro']);
  await gotoFresh(page);
  const hint = await page.evaluate(() => !document.getElementById('startDraftHint').hidden);
  if (hint) ok('F: 下書きあり → スタートに表示');
  else fail('F: 下書きあり → スタートに表示');
  await page.evaluate(async () => {
    await completeUtaeruLogin({ googleAccessToken: 'mock' });
  });
  await page.waitForTimeout(400);
  const draft = await page.evaluate(() => localStorage.getItem('utalis_draft_v1'));
  if (draft && draft.includes('下書きF')) ok('F: Googleログイン → 下書き消えない');
  else fail('F: Googleログイン → 下書き消えない');
  await browser.close();
}

async function testG() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('utalis_draft_v1', JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      streamerId: '',
      data: { streamerName: '下書きG', subtitle: '', streamerId: 'g-test', selectedSongIds: [1], songMeta: {}, tagPresets: [], themeType: 'preset', presetIndex: 0, customHex: null, customColorConfigured: false },
    }));
  });
  await gotoFresh(page);
  await page.click('#startGuestBtn');
  await page.waitForTimeout(300);
  const name = await page.inputValue('#streamerName');
  if (name === '下書きG') ok('G: 下書きあり → ログインせず → 復元');
  else fail('G: 下書きあり → ログインせず → 復元', name);
  await browser.close();
}

async function testH() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await gotoFresh(page);
  await page.evaluate(async () => {
    setOnlineMode('google', { openPanel: true });
    await completeUtaeruLogin({ googleAccessToken: 'mock' });
  });
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    await executeLoadOwnedPageForEdit('hiro');
  });
  await page.waitForTimeout(400);
  const count = await page.evaluate(() => selectedKeys.size);
  if (count === 13) ok('H: hiro 編集する → 13曲');
  else fail('H: hiro 編集する → 13曲', String(count));
  await browser.close();
}

async function testI() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await addBypassStart(page);
  await mockAuth(page, ['hiro']);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.fill('#streamerName', 'ログアウトI');
  await page.evaluate(() => scheduleDraftSave(true));
  await page.waitForTimeout(500);
  await page.evaluate(async () => { await logoutUser(); });
  await page.waitForTimeout(300);
  const draft = await page.evaluate(() => localStorage.getItem('utalis_draft_v1'));
  const name = await page.inputValue('#streamerName');
  if (draft && name === 'ログアウトI') ok('I: ログアウト → 下書き維持');
  else fail('I: ログアウト → 下書き維持');
  await browser.close();
}

async function testJ() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await gotoFresh(page);
  await page.click('#startGuestBtn');
  await page.waitForTimeout(200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => ({
    start: document.body.classList.contains('start-screen-active'),
    choice: localStorage.getItem('utalis_start_choice_v1'),
    loginBtn: !!document.getElementById('accountGoogleLoginBtn'),
  }));
  if (!state.start && state.choice === 'guest' && state.loginBtn) ok('J: 匿名記憶 → 次回直接編集 + Googleログイン可能');
  else fail('J: 匿名記憶', JSON.stringify(state));
  await browser.close();
}

async function testK() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.click('#editTabSongs');
  await page.waitForSelector('#panelSongs:not([hidden])');
  await page.evaluate(() => {
    selectedKeys.add(MASTER_SONGS[0].a + '\u0001' + MASTER_SONGS[0].t);
    render();
    updateSelectedCount();
    updatePreviewPanel();
  });
  const count = await page.evaluate(() => selectedKeys.size);
  if (count >= 1) ok('K: 既存機能（曲選択）正常');
  else fail('K: 既存機能（曲選択）正常');
  await browser.close();
}

async function testMobile() {
  for (const width of [320, 375, 390, 430]) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage({ viewport: { width, height: 800 } });
    await gotoFresh(page);
    if (!await page.evaluate(() => document.body.classList.contains('start-screen-active'))) {
      fail(`${width}px: スタート画面表示`);
      await browser.close();
      continue;
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const wm = await page.textContent('.start-wordmark');
    const btn = await page.locator('#startGoogleLoginBtn').boundingBox();
    if (!overflow) ok(`${width}px: 横スクロールなし`);
    else fail(`${width}px: 横スクロールなし`);
    if (wm === 'UTAEMO') ok(`${width}px: UTAEMO表示`);
    else fail(`${width}px: UTAEMO表示`, wm);
    if (btn && btn.height >= 44) ok(`${width}px: ボタン高さ`);
    else fail(`${width}px: ボタン高さ`, JSON.stringify(btn));
    await browser.close();
  }
}

async function main() {
  console.log('=== test-start-screen.mjs ===\n');
  await testA();
  await testB();
  await testC();
  await testD();
  await testE();
  await testF();
  await testG();
  await testH();
  await testI();
  await testJ();
  await testK();
  await testMobile();
  console.log('');
  if (failed) {
    console.error(`\n${failed} 件失敗`);
    process.exit(1);
  }
  console.log('すべて成功');
}

main().catch((e) => { console.error(e); process.exit(1); });
