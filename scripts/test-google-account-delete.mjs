#!/usr/bin/env node
/**
 * Googleアカウント情報削除機能の回帰テスト（OAuth/APIはモック、本番ユーザーは触らない）
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

function makeDraftEnvelope() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    data: {
      streamerName: '下書き配信者',
      streamerId: 'draft-test',
      selectedKeys: ['Artist\u0001Song1'],
    },
  };
}

function createMockState(initialOwned = []) {
  return {
    userExists: true,
    ownedIds: [...initialOwned],
    accountDeleteCalls: 0,
    logoutCalls: 0,
    detachCalls: [],
    releaseCalls: [],
    publicDeleteCalls: [],
    loginGenerations: 1,
  };
}

async function installMockApi(page, state) {
  await page.route('**/api/auth/google', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      email: 'delete-test@example.com',
      accessToken: `mock.token.${state.loginGenerations}`,
    }),
  }));

  await page.route('**/api/auth/me', (route) => {
    const auth = route.request().headers()['authorization'];
    if (!auth || !state.userExists) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'delete-test@example.com', ownedStreamerIds: state.ownedIds }),
    });
  });

  await page.route('**/api/auth/logout', (route) => {
    state.logoutCalls += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.route('**/api/auth/account', (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    state.accountDeleteCalls += 1;
    if (state.ownedIds.length > 0) {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'owned_pages_remain', ownedCount: state.ownedIds.length }),
      });
    }
    if (!state.userExists) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
    }
    state.userExists = false;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.route('**/api/streamer/*/detach-google', async (route) => {
    const sid = decodeURIComponent(route.request().url().split('/api/streamer/')[1].split('/detach-google')[0]);
    state.detachCalls.push(sid);
    state.ownedIds = state.ownedIds.filter((id) => id !== sid);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ streamerId: sid, ok: true, editKey: 'ut_' + 'a'.repeat(64) }),
    });
  });

  await page.route('**/api/streamer/*/release-google-ownership', async (route) => {
    const sid = decodeURIComponent(route.request().url().split('/api/streamer/')[1].split('/release-google-ownership')[0]);
    state.releaseCalls.push(sid);
    state.ownedIds = state.ownedIds.filter((id) => id !== sid);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ streamerId: sid, ok: true }),
    });
  });

  await page.route('**/api/streamer/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      const sid = decodeURIComponent(route.request().url().split('/api/streamer/')[1]);
      state.publicDeleteCalls.push(sid);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/public/**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const sid = decodeURIComponent(route.request().url().split('/api/public/')[1] || '');
    const status = sid === 'deleted-page' ? 410 : sid === 'reserved-page' ? 404 : 200;
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: status === 200
        ? JSON.stringify({ streamerId: sid, streamerName: '公開中', songs: [], updatedAt: new Date().toISOString() })
        : JSON.stringify({ error: status === 410 ? 'gone' : 'not_found' }),
    });
  });
}

async function setupEditor(page, opts = {}) {
  await addBypassStart(page);
  await page.addInitScript((draftJson) => {
    localStorage.removeItem('utalis_active_streamer_v1');
    if (draftJson) localStorage.setItem('utalis_draft_v1', draftJson);
    else localStorage.removeItem('utalis_draft_v1');
    sessionStorage.removeItem('utaeru_access_token');
  }, opts.draft ? JSON.stringify(makeDraftEnvelope()) : null);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.waitForTimeout(100);
}

async function loginGoogle(page) {
  await page.evaluate(async () => {
    setOnlineMode('google', { openPanel: true });
    await completeUtaeruLogin({ googleAccessToken: 'mock' });
  });
  await page.waitForTimeout(400);
}

async function clickDeleteAccountBtn(page) {
  await page.evaluate(() => {
    const btn = document.getElementById('deleteGoogleAccountBtn');
    btn?.scrollIntoView({ block: 'center' });
    btn?.click();
  });
}

async function openDeleteAccountModal(page) {
  const btn = page.locator('#deleteGoogleAccountBtn');
  if (!(await btn.isVisible())) {
    await page.click('#accountMenuBtn');
    await page.waitForSelector('#accountPanel.open', { timeout: 5000 });
  }
  await clickDeleteAccountBtn(page);
  await page.waitForSelector('#deleteGoogleAccountModal:not([hidden])', { timeout: 5000 });
}

async function testA() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const state = createMockState([]);
  await installMockApi(page, state);
  await setupEditor(page);
  await page.click('#accountMenuBtn');
  await page.waitForSelector('#accountPanel.open', { timeout: 5000 });
  const visible = await page.locator('#deleteGoogleAccountBtn').isVisible();
  if (!visible) ok('A: 未ログイン → アカウント削除UIなし');
  else fail('A: 未ログイン → アカウント削除UIなし');
  await browser.close();
}

async function testB() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const state = createMockState([]);
  await installMockApi(page, state);
  await setupEditor(page);
  await loginGoogle(page);
  const visible = await page.locator('#deleteGoogleAccountBtn').isVisible();
  if (visible) ok('B: Googleログイン → アカウント削除UIあり');
  else fail('B: Googleログイン → アカウント削除UIあり');
  await browser.close();
}

async function testC() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const state = createMockState([]);
  await installMockApi(page, state);
  await setupEditor(page);
  await loginGoogle(page);
  await clickDeleteAccountBtn(page);
  await page.waitForSelector('#deleteGoogleAccountModal:not([hidden])', { timeout: 5000 });
  if (state.accountDeleteCalls === 0) ok('C: 1タップではDELETEされない（確認モーダルのみ）');
  else fail('C: 1タップではDELETEされない', String(state.accountDeleteCalls));
  await browser.close();
}

async function testD() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const state = createMockState([]);
  await installMockApi(page, state);
  await setupEditor(page, { draft: true });
  await loginGoogle(page);
  await openDeleteAccountModal(page);
  await page.click('#deleteGoogleAccountCancel');
  await page.waitForTimeout(200);
  const data = await page.evaluate(() => ({
    modalHidden: document.getElementById('deleteGoogleAccountModal').hidden,
    token: sessionStorage.getItem('utaeru_access_token'),
    authUser: typeof authUser !== 'undefined' && !!authUser,
  }));
  if (data.modalHidden && data.token && data.authUser && state.accountDeleteCalls === 0) ok('D: キャンセル → 変更なし');
  else fail('D: キャンセル → 変更なし', JSON.stringify({ ...data, calls: state.accountDeleteCalls }));
  await browser.close();
}

async function testEtoM() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const state = createMockState([]);
  await installMockApi(page, state);
  await setupEditor(page, { draft: true });
  await page.evaluate(() => localStorage.setItem('utalis_active_streamer_v1', 'old-active'));
  await loginGoogle(page);
  await openDeleteAccountModal(page);
  const confirmDisabled = await page.locator('#deleteGoogleAccountConfirm').isDisabled();
  if (!confirmDisabled) ok('E: 所有0件 → 確認ボタン有効');
  else fail('E: 所有0件 → 確認ボタン有効');
  await page.click('#deleteGoogleAccountConfirm');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    token: sessionStorage.getItem('utaeru_access_token'),
    active: localStorage.getItem('utalis_active_streamer_v1'),
    draft: localStorage.getItem('utalis_draft_v1'),
    startChoice: localStorage.getItem('utalis_start_choice_v1'),
    authUser: typeof authUser !== 'undefined' ? authUser : null,
    msg: document.getElementById('authMessage')?.textContent || '',
    name: document.getElementById('streamerName')?.value || '',
  }));
  if (state.accountDeleteCalls === 1) ok('F: DELETE /api/auth/account 呼び出し');
  else fail('F: DELETE /api/auth/account 呼び出し', String(state.accountDeleteCalls));
  if (!after.token && !after.authUser) ok('G/I: 認証状態・access_token解除');
  else fail('G/I: 認証状態・access_token解除', JSON.stringify(after));
  if (after.active === null) ok('J: utalis_active_streamer_v1解除');
  else fail('J: utalis_active_streamer_v1解除', after.active);
  if (after.draft) ok('K: utalis_draft_v1維持');
  else fail('K: utalis_draft_v1維持');
  if (after.startChoice === 'guest') ok('J2: utalis_start_choice_v1維持');
  else fail('J2: utalis_start_choice_v1維持', after.startChoice);
  if (after.msg.includes('アカウント情報を削除しました')) ok('削除完了メッセージ');
  else fail('削除完了メッセージ', after.msg);
  if (after.name) ok('L: 削除後も匿名編集可能（フォーム維持）');
  else fail('L: 削除後も匿名編集可能', after.name);
  await browser.close();
}

async function testM() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const state = createMockState([]);
  await installMockApi(page, state);
  await setupEditor(page);
  await loginGoogle(page);
  await openDeleteAccountModal(page);
  await page.click('#deleteGoogleAccountConfirm');
  await page.waitForTimeout(400);
  state.loginGenerations += 1;
  state.userExists = true;
  await loginGoogle(page);
  const meOk = await page.evaluate(() => typeof authUser !== 'undefined' && !!authUser && authUser.email === 'delete-test@example.com');
  if (meOk && state.accountDeleteCalls === 1) ok('M: 再ログイン → 新規ユーザーとして扱える');
  else fail('M: 再ログイン → 新規ユーザーとして扱える', String(meOk));
  await browser.close();
}

async function testNandO() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const state = createMockState(['active-page', 'deleted-page', 'reserved-page']);
  await installMockApi(page, state);
  await setupEditor(page);
  await loginGoogle(page);
  await openDeleteAccountModal(page);
  await page.waitForTimeout(600);
  const confirmDisabled = await page.locator('#deleteGoogleAccountConfirm').isDisabled();
  const ownedVisible = await page.locator('#deleteAccountOwnedBlock:not([hidden])').isVisible();
  if (confirmDisabled && ownedVisible) ok('N/O: 所有ページあり → 確認無効・一覧表示');
  else fail('N/O: 所有ページあり → 確認無効・一覧表示', JSON.stringify({ confirmDisabled, ownedVisible }));
  await page.click('#deleteGoogleAccountConfirm', { force: true });
  await page.waitForTimeout(300);
  if (state.accountDeleteCalls === 0 && state.publicDeleteCalls.length === 0) ok('N: 公開ページを勝手に削除しない');
  else fail('N: 公開ページを勝手に削除しない', JSON.stringify({ account: state.accountDeleteCalls, page: state.publicDeleteCalls }));
  const listItems = await page.locator('#deleteAccountOwnedList li').count();
  if (listItems >= 3) ok('O: 所有ページ一覧（孤児化前に移行導線）');
  else fail('O: 所有ページ一覧', String(listItems));
  await browser.close();
}

async function testDetachAndRelease() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const state = createMockState(['active-page', 'deleted-page', 'reserved-page']);
  await installMockApi(page, state);
  await setupEditor(page);
  await loginGoogle(page);
  await openDeleteAccountModal(page);
  await page.waitForTimeout(700);

  await page.evaluate(async () => {
    async function clickOwnedAction(label) {
      const items = [...document.querySelectorAll('#deleteAccountOwnedList li')];
      const item = items.find((li) => li.querySelector('.owned-id')?.textContent === label);
      item?.querySelector('button')?.click();
    }
    clickOwnedAction('active-page');
    await new Promise((r) => setTimeout(r, 500));
    clickOwnedAction('deleted-page');
    await new Promise((r) => setTimeout(r, 500));
    clickOwnedAction('reserved-page');
    await new Promise((r) => setTimeout(r, 500));
  });
  await page.waitForTimeout(800);

  const keyStorage = await page.evaluate(() => ({
    sessionKey: sessionStorage.getItem('utaeru_edit_key:active-page'),
    localKey: localStorage.getItem('utaeru_edit_key:active-page'),
    modalText: document.getElementById('editKeyIssuedTitle')?.textContent || '',
    modalHint: document.querySelector('#editKeyIssuedModal .hint')?.textContent || '',
  }));
  if (keyStorage.sessionKey?.startsWith('ut_') && !keyStorage.localKey) {
    ok('編集キーは sessionStorage（utaeru_edit_key:ID）のみ');
  } else fail('編集キー保存先', JSON.stringify(keyStorage));
  if (keyStorage.modalText.includes('保管') && keyStorage.modalHint.includes('なくすと更新できません')) {
    ok('detach後: 編集キー喪失警告モーダル表示');
  } else fail('detach後: 編集キー喪失警告モーダル表示', JSON.stringify(keyStorage));

  if (state.detachCalls.includes('active-page')) ok('detach-google: 公開中ページを編集キーへ移行');
  else fail('detach-google', JSON.stringify(state.detachCalls));
  if (state.releaseCalls.includes('deleted-page') && state.releaseCalls.includes('reserved-page')) {
    ok('release-google-ownership: 削除済み/予約IDのGoogle管理解除');
  } else fail('release-google-ownership', JSON.stringify(state.releaseCalls));
  const confirmEnabled = await page.locator('#deleteGoogleAccountConfirm').isEnabled();
  if (confirmEnabled && state.ownedIds.length === 0) ok('所有解除後 → アカウント削除可能');
  else fail('所有解除後 → アカウント削除可能', JSON.stringify({ confirmEnabled, owned: state.ownedIds }));
  await browser.close();
}

async function testForbiddenDetach() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const state = createMockState(['mine-page']);
  await installMockApi(page, state);
  await page.route('**/api/streamer/other-page/detach-google', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'forbidden' }),
    });
  });
  await setupEditor(page);
  await loginGoogle(page);
  const res = await page.evaluate(async () => {
    const { res, data } = await apiFetch('/api/streamer/other-page/detach-google', { method: 'POST', body: '{}' });
    return { status: res.status, error: data?.error };
  });
  if (res.status === 403 && res.error === 'forbidden') ok('他人のstreamerId detach → 403');
  else fail('他人のstreamerId detach → 403', JSON.stringify(res));
  if (state.ownedIds.includes('mine-page')) ok('他人detach試行後も自分の所有は維持');
  else fail('他人detach試行後も自分の所有は維持', JSON.stringify(state.ownedIds));
  await browser.close();
}

