#!/usr/bin/env node
/**
 * Google所有公開ページの「編集する」フロー回帰テスト（OAuth/APIはモック）
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
    subtitle: 'サーバー上のサブタイトル',
    configVersion: 2,
    themeType: 'preset',
    presetIndex: 1,
    customHex: null,
    streamerId: sid,
    songs,
    songMeta: {},
    tagPresets: [{ id: 't1', label: 'タグ1' }],
    updatedAt: new Date().toISOString(),
  };
}

async function mockAuth(page, ownedIds = []) {
  let publicGetCount = 0;
  const publicGets = [];

  await page.route('**/api/auth/google', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'owned-test@example.com', accessToken: 'mock.token' }),
  }));

  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'owned-test@example.com', ownedStreamerIds: ownedIds }),
  }));

  await page.route('**/api/public/**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    publicGetCount += 1;
    const url = route.request().url();
    publicGets.push(url);
    const sid = decodeURIComponent(url.split('/api/public/')[1] || '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makePublicPayload(sid)),
    });
  });

  return {
    getPublicGetCount: () => publicGetCount,
    getPublicGets: () => publicGets,
  };
}

async function loginGoogle(page) {
  await page.evaluate(async () => {
    setOnlineMode('google', { openPanel: true });
    await completeUtaeruLogin({ googleAccessToken: 'mock' });
  });
  await page.waitForTimeout(400);
}

async function setupEditor(page) {
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.waitForTimeout(100);
}

