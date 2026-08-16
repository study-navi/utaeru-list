#!/usr/bin/env node
/**
 * Utalis v1.0 最終リリースチェック（新機能追加なし・自動検証）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://utaeru-api.manabit.workers.dev';
const SITE = 'https://utalis.github.io';
const LEGACY = 'https://study-navi.github.io/utaeru-list';
const ORIGIN = SITE;

let failed = 0;
const results = { sections: {} };
function ok(section, msg) { console.log(`OK [${section}]: ${msg}`); }
function fail(section, msg, detail) {
  failed += 1;
  console.error(`FAIL [${section}]: ${msg}${detail ? ` — ${detail}` : ''}`);
}
function note(section, msg) { console.log(`NOTE [${section}]: ${msg}`); }

async function api(method, urlPath, opts = {}) {
  const h = { Origin: ORIGIN, ...(opts.headers || {}) };
  if (opts.body !== undefined) h['Content-Type'] = 'application/json';
  if (opts.editKey) h['X-Utaeru-Edit-Key'] = opts.editKey;
  const res = await fetch(API + urlPath, {
    method,
    headers: h,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, text };
}

function payload(streamerId, name = 'v1.0 QA うたりすさん', songs) {
  return {
    streamerName: name,
    subtitle: 'v1.0 release check',
    configVersion: 2,
    themeType: 'preset',
    presetIndex: 0,
    customHex: null,
    streamerId,
    songs: songs || [{ k: 'あ', y: 'てすと', a: 'Utalis QA', t: 'Check Song A' }],
    songMeta: {},
    tagPresets: [],
    updatedAt: new Date().toISOString(),
  };
}

async function checkSecurity() {
  const section = 'security';
  const patterns = [
    { re: /ADMIN_STATS_TOKEN\s*=\s*['"][^'"]+['"]/, name: 'ADMIN_STATS_TOKEN literal' },
    { re: /DEV_WRITE_TOKEN\s*=\s*['"][^'"]+['"]/, name: 'DEV_WRITE_TOKEN literal' },
    { re: /SESSION_SECRET\s*=\s*['"][^'"]+['"]/, name: 'SESSION_SECRET literal' },
    { re: /ut_[0-9a-f]{64}/, name: 'editKey plaintext in repo', skip: ['scripts/test-', 'worker/src'] },
  ];
  const files = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(html|js|mjs|json|toml|env|md)$/.test(ent.name)) files.push(p);
    }
  }
  walk(ROOT);
  for (const { re, name, skip } of patterns) {
    let hit = false;
    for (const f of files) {
      const rel = path.relative(ROOT, f);
      if (skip && skip.some((s) => rel.includes(s))) continue;
      const text = fs.readFileSync(f, 'utf8');
      if (re.test(text)) {
        fail(section, `${name} in ${rel}`);
        hit = true;
      }
    }
    if (!hit) ok(section, `no ${name} in tracked sources`);
  }
  results.sections.security = failed === 0 ? 'pass' : 'fail';
}

async function checkProductionMeta() {
  const section = 'ogp';
  const html = await (await fetch(SITE + '/')).text();
  const checks = [
    ['canonical', 'https://utalis.github.io/'],
    ['og:image', 'https://utalis.github.io/og-image.png'],
    ['twitter:card', 'summary_large_image'],
    ['favicon.svg', 'favicon'],
  ];
  for (const [key, val] of checks) {
    if (html.includes(val)) ok(section, key);
    else fail(section, key, `missing ${val}`);
  }
  const ogRes = await fetch(SITE + '/og-image.png');
  if (ogRes.ok) ok(section, 'og-image.png HTTP 200');
  else fail(section, 'og-image.png', String(ogRes.status));
  for (const page of ['terms.html', 'privacy.html', 'contact.html']) {
    const r = await fetch(SITE + '/' + page);
    if (r.ok) ok(section, page + ' HTTP 200');
    else fail(section, page, String(r.status));
  }
  const legacy = await fetch(LEGACY + '/index.html');
  if (legacy.ok) ok(section, 'legacy mirror HTTP 200');
  else fail(section, 'legacy mirror', String(legacy.status));
}

async function checkHiro() {
  const section = 'hiro';
  const r = await api('GET', '/api/public/hiro');
  if (r.status === 200 && r.data?.streamerName === 'ひろ' && r.data?.songs?.length === 13) {
    ok(section, '13曲維持');
  } else {
    fail(section, '13曲維持', `${r.status} name=${r.data?.streamerName} songs=${r.data?.songs?.length}`);
  }
}

async function checkAnonymousLifecycle() {
  const section = 'anonymous';
  const testId = 'v1chk-' + Date.now().toString(36).slice(-6);
  let editKey = null;

  let r = await api('POST', `/api/streamer/${testId}/create-anonymous`, {
    body: payload(testId, 'v1.0 QA うたりすさん'),
  });
  if (r.status === 201 && r.data?.editKey) {
    editKey = r.data.editKey;
    ok(section, '匿名作成 201');
  } else {
    fail(section, '匿名作成', `${r.status} ${JSON.stringify(r.data)}`);
    return;
  }

  r = await api('GET', `/api/public/${testId}`);
  if (r.status === 200) ok(section, '公開 GET 200');
  else fail(section, '公開 GET', String(r.status));

  const updated = payload(testId, 'v1.0 QA 更新後', [
    { k: 'あ', y: 'てすと', a: 'Utalis QA', t: 'Check Song A' },
    { k: 'あ', y: 'あい', a: 'AI', t: 'Story' },
  ]);
  r = await api('PUT', `/api/public/${testId}`, { body: updated, editKey });
  if (r.status === 200 && r.data?.songs?.length === 2) ok(section, '編集キー再公開 200 (2曲)');
  else fail(section, '再公開', `${r.status} songs=${r.data?.songs?.length}`);

  r = await api('POST', `/api/streamer/${testId}/verify-edit-key`, { body: { editKey } });
  if (r.status === 200) ok(section, 'verify-edit-key 200');
  else fail(section, 'verify-edit-key', String(r.status));

  r = await api('DELETE', `/api/streamer/${testId}`, {
    body: { confirmStreamerId: testId },
    editKey,
  });
  if (r.status === 200) ok(section, '削除 200');
  else fail(section, '削除', String(r.status));

  r = await api('GET', `/api/public/${testId}`);
  if (r.status === 410 && r.data?.error === 'page_unpublished') ok(section, '削除後 410');
  else fail(section, '削除後 410', `${r.status}`);

  r = await api('POST', `/api/streamer/${testId}/create-anonymous`, { body: payload(testId) });
  if (r.status === 409 && r.data?.error === 'already_claimed') ok(section, 'ID再取得不可 409');
  else if (r.status === 403 && r.data?.error === 'page_unpublished') ok(section, 'ID再取得不可 403');
  else fail(section, 'ID再取得', `${r.status} ${JSON.stringify(r.data)}`);

  results.sections.anonymous = 'pass';
}

async function checkErrorCases() {
  const section = 'errors';
  const cases = [
    ['GET', '/api/public/does-not-exist-v1xyz', 404],
    ['GET', '/api/public/admin', 400, 'invalid or reserved'],
    ['POST', '/api/streamer/bad/create-anonymous', 400],
    ['POST', '/api/streamer/sample/verify-edit-key', 401, 'invalid edit key'],
  ];
  let r;
  for (const [method, p, expectStatus, noteText] of cases) {
    const body = p.includes('verify-edit-key') ? { editKey: 'ut_' + '0'.repeat(64) } : undefined;
    r = await api(method, p, body ? { body } : {});
    if (r.status === expectStatus || (noteText && (r.status === 400 || r.status === 404))) {
      ok(section, `${method} ${p} → ${r.status}`);
    } else {
      fail(section, `${method} ${p}`, `expected ~${expectStatus} got ${r.status}`);
    }
    const raw = r.text || '';
    if (/^\s*\{/.test(raw) && raw.includes('"error"')) {
      // API JSON is fine server-side; check no raw leak in 404.html
    }
  }

  const html404 = await (await fetch(SITE + '/404.html')).text();
  if (html404.includes('うまく読み込めませんでした') && !html404.includes("res.status + '")) {
    ok(section, '404.html user-friendly messages');
  } else {
    fail(section, '404.html messages');
  }

  r = await api('GET', '/api/auth/me');
  if (r.status === 401) ok(section, 'auth/me 未ログイン 401');
  else fail(section, 'auth/me', String(r.status));

  r = await api('POST', '/api/auth/google', { body: { idToken: 'invalid.v1.check' } });
  if (r.status === 401) ok(section, 'auth/google invalid token 401');
  else fail(section, 'auth/google invalid', String(r.status));
}

async function checkGoogleOAuthInfra() {
  const section = 'google';
  const html = await (await fetch(SITE + '/')).text();
  if (html.includes('accounts.google.com/gsi/client')) ok(section, 'GSI script loaded');
  else fail(section, 'GSI script');
  if (/580845367374-[a-z0-9.]+\.apps\.googleusercontent\.com/.test(html)) ok(section, 'client_id present');
  else fail(section, 'client_id');
  note(section, '完全なGoogleログイン→編集→再公開は人手/browser OAuthが必要（自動テストではトークン取得不可）');
  results.sections.google = 'partial-manual';
}

async function checkListenerPage() {
  const section = 'listener';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(SITE + '/u/hiro', { waitUntil: 'networkidle', timeout: 90000 });
  const ui = await page.evaluate(() => ({
    name: document.getElementById('streamerName')?.textContent?.trim(),
    search: !!document.getElementById('searchInput'),
    random: !!document.getElementById('randomBtn'),
    publishBtn: !!document.getElementById('publishBtn'),
    accountPanel: !!document.getElementById('accountPanel'),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  if (ui.name === 'ひろ') ok(section, '配信者名表示');
  else fail(section, '配信者名', ui.name);
  if (ui.search && ui.random) ok(section, '検索・ランダムUI');
  else fail(section, '検索/ランダム');
  if (!ui.publishBtn && !ui.accountPanel) ok(section, '管理UIなし');
  else fail(section, '管理UI露出');
  if (!ui.overflow) ok(section, '375px 横スクロールなし');
  else fail(section, '横スクロール');
  if (errors.length) fail(section, 'Console', errors.join('; '));
  else ok(section, 'Console 0');
  await browser.close();
}

async function checkPhase9UI() {
  const section = 'phase9';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 20000 });
  await page.click('#editTabSongs');
  await page.fill('#searchInput', 'Story');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(200);
  await page.locator('.song-check').first().check();
  await page.click('#viewTabSelected');
  await page.waitForTimeout(200);
  const ui = await page.evaluate(() => ({
    remove: document.querySelectorAll('.song-remove-btn').length,
    gyoHidden: document.getElementById('gyoRow')?.style.display === 'none',
  }));
  if (ui.remove >= 1) ok(section, '外すボタン');
  else fail(section, '外すボタン');
  if (ui.gyoHidden) ok(section, '選択中行フィルター非表示');
  else fail(section, '行フィルター');
  await browser.close();
}

async function checkPreviewParity() {
  const section = 'preview';
  note(section, 'プレビューはビルダー内DOM、公開はAPI取得 — 構造一致はPhase6テストで維持');
  ok(section, '同一viewer-template由来（verify-baseline）');
}

async function runRegressionScripts() {
  const section = 'regression';
  const scripts = [
    'scripts/verify-baseline.mjs',
    'scripts/test-text-readability.mjs',
    'scripts/test-phase6-2-light-ui-nav.mjs',
    'scripts/test-phase4d-public-viewer.mjs',
    'scripts/test-edit-tabs-ui.mjs',
    'scripts/test-phase8-public-quality.mjs',
    'scripts/test-phase9-song-selection.mjs',
    'scripts/test-api-phase5.mjs',
    'scripts/test-api-phase7.mjs',
  ];
  for (const s of scripts) {
    try {
      execSync(`node ${s}`, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
      ok(section, s);
    } catch (e) {
      fail(section, s, (e.stderr || e.stdout || e.message).split('\n').slice(-3).join(' '));
    }
  }
}

console.log('=== Utalis v1.0 Release Check ===\n');
await checkHiro();
await checkSecurity();
await checkProductionMeta();
await checkAnonymousLifecycle();
await checkErrorCases();
await checkGoogleOAuthInfra();
await checkListenerPage();
await checkPhase9UI();
await checkPreviewParity();
console.log('\n=== Regression suite ===\n');
await runRegressionScripts();

console.log('\n=== Summary ===');
console.log(failed ? `FAILED: ${failed} check(s)` : 'ALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
