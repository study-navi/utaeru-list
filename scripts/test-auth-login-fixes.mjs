#!/usr/bin/env node
/**
 * ログイン不具合修正の回帰（In-App Browser / OAuth redirect / 二重ボタン）
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

const TWITTER_IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone';
const SAFARI_IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function mockAuth(page) {
  await page.route('**/api/auth/google', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'oauth-test@example.com', accessToken: 'session.from.redirect' }),
  }));
  await page.route('**/api/auth/me', (route) => {
    const auth = route.request().headers()['authorization'];
    if (!auth) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'oauth-test@example.com', ownedStreamerIds: [] }),
    });
  });
}

async function testInAppBrowserDetection() {
  const browser = await chromium.launch();
  const twitterPage = await browser.newPage({ userAgent: TWITTER_IOS_UA });
  await twitterPage.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await twitterPage.waitForFunction(() => typeof isInAppBrowser === 'function', { timeout: 15000 });
  const twitter = await twitterPage.evaluate(() => isInAppBrowser());
  if (twitter) ok('Xアプリ内UA → isInAppBrowser');
  else fail('Xアプリ内UA → isInAppBrowser');

  const safariPage = await browser.newPage({ userAgent: SAFARI_IOS_UA });
  await safariPage.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await safariPage.waitForFunction(() => typeof isInAppBrowser === 'function', { timeout: 15000 });
  const safari = await safariPage.evaluate(() => isInAppBrowser());
  if (!safari) ok('iPhone Safari UA → 通常GIS');
  else fail('iPhone Safari UA → 通常GIS');
  await browser.close();
}

async function testInAppLoginUsesRedirect() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: TWITTER_IOS_UA });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  const dest = await page.evaluate(() => {
    let assigned = '';
    const original = startGoogleLoginRedirect;
    startGoogleLoginRedirect = () => { assigned = googleOAuthAuthorizeUrl(); };
    startGoogleLogin();
    startGoogleLoginRedirect = original;
    return assigned;
  });
  if (dest.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')) ok('In-App: フルページOAuthへ遷移');
  else fail('In-App: フルページOAuthへ遷移', dest);
  if (dest.includes('response_type=token')) ok('In-App: implicit token');
  else fail('In-App: implicit token', dest);
  if (dest.includes('redirect_uri=')) ok('In-App: redirect_uri 付き');
  else fail('In-App: redirect_uri 付き', dest);
  if (!errors.length) ok('In-App: Console pageerror なし');
  else fail('In-App: Console pageerror なし', errors.join('; '));
  await browser.close();
}

async function testOauthHashLogin() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockAuth(page);
  await page.addInitScript(() => {
    try { sessionStorage.setItem('utaeru_oauth_state', 'utalis_teststate'); } catch (_) { /* ignore */ }
    try { localStorage.removeItem('utalis_start_choice_v1'); } catch (_) { /* ignore */ }
  });
  await page.goto(indexUrl + '#access_token=ya29.mock&token_type=Bearer&state=utalis_teststate', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  const state = await page.evaluate(() => ({
    email: authUser?.email || null,
    hash: location.hash,
    startActive: document.body.classList.contains('start-screen-active'),
    wrapHidden: document.body.classList.contains('start-screen-active'),
    startHidden: document.getElementById('startScreen')?.hidden,
  }));
  if (state.email === 'oauth-test@example.com') ok('OAuth hash: ログイン完了');
  else fail('OAuth hash: ログイン完了', JSON.stringify(state));
  if (!state.hash) ok('OAuth hash: replaceState で hash 削除');
  else fail('OAuth hash: replaceState で hash 削除', state.hash);
  if (!state.startActive && state.startHidden) ok('OAuth hash: エディタ表示（ホワイトアウトしない）');
  else fail('OAuth hash: エディタ表示（ホワイトアウトしない）', JSON.stringify(state));
  if (!errors.length) ok('OAuth hash: pageerror なし');
  else fail('OAuth hash: pageerror なし', errors.join('; '));
  await browser.close();
}

async function testAccountPanelLoginDirect() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.click('#accountMenuBtn');
  await page.waitForFunction(() => document.getElementById('accountPanel')?.classList.contains('open'), { timeout: 5000 });
  const btnCount = await page.evaluate(() => [...document.querySelectorAll('#accountPanel button')]
    .filter((el) => /Googleでログイン|Googleで管理する/.test(el.textContent || '')).length);
  await page.click('#accountGoogleLoginBtn');
  const after = await page.evaluate(() => ({
    authLoading,
    message: document.getElementById('authMessage')?.textContent?.trim() || '',
  }));
  if (btnCount === 1 && (after.authLoading || /ログイン/.test(after.message))) {
    ok('アカウントパネル: 1つのGoogleでログインから直接認証');
  } else {
    fail('アカウントパネル: 1つのGoogleでログインから直接認証', JSON.stringify({ btnCount, after }));
  }
  await browser.close();
}

async function main() {
  console.log('=== test-auth-login-fixes.mjs ===\n');
  await testInAppBrowserDetection();
  await testInAppLoginUsesRedirect();
  await testOauthHashLogin();
  await testAccountPanelLoginDirect();
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