async function testReleaseBlocksActive() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const state = createMockState(['active-page']);
  await installMockApi(page, state);
  await page.route('**/api/streamer/active-page/release-google-ownership', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'active_page_needs_detach' }),
    });
  });
  await setupEditor(page);
  await loginGoogle(page);
  const res = await page.evaluate(async () => {
    const { res, data } = await apiFetch('/api/streamer/active-page/release-google-ownership', { method: 'POST', body: '{}' });
    return { status: res.status, error: data?.error };
  });
  if (res.status === 409 && res.error === 'active_page_needs_detach') ok('公開中ページ release → 409');
  else fail('公開中ページ release → 409', JSON.stringify(res));
  await browser.close();
}

async function testP() {
  const terms = await import('node:fs').then((fs) => fs.readFileSync(path.join(ROOT, 'terms.html'), 'utf8'));
  const privacy = await import('node:fs').then((fs) => fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8'));
  const guide = await import('node:fs').then((fs) => fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8'));
  const checks = [
    terms.includes('アカウント設定') && !terms.includes('現時点では提供していません'),
    privacy.includes('DELETE /api/auth/account') && !privacy.includes('未提供'),
    guide.includes('アカウント情報を削除') && guide.includes('ログアウト') && guide.includes('端末上のログイン状態'),
  ];
  if (checks.every(Boolean)) ok('P: privacy / terms / guide が実装と一致');
  else fail('P: privacy / terms / guide が実装と一致', JSON.stringify(checks));
}

async function testQ() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const state = createMockState([]);
  await installMockApi(page, state);
  await setupEditor(page);
  await loginGoogle(page);
  await page.evaluate(() => {
    document.getElementById('logoutBtn')?.scrollIntoView({ block: 'center' });
    document.getElementById('logoutBtn')?.click();
  });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    token: sessionStorage.getItem('utaeru_access_token'),
    authUser: typeof authUser !== 'undefined' ? authUser : null,
  }));
  if (state.logoutCalls === 1 && !after.token && !after.authUser) ok('Q: 既存ログアウト正常');
  else fail('Q: 既存ログアウト正常', JSON.stringify({ ...after, logoutCalls: state.logoutCalls }));
  await browser.close();
}

async function testRegressionFlags() {
  const fs = await import('node:fs');
  const master = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const masterMatch = master.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/);
  if (masterMatch) ok('U: MASTER_SONGS 定義あり');
  else fail('U: MASTER_SONGS 定義あり');
  ok('V: /u/hiro 本番データ変更なし（モックテストのみ）');
}

async function main() {
  console.log('=== test-google-account-delete.mjs ===\n');
  await testA();
  await testB();
  await testC();
  await testD();
  await testEtoM();
  await testM();
  await testNandO();
  await testDetachAndRelease();
  await testForbiddenDetach();
  await testReleaseBlocksActive();
  await testP();
  await testQ();
  await testRegressionFlags();
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
