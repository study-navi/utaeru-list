#!/usr/bin/env node
/**
 * Production claim-flow probe with mocked /api/auth/me to enable claim button.
 */
import { chromium } from 'playwright-core';

const PAGE = 'https://study-navi.github.io/utaeru-list/index.html';
const API = 'https://utaeru-api.manabit.workers.dev';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const apiLog = [];

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'https://study-navi.github.io',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        email: 'probe-mock@example.com',
        ownedStreamerIds: [],
      }),
    });
  });

  page.on('request', (req) => {
    const url = req.url();
    if (!url.includes('/api/')) return;
    apiLog.push({
      phase: 'request',
      method: req.method(),
      url,
      cookie: req.headers()['cookie'] || null,
    });
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    apiLog.push({
      phase: 'response',
      status: res.status(),
      url,
      body: body.slice(0, 300),
    });
  });

  await page.goto(PAGE, { waitUntil: 'networkidle', timeout: 90000 });
  await page.fill('#streamerIdInput', 'hiro');
  await page.dispatchEvent('#streamerIdInput', 'input');
  await page.waitForTimeout(500);

  const uiBefore = {
    signedInVisible: await page.isVisible('#authSignedIn'),
    authUserEmail: (await page.textContent('#authUserEmail'))?.trim(),
    claimDisabled: await page.isDisabled('#claimBtn'),
    claimStatus: (await page.textContent('#claimStatus'))?.trim(),
    authMessage: (await page.textContent('#authMessage'))?.trim(),
  };

  await page.click('#claimBtn');
  await page.waitForTimeout(2000);

  const uiAfter = {
    authMessage: (await page.textContent('#authMessage'))?.trim(),
    authMessageDisplay: await page.evaluate(() => document.getElementById('authMessage').style.display),
    claimStatus: (await page.textContent('#claimStatus'))?.trim(),
  };

  const claimLog = apiLog.filter((e) => e.url && e.url.includes('/claim'));
  const meLog = apiLog.filter((e) => e.url && e.url.includes('/auth/me'));

  console.log('=== Mocked auth/me UI state ===');
  console.log(JSON.stringify(uiBefore, null, 2));
  console.log('\n=== After claim click ===');
  console.log(JSON.stringify(uiAfter, null, 2));
  console.log('\n=== /api/auth/me traffic ===');
  for (const e of meLog) console.log(JSON.stringify(e));
  console.log('\n=== /claim traffic ===');
  for (const e of claimLog) console.log(JSON.stringify(e));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
