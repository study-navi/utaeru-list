#!/usr/bin/env node
/**
 * Phase 4D: 公開閲覧ページ（/u/{streamerId}）の回帰テスト
 *
 * 使い方:
 *   node scripts/test-phase4d-public-viewer.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const API = 'https://utaeru-api.manabit.workers.dev';
const ORIGIN = 'https://study-navi.github.io';
const PAGES_BASE = 'https://study-navi.github.io/utaeru-list';
const LISTENER_URL = `${PAGES_BASE}/u/hiro`;

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`OK: ${name}`);
}

function fail(name, detail) {
  failed += 1;
  console.error(`FAIL: ${name} — ${detail}`);
}

async function request(method, url, { headers = {} } = {}) {
  const res = await fetch(url, { method, headers });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { status: res.status, headers: res.headers, data, text };
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

async function run() {
  console.log(`API: ${API}`);
  console.log(`Pages: ${PAGES_BASE}\n`);

  let r = await request('GET', `${API}/api/public/hiro`, {
    headers: { Origin: ORIGIN },
  });
  if (r.status === 200 && r.data && Array.isArray(r.data.songs) && r.data.songs.length === 13) {
    ok('GET /api/public/hiro → 200, 13曲');
  } else {
    fail('GET /api/public/hiro', `status ${r.status}, songs=${r.data?.songs?.length}`);
  }

  const aco = r.headers.get('access-control-allow-origin');
  if (aco === ORIGIN) ok('GET /api/public/hiro CORS Origin 許可');
  else fail('GET /api/public/hiro CORS', `allow-origin=${aco}`);

  const html404 = read('404.html');
  for (const needle of [
    'parseStreamerIdFromPath',
    '/api/public/',
    'initPublicViewer',
    'resolveSiteBase',
    '/u/',
    'data-utalis-viewer="light"',
    'page-kind',
    'search-shell',
    'artist-accordion',
  ]) {
    if (html404.includes(needle)) ok(`404.html に ${needle} を含む`);
    else fail(`404.html に ${needle}`, 'not found');
  }
  if (!html404.includes('themeToggle') && !html404.includes('theme-toggle')) {
    ok('404.html にテーマ切替UIなし');
  } else {
    fail('404.html テーマ切替', 'theme toggle still present');
  }
  if (html404.includes('--page: #f5f8fc')) ok('404.html ライト配色 #f5f8fc');
  else fail('404.html ライト配色', 'page color missing');

  if (fs.existsSync(path.join(ROOT, '.nojekyll'))) ok('.nojekyll が存在');
  else fail('.nojekyll', 'missing');

  r = await request('GET', LISTENER_URL);
  if (r.status === 404 && r.text.includes('initPublicViewer')) {
    ok('GitHub Pages /u/hiro → 404.html を配信（SPAルーティング）');
  } else if (r.status === 200 && r.text.includes('initPublicViewer')) {
    ok('GitHub Pages /u/hiro → 200（直接配信）');
  } else {
    fail('GitHub Pages /u/hiro', `status ${r.status}, body length ${r.text?.length || 0}`);
  }

  console.log('');
  if (failed) {
    console.error(`${failed} 件失敗 / ${passed} 件成功`);
    process.exit(1);
  }
  console.log(`すべて成功（${passed} 件）`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
