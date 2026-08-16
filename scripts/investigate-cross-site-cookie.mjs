#!/usr/bin/env node
import { chromium } from 'playwright-core';

const API = 'https://utaeru-api.manabit.workers.dev';
const PAGE = 'https://study-navi.github.io/utaeru-list/index.html';

async function probe(sameSite) {
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
  let cookieHeader = null;
  page.on('request', (req) => {
    if (req.url().includes('/api/auth/me')) cookieHeader = req.headers()['cookie'] || null;
  });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (apiBase) => {
    await fetch(apiBase + '/api/auth/me', { credentials: 'include' });
  }, API);
  await browser.close();
  return cookieHeader;
}

for (const sameSite of ['Lax', 'None']) {
  const cookieHeader = await probe(sameSite);
  console.log(`SameSite=${sameSite}: Cookie header on cross-site /api/auth/me = ${cookieHeader ? JSON.stringify(cookieHeader) : '(not sent)'}`);
}
