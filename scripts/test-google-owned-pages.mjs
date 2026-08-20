#!/usr/bin/env node
/**
 * Google所有公開ページの編集セッション自動復元フロー回帰テスト（OAuth/APIはモック）
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
      body: JSON.stringify({ email: 'owned-test@example.com', ownedStreamerIds: ownedIds }),
    });
  });

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
  await page.waitForTimeout(500);
}

async function setupEditor(page, opts = {}) {
  await addBypassStart(page);
  if (opts.clearDraft !== false) {
    await page.addInitScript(() => {
      localStorage.removeItem('utalis_draft_v1');
      localStorage.removeItem('utalis_active_streamer_v1');
    });
  }
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
    draftModal: !document.getElementById('googleDraftChoiceModal').hidden,
  }));
  if (JSON.stringify(before) === JSON.stringify({ name: after.name, count: after.count })) {
    ok('A: ログイン後も編集内容維持');
  } else {
    fail('A: ログイン後も編集内容維持', `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  }
  if (after.draftModal) ok('A: 編集中データあり → 下書き選択モーダル');
  else fail('A: 編集中データあり → 下書き選択モーダル');
  if (pub.getPublicGetCount() === 1) ok('A/J: モーダル表示用 GET /api/public のみ（上書きなし）');
  else fail('A/J: モーダル表示用 GET /api/public のみ', String(pub.getPublicGetCount()));
  await browser.close();
}

async function testB() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pub = await mockAuth(page, ['hiro']);
  await setupEditor(page);
  await loginGoogle(page);
  const heading = await page.textContent('.owned-pages-heading');
  if (heading?.includes('あなたの公開ページ')) ok('B: あなたの公開ページ 見出し');
  else fail('B: あなたの公開ページ 見出し', heading);
  const after = await page.evaluate(() => ({
    name: streamerNameInput.value,
    sid: streamerIdInput.value,
    count: selectedKeys.size,
    active: activeOwnedStreamerId,
  }));
  if (after.name === 'サーバー上の配信者名' && after.sid === 'hiro' && after.count === 13) {
    ok('B: 1件所有 → 自動で公開データ反映');
  } else {
    fail('B: 1件所有 → 自動で公開データ反映', JSON.stringify(after));
  }
  if (after.active === 'hiro') ok('B: activeOwnedStreamerId = hiro');
  else fail('B: activeOwnedStreamerId = hiro', after.active);
  if (pub.getPublicGetCount() === 1) ok('B: GET /api/public/hiro 1回');
  else fail('B: GET /api/public/hiro 1回', String(pub.getPublicGetCount()));
  await browser.close();
}

async function testC() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pub = await mockAuth(page, ['alpha', 'beta']);
  await setupEditor(page);
  await loginGoogle(page);
  const pickVisible = await page.evaluate(() => !document.getElementById('googlePagePickModal').hidden);
  if (pickVisible) ok('C: 複数所有 → 自動選択せず選択UI');
  else fail('C: 複数所有 → 自動選択せず選択UI');
  if (pub.getPublicGetCount() === 0) ok('C: 複数所有 → ログイン時 GET なし');
  else fail('C: 複数所有 → ログイン時 GET なし', String(pub.getPublicGetCount()));
  await page.click('.google-page-pick-edit[data-streamer-id="beta"]');
  await page.waitForTimeout(600);
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
  const active = await page.evaluate(() => activeOwnedStreamerId);
  if (!active) ok('D: 0件 → activeStreamerId なし');
  else fail('D: 0件 → activeStreamerId なし', active);
  await browser.close();
}

async function testE() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await setupEditor(page, { clearDraft: true });
  await page.fill('#streamerName', '下書き保持テスト');
  await page.fill('#streamerIdInput', 'hiro');
  await page.evaluate(() => scheduleDraftSave(true));
  await page.waitForTimeout(600);
  await loginGoogle(page);
  await page.waitForFunction(() => {
    const m = document.getElementById('googleDraftChoicePublishedMeta');
    return !document.getElementById('googleDraftChoiceModal').hidden
      && m && !m.hidden && m.textContent.includes('最終公開');
  }, { timeout: 5000 });
  const modalVisible = await page.evaluate(() => !document.getElementById('googleDraftChoiceModal').hidden);
  if (modalVisible) ok('E: 下書きあり → 下書き選択モーダル（自動上書きなし）');
  else fail('E: 下書きあり → 下書き選択モーダル');
  const modalCopy = await page.evaluate(() => ({
    title: document.getElementById('googleDraftChoiceTitle')?.textContent?.trim(),
    draftBtn: document.getElementById('googleDraftContinueBtn')?.textContent?.trim(),
    pubBtn: document.getElementById('googleDraftLoadPublishedBtn')?.textContent?.trim(),
    draftMeta: document.getElementById('googleDraftChoiceDraftMeta')?.textContent?.trim(),
    pubMeta: document.getElementById('googleDraftChoicePublishedMeta')?.textContent?.trim(),
  }));
  if (modalCopy.title === '編集中のデータが2つあります') ok('E: 新タイトル表示');
  else fail('E: 新タイトル表示', modalCopy.title);
  if (modalCopy.draftBtn === 'この端末の下書きから編集') ok('E: 下書きボタン文言');
  else fail('E: 下書きボタン文言', modalCopy.draftBtn);
  if (modalCopy.pubBtn === '現在の公開データから編集') ok('E: 公開データボタン文言');
  else fail('E: 公開データボタン文言', modalCopy.pubBtn);
  if (modalCopy.draftMeta?.includes('最終保存') && modalCopy.draftMeta?.includes('曲')) ok('E: 下書きメタ表示');
  else fail('E: 下書きメタ表示', modalCopy.draftMeta);
  if (modalCopy.pubMeta?.includes('最終公開') && modalCopy.pubMeta?.includes('13曲')) ok('E: 公開メタ表示');
  else fail('E: 公開メタ表示', modalCopy.pubMeta);
  await page.click('#googleDraftContinueBtn');
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => ({
    name: streamerNameInput.value,
    active: activeOwnedStreamerId,
  }));
  if (state.name === '下書き保持テスト') ok('E: 下書きを続ける → 内容維持');
  else fail('E: 下書きを続ける → 内容維持', state.name);
  if (state.active === 'hiro') ok('E: 下書きID一致 → 更新対象 hiro');
  else fail('E: 下書きID一致 → 更新対象 hiro', state.active);
  await browser.close();
}

async function testF() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await setupEditor(page, { clearDraft: true });
  await page.fill('#streamerName', '置換前');
  await page.evaluate(() => scheduleDraftSave(true));
  await page.waitForTimeout(600);
  await loginGoogle(page);
  await page.click('#googleDraftLoadPublishedBtn');
  await page.waitForTimeout(400);
  const name = await page.inputValue('#streamerName');
  const draft = await page.evaluate(() => {
    const raw = localStorage.getItem('utalis_draft_v1');
    return raw ? JSON.parse(raw).data.streamerName : null;
  });
  if (name === 'サーバー上の配信者名') ok('F: 公開済み読込 → サーバーデータ適用');
  else fail('F: 公開済み読込 → サーバーデータ適用', name);
  if (draft === 'サーバー上の配信者名') ok('F: draft もサーバー内容へ更新');
  else fail('F: draft もサーバー内容へ更新', draft);
  await browser.close();
}

async function testG() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await setupEditor(page);
  await loginGoogle(page);
  const count = await page.evaluate(() => selectedKeys.size);
  if (count === 13) ok('G: 下書きなし → hiro 13曲自動復元');
  else fail('G: 下書きなし → hiro 13曲自動復元', String(count));
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
      body: JSON.stringify({ email: 'owned-test@example.com', ownedStreamerIds: ['hiro'] }),
    });
  });
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
  await page.evaluate(() => {
    streamerNameInput.value = '更新後の配信者名';
    render();
    updateSelectedCount();
  });
  await page.evaluate(async () => { await publishOnline(); });
  await page.waitForTimeout(400);
  if (putUrl && putUrl.includes('/api/public/hiro')) ok('H: 自動読込後の公開は PUT /api/public/hiro');
  else fail('H: 自動読込後の公開は PUT /api/public/hiro', putUrl);
  const afterPub = await page.evaluate(() => ({
    active: activeOwnedStreamerId,
    sid: streamerIdInput.value,
    auth: !!authUser,
  }));
  if (afterPub.active === 'hiro' && afterPub.sid === 'hiro' && afterPub.auth) {
    ok('H: 公開後も編集セッション維持');
  } else {
    fail('H: 公開後も編集セッション維持', JSON.stringify(afterPub));
  }
  await browser.close();
}

async function testI() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockAuth(page, ['hiro']);
  await setupEditor(page, { clearDraft: true });
  await page.fill('#streamerName', 'ログアウト後も残る');
  await page.evaluate(() => scheduleDraftSave(true));
  await page.waitForTimeout(600);
  await loginGoogle(page);
  await page.evaluate(async () => { await logoutUser(); });
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    draft: localStorage.getItem('utalis_draft_v1'),
    active: localStorage.getItem('utalis_active_streamer_v1'),
    name: streamerNameInput.value,
    auth: authUser,
  }));
  if (state.draft && state.name === 'ログアウト後も残る') ok('I: ログアウト後も下書き・編集内容維持');
  else fail('I: ログアウト後も下書き・編集内容維持');
  if (!state.active && !state.auth) ok('I: ログアウト → activeStreamerId・auth 解除');
  else fail('I: ログアウト → activeStreamerId・auth 解除', JSON.stringify(state));
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
    const activeLine = await page.textContent('#activeEditorPageLine');
    if (!overflow) ok(`${width}px: 横スクロールなし`);
    else fail(`${width}px: 横スクロールなし`);
    if (activeLine?.includes('hiro')) ok(`${width}px: 現在編集中表示`);
    else fail(`${width}px: 現在編集中表示`, activeLine);
    if (!errors.length) ok(`${width}px: JSエラーなし`);
    else fail(`${width}px: JSエラーなし`, errors.join('; '));
    await browser.close();
  }
}

async function testUnrelatedLocalDraftLoadsCloud() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pub = await mockAuth(page, ['hiro']);
  await setupEditor(page, { clearDraft: true });
  await page.fill('#streamerName', 'このPCの無関係な下書き');
  await page.fill('#streamerIdInput', 'pc-guest-draft');
  await page.evaluate(() => {
    selectedKeys.clear();
    for (const s of MASTER_SONGS.slice(0, 1)) selectedKeys.add(s.a + '\u0001' + s.t);
    render();
    updateSelectedCount();
    scheduleDraftSave(true);
  });
  await page.waitForTimeout(600);
  await loginGoogle(page);
  const after = await page.evaluate(() => ({
    name: streamerNameInput.value,
    sid: streamerIdInput.value,
    count: selectedKeys.size,
    draftModal: !document.getElementById('googleDraftChoiceModal').hidden,
    active: activeOwnedStreamerId,
  }));
  if (!after.draftModal) ok('別端末同期: 無関係な下書きでは選択モーダルを出さない');
  else fail('別端末同期: 無関係な下書きでは選択モーダルを出さない');
  if (after.name === 'サーバー上の配信者名' && after.sid === 'hiro' && after.count === 13 && after.active === 'hiro') {
    ok('別端末同期: 所有ページの公開データを自動読込');
  } else {
    fail('別端末同期: 所有ページの公開データを自動読込', JSON.stringify(after));
  }
  if (pub.getPublicGetCount() >= 1) ok('別端末同期: GET /api/public/hiro');
  else fail('別端末同期: GET /api/public/hiro', String(pub.getPublicGetCount()));
  await browser.close();
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
  await testUnrelatedLocalDraftLoadsCloud();
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
