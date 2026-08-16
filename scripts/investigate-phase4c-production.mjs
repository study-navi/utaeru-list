#!/usr/bin/env node
/**
 * Phase 4C 本番調査（GitHub Pages + Cloudflare Worker）
 * Google ログインなしで観測できる項目を自動収集する。
 */
import { chromium } from 'playwright-core';

const API = 'https://utaeru-api.manabit.workers.dev';
const PAGE = 'https://study-navi.github.io/utaeru-list/index.html';
const ORIGIN = 'https://study-navi.github.io';

async function fetchLogoutCookieAttrs() {
  const res = await fetch(`${API}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const setCookie = res.headers.get('set-cookie') || '';
  return { status: res.status, setCookie };
}

async function probeCrossSiteCookie(sameSite) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([{
    name: 'utaeru_session',
    value: 'probe.invalid.token',
    domain: 'utaeru-api.manabit.workers.dev',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite,
  }]);
  const page = await context.newPage();
  let meReq = null;
  page.on('request', (req) => {
    if (req.url().includes('/api/auth/me')) {
      meReq = {
        url: req.url(),
        cookie: req.headers()['cookie'] || null,
        credentials: 'include (page evaluate)',
      };
    }
  });
  await page.goto(PAGE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(async (apiBase) => {
    await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' });
  }, API);
  await browser.close();
  return meReq;
}

async function probePageClaimFlow() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  const network = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/')) {
      network.push({
        method: req.method(),
        url,
        cookie: req.headers()['cookie'] || null,
      });
    }
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    network.push({
      kind: 'response',
      status: res.status(),
      url,
      body: body.slice(0, 200),
    });
  });

  await page.goto(PAGE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('#streamerIdInput', 'hiro');
  await page.dispatchEvent('#streamerIdInput', 'input');

  const claimDisabledBeforeLogin = await page.isDisabled('#claimBtn');
  const claimStatusBeforeLogin = await page.textContent('#claimStatus');

  let claimClickFired = false;
  await page.exposeFunction('markClaimClick', () => { claimClickFired = true; });
  await page.evaluate(() => {
    const btn = document.getElementById('claimBtn');
    btn.addEventListener('click', () => window.markClaimClick());
  });

  await page.click('#claimBtn', { force: true });
  await page.waitForTimeout(500);

  const claimRequests = network.filter((n) => n.url && n.url.includes('/claim'));

  await browser.close();
  return {
    claimDisabledBeforeLogin,
    claimStatusBeforeLogin: (claimStatusBeforeLogin || '').trim(),
    claimClickFired,
    claimRequests,
    authMeOnLoad: network.filter((n) => n.url && n.url.includes('/api/auth/me')),
    consoleErrors,
  };
}

async function main() {
  console.log('=== Phase 4C production investigation ===\n');

  const logout = await fetchLogoutCookieAttrs();
  console.log('POST /api/auth/logout');
  console.log(`  HTTP ${logout.status}`);
  console.log(`  Set-Cookie: ${logout.setCookie}`);
  console.log(`  SameSite=None: ${/SameSite=None/i.test(logout.setCookie)}`);
  console.log(`  SameSite=Lax: ${/SameSite=Lax/i.test(logout.setCookie)}`);
  console.log('');

  for (const sameSite of ['Lax', 'None']) {
    const meReq = await probeCrossSiteCookie(sameSite);
    console.log(`Cross-site fetch from GitHub Pages with manual SameSite=${sameSite} cookie`);
    console.log(`  /api/auth/me Cookie header: ${meReq?.cookie ? meReq.cookie : '(not sent)'}`);
  }
  console.log('');

  const pageFlow = await probePageClaimFlow();
  console.log('GitHub Pages claim button (未ログイン)');
  console.log(`  claimBtn.disabled: ${pageFlow.claimDisabledBeforeLogin}`);
  console.log(`  claimStatus: ${pageFlow.claimStatusBeforeLogin}`);
  console.log(`  click event fired: ${pageFlow.claimClickFired}`);
  console.log(`  POST /claim requests: ${pageFlow.claimRequests.length}`);
  if (pageFlow.authMeOnLoad.length) {
    const first = pageFlow.authMeOnLoad.find((n) => n.method === 'GET') || pageFlow.authMeOnLoad[0];
    console.log(`  initial /api/auth/me cookie sent: ${first.cookie ? 'yes' : 'no'}`);
  }
  if (pageFlow.consoleErrors.length) {
    console.log(`  console errors: ${pageFlow.consoleErrors.join(' | ')}`);
  } else {
    console.log('  console errors: (none)');
  }
  console.log('');

  const preflight = await fetch(`${API}/api/auth/me`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'GET',
    },
  });
  console.log('CORS preflight /api/auth/me');
  console.log(`  HTTP ${preflight.status}`);
  console.log(`  Access-Control-Allow-Origin: ${preflight.headers.get('access-control-allow-origin')}`);
  console.log(`  Access-Control-Allow-Credentials: ${preflight.headers.get('access-control-allow-credentials')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