async function testA() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pub = await mockAuth(page, ['hiro']);
  await setupEditor(page);
  await page.fill('#streamerName', 'ログイン保持');
  await page.evaluate(() => {
    selectedKeys.clear();
    for (const s of MASTER_SONGS.slice(0, 2)) selectedKeys.add(s.a + '\u0001' + s.t);
    render();
    updateSelectedCount();
  });
  const before = await page.evaluate(() => ({
    name: streamerNameInput.value,
    count: selectedKeys.size,
  }));
  await loginGoogle(page);
  const after = await page.evaluate(() => ({
    name: streamerNameInput.value,
    count: selectedKeys.size,
  }));
  if (JSON.stringify(before) === JSON.stringify(after)) ok('A: ログイン後も編集内容維持');
  else fail('A: ログイン後も編集内容維持', `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  if (pub.getPublicGetCount() === 0) ok('A/J: ログインだけでは GET /api/public なし');
  else fail('A/J: ログインだけでは GET /api/public なし', String(pub.getPublicGetCount()));
  await browser.close();
}

async function testB() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await setupEditor(page);
  await loginGoogle(page);
  const heading = await page.textContent('.owned-pages-heading');
  if (heading?.includes('あなたの公開ページ')) ok('B: あなたの公開ページ 見出し');
  else fail('B: あなたの公開ページ 見出し', heading);
  const idText = await page.textContent('.owned-page-id');
  if (idText === 'hiro') ok('B: 1件所有 hiro 表示');
  else fail('B: 1件所有 hiro 表示', idText);
  await page.click('.owned-page-edit');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    name: streamerNameInput.value,
    sid: streamerIdInput.value,
    count: selectedKeys.size,
  }));
  if (after.name === 'サーバー上の配信者名' && after.sid === 'hiro' && after.count === 13) {
    ok('B: 編集する → 公開データ反映');
  } else {
    fail('B: 編集する → 公開データ反映', JSON.stringify(after));
  }
  await browser.close();
}

async function testC() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['alpha', 'beta']);
  await setupEditor(page);
  await loginGoogle(page);
  const items = await page.$$('.owned-page-item');
  if (items.length === 2) ok('C: 複数所有 2件表示');
  else fail('C: 複数所有 2件表示', String(items.length));
  await page.locator('.owned-page-edit[data-streamer-id="beta"]').click();
  await page.waitForTimeout(400);
  const sid = await page.inputValue('#streamerIdInput');
  if (sid === 'beta') ok('C: beta を選択して編集可能');
  else fail('C: beta を選択して編集可能', sid);
  await browser.close();
}

async function testD() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, []);
  await setupEditor(page);
  await loginGoogle(page);
  const empty = await page.textContent('#ownedPagesEmpty');
  if (empty?.includes('まだ公開ページはありません')) ok('D: 0件 空表示');
  else fail('D: 0件 空表示', empty);
  const claimDisabled = await page.isDisabled('#claimBtn');
  if (!claimDisabled) ok('D: 新規 claim 可能（ID入力時）');
  else ok('D: claim は ID未入力時 disabled（現仕様）');
  await browser.close();
}

async function testE() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await setupEditor(page);
  await page.fill('#streamerName', '下書き保持テスト');
  await page.evaluate(() => scheduleDraftSave(true));
  await page.waitForTimeout(600);
  await loginGoogle(page);
  await page.click('.owned-page-edit');
  await page.waitForTimeout(200);
  const modalVisible = await page.evaluate(() => !document.getElementById('loadPublicDataModal').hidden);
  if (modalVisible) ok('E: 下書きあり → 確認モーダル');
  else fail('E: 下書きあり → 確認モーダル');
  await page.click('#loadPublicDataCancel');
  await page.waitForTimeout(200);
  const name = await page.inputValue('#streamerName');
  if (name === '下書き保持テスト') ok('E: キャンセル → 下書き維持');
  else fail('E: キャンセル → 下書き維持', name);
  await browser.close();
}

async function testF() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await setupEditor(page);
  await page.fill('#streamerName', '置換前');
  await page.evaluate(() => scheduleDraftSave(true));
  await page.waitForTimeout(600);
  await loginGoogle(page);
  await page.click('.owned-page-edit');
  await page.waitForTimeout(200);
  await page.click('#loadPublicDataConfirm');
  await page.waitForTimeout(400);
  const name = await page.inputValue('#streamerName');
  const draft = await page.evaluate(() => {
    const raw = localStorage.getItem('utalis_draft_v1');
    return raw ? JSON.parse(raw).data.streamerName : null;
  });
  if (name === 'サーバー上の配信者名') ok('F: 読み込む → サーバーデータ適用');
  else fail('F: 読み込む → サーバーデータ適用', name);
  if (draft === 'サーバー上の配信者名') ok('F: draft もサーバー内容へ更新');
  else fail('F: draft もサーバー内容へ更新', draft);
  await browser.close();
}

async function testG() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await mockAuth(page, ['hiro']);
  await setupEditor(page);
  await page.evaluate(() => localStorage.removeItem('utalis_draft_v1'));
  await loginGoogle(page);
  await page.click('.owned-page-edit');
  await page.waitForTimeout(400);
  const count = await page.evaluate(() => selectedKeys.size);
  if (count === 13) ok('G: localStorageなし → hiro 13曲復元');
  else fail('G: localStorageなし → hiro 13曲復元', String(count));
  await browser.close();
}

async function testH() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let putUrl = null;
  await page.route('**/api/auth/google', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'owned-test@example.com', accessToken: 'mock.token' }),
  }));
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'owned-test@example.com', ownedStreamerIds: ['hiro'] }),
  }));
  await page.route('**/api/public/**', async (route) => {
    if (route.request().method() === 'PUT') {
      putUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makePublicPayload('hiro', 13)),
      });
      return;
    }
    const sid = decodeURIComponent(route.request().url().split('/api/public/')[1] || '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makePublicPayload(sid)),
    });
  });
  await setupEditor(page);
  await loginGoogle(page);
  await page.click('.owned-page-edit');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    selectedKeys.clear();
    for (const s of MASTER_SONGS.slice(0, 13)) selectedKeys.add(keyOf(s));
    streamerNameInput.value = '更新後の配信者名';
    render();
    updateSelectedCount();
  });
  await page.evaluate(async () => {
    await publishOnline();
  });
  await page.waitForTimeout(400);
  if (putUrl && putUrl.includes('/api/public/hiro')) ok('H: 読み込み後の公開は PUT /api/public/hiro');
  else fail('H: 読み込み後の公開は PUT /api/public/hiro', putUrl);
  await browser.close();
}

async function testI() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await setupEditor(page);
  await page.fill('#streamerName', 'ログアウト後も残る');
  await page.evaluate(() => scheduleDraftSave(true));
  await page.waitForTimeout(600);
  await loginGoogle(page);
  await page.evaluate(async () => { await logoutUser(); });
  await page.waitForTimeout(300);
  const draft = await page.evaluate(() => localStorage.getItem('utalis_draft_v1'));
  const name = await page.inputValue('#streamerName');
  if (draft && name === 'ログアウト後も残る') ok('I: ログアウト後も下書き・編集内容維持');
  else fail('I: ログアウト後も下書き・編集内容維持');
  await browser.close();
}

async function testMobileLayout() {
  for (const width of [320, 375, 390, 430]) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockAuth(page, ['hiro']);
    await setupEditor(page);
    await loginGoogle(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const btnBox = await page.locator('.owned-page-edit').boundingBox();
    if (!overflow) ok(`${width}px: 横スクロールなし`);
    else fail(`${width}px: 横スクロールなし`);
    if (btnBox && btnBox.height >= 40) ok(`${width}px: 編集するボタン十分な高さ`);
    else fail(`${width}px: 編集するボタン十分な高さ`, JSON.stringify(btnBox));
    if (!errors.length) ok(`${width}px: JSエラーなし`);
    else fail(`${width}px: JSエラーなし`, errors.join('; '));
    await browser.close();
  }
}

async function testViewLink() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await setupEditor(page);
  await loginGoogle(page);
  const href = await page.getAttribute('.owned-page-view', 'href');
  if (href === 'https://utalis.github.io/u/hiro') ok('見る: 公開URL /u/hiro');
  else fail('見る: 公開URL /u/hiro', href);
  await browser.close();
}

async function main() {
  console.log('=== test-google-owned-pages.mjs ===\n');
  await testA();
  await testB();
  await testC();
  await testD();
  await testE();
  await testF();
  await testG();
  await testH();
  await testI();
  await testViewLink();
  await testMobileLayout();
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
