#!/usr/bin/env node
/**
 * Unauthenticated GitHub Pages probe — real API, no mocks.
 */
import { chromium } from 'playwright-core';

const PAGE = 'https://study-navi.github.io/utaeru-list/index.html';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const apiLog = [];

  page.on('request', (req) => {
    const url = req.url();
    if (!url.includes('/api/')) return;
    apiLog.push({ method: req.method(), url, cookie: req.headers()['cookie'] || null });
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    apiLog.push({ status: res.status(), url, body: body.slice(0, 200) });
  });

  await page.goto(PAGE, { waitUntil: 'networkidle', timeout: 90000 });
  await page.fill('#streamerIdInput', 'hiro');
  await page.dispatchEvent('#streamerIdInput', 'input');

  const ui = {
    signedOutVisible: await page.isVisible('#authSignedOut'),
    signedInVisible: await page.isVisible('#authSignedIn'),
    authUserEmail: (await page.textContent('#authUserEmail'))?.trim(),
    googleBtnText: (await page.textContent('#googleSignInBtn'))?.trim().slice(0, 120),
    claimDisabled: await page.isDisabled('#claimBtn'),
    claimStatus: (await page.textContent('#claimStatus'))?.trim(),
  };

  let clickFired = false;
  await page.exposeFunction('markClick', () => { clickFired = true; });
  await page.evaluate(() => {
    document.getElementById('claimBtn').addEventListener('click', () => window.markClick());
  });

  // force click even if disabled — simulates frustrated user clicking greyed button
  await page.click('#claimBtn', { force: true });
  await page.waitForTimeout(500);

  const claimReqs = apiLog.filter((e) => e.url && e.url.includes('/claim'));

  console.log('=== UI (no Google login, real API) ===');
  console.log(JSON.stringify(ui, null, 2));
  console.log('\n=== Force-click disabled claimBtn ===');
  console.log('native click event fired:', clickFired);
  console.log('POST /claim requests:', claimReqs.length);
  console.log('\n=== API log ===');
  for (const e of apiLog) console.log(JSON.stringify(e));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
