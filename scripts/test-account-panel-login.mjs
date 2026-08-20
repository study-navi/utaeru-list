#!/usr/bin/env node
/**
 * アカウント・公開管理パネルのログイン導線（1本化）回帰
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');
const WIDTHS = [320, 375, 390, 430, 1280];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function mockAuth(page, ownedIds = ['hiro']) {
  await page.route('**/api/auth/google', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'panel-test@example.com', accessToken: 'mock.token' }),
  }));
  await page.route('**/api/auth/me', (route) => {
    const auth = route.request().headers()['authorization'];
    if (!auth) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'panel-test@example.com', ownedStreamerIds: ownedIds }),
    });
  });
}

async function openPanel(page) {
  await page.evaluate(() => closeAccountPanel());
  const width = page.viewportSize()?.width ?? 1280;
  const selector = width <= 640 ? '#mobileMenuBtn' : '#accountMenuBtn';
  await page.click(selector);
  await page.waitForFunction(() => document.getElementById('accountPanel')?.classList.contains('open'), { timeout: 5000 });
}

async function testSignedOutSingleLoginPath(page) {
  const state = await page.evaluate(() => {
    const googleBtns = [...document.querySelectorAll('#accountPanel button, #accountPanel a')]
      .filter((el) => /Googleでログイン|Googleで管理する/.test(el.textContent || ''));
    return {
      signedOutVisible: !document.getElementById('accountSignedOutRoot')?.hidden,
      signedInHidden: document.getElementById('accountSignedInRoot')?.hidden,
      googleBtnCount: googleBtns.length,
      googleBtnLabels: googleBtns.map((el) => el.textContent?.trim()),
      benefits: document.querySelectorAll('.account-login-benefits li').length,
      legacy: {
        modeGoogleBtn: !!document.getElementById('modeGoogleBtn'),
        resumeGoogleBtn: !!document.getElementById('resumeGoogleBtn'),
        googleLoginBtn: !!document.getElementById('googleLoginBtn'),
        googleModePanel: !!document.getElementById('googleModePanel'),
      },
    };
  });
  if (state.signedOutVisible && state.signedInHidden) ok('未ログイン: ログイン案内のみ表示');
  else fail('未ログイン: ログイン案内のみ表示', JSON.stringify(state));
  if (state.googleBtnCount === 1 && state.googleBtnLabels[0] === 'Googleでログイン') {
    ok('未ログイン: Googleボタンは1つ');
  } else fail('未ログイン: Googleボタンは1つ', JSON.stringify(state));
  if (state.benefits === 3) ok('未ログイン: 説明3項目');
  else fail('未ログイン: 説明3項目', String(state.benefits));
  if (!state.legacy.modeGoogleBtn && !state.legacy.resumeGoogleBtn && !state.legacy.googleLoginBtn && !state.legacy.googleModePanel) {
    ok('未ログイン: 旧Google導線なし');
  } else fail('未ログイン: 旧Google導線なし', JSON.stringify(state.legacy));
}

async function testDirectAuthOnClick(page) {
  await page.click('#accountGoogleLoginBtn');
  const result = await page.evaluate(() => ({
    authLoading,
    message: document.getElementById('authMessage')?.textContent?.trim() || '',
  }));
  if (result.authLoading || /ログイン/.test(result.message)) {
    ok('未ログイン: 1タップで認証開始');
  } else {
    fail('未ログイン: 1タップで認証開始', JSON.stringify(result));
  }
}

async function testSignedInPanel(page) {
  await page.evaluate(async () => {
    await completeUtaeruLogin({ googleAccessToken: 'mock' });
  });
  await page.waitForTimeout(400);
  await openPanel(page);
  const state = await page.evaluate(() => ({
    signedInVisible: !document.getElementById('accountSignedInRoot')?.hidden,
    signedOutHidden: document.getElementById('accountSignedOutRoot')?.hidden,
    email: document.getElementById('authUserEmail')?.textContent?.trim(),
    loginBtn: !!document.getElementById('accountGoogleLoginBtn') && !document.getElementById('accountSignedOutRoot')?.hidden,
    logoutBtn: !!document.getElementById('logoutBtn'),
    ownedHeading: document.querySelector('.owned-pages-heading')?.textContent?.trim(),
  }));
  if (state.signedInVisible && state.signedOutHidden) ok('ログイン済: 管理UIのみ');
  else fail('ログイン済: 管理UIのみ', JSON.stringify(state));
  if (state.email === 'panel-test@example.com') ok('ログイン済: アカウント表示');
  else fail('ログイン済: アカウント表示', state.email);
  if (!state.loginBtn && state.logoutBtn) ok('ログイン済: ログインボタンなし・ログアウトあり');
  else fail('ログイン済: ログインボタンなし', JSON.stringify(state));
  if (state.ownedHeading?.includes('あなたの公開ページ')) ok('ログイン済: 公開ページ一覧');
  else fail('ログイン済: 公開ページ一覧', state.ownedHeading);
}

async function testResponsiveWidths(page) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
    await openPanel(page);
    const data = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      btn: document.getElementById('accountGoogleLoginBtn')?.getBoundingClientRect().height || 0,
      open: document.getElementById('accountPanel')?.classList.contains('open'),
    }));
    if (!data.overflow) ok(`${width}px: 横スクロールなし`);
    else fail(`${width}px: 横スクロールなし`);
    if (data.open) ok(`${width}px: パネル表示`);
    else fail(`${width}px: パネル表示`);
    if (width <= 430 && data.btn >= 44) ok(`${width}px: ログインボタン高さ`);
    else if (width > 430) ok(`${width}px: レイアウト`);
    else fail(`${width}px: ログインボタン高さ`, String(data.btn));
    await page.evaluate(() => closeAccountPanel());
    await page.waitForTimeout(100);
  }
}

async function main() {
  console.log('=== test-account-panel-login.mjs ===\n');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await openPanel(page);
  await testSignedOutSingleLoginPath(page);
  await testDirectAuthOnClick(page);

  await mockAuth(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await testSignedInPanel(page);

  await page.evaluate(() => {
    setStoredAccessToken(null);
    authUser = null;
    onlineMode = null;
    updateAuthUI();
  });
  await testResponsiveWidths(page);

  if (!errors.length) ok('Console pageerror なし');
  else fail('Console pageerror なし', errors.join('; '));

  await browser.close();
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
