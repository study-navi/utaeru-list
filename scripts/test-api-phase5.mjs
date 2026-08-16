#!/usr/bin/env node
/**
 * Phase 5: 匿名編集キー方式のセキュリティ・回帰テスト
 *
 * 使い方:
 *   node scripts/test-api-phase5.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const API = 'https://utaeru-api.manabit.workers.dev';
const ORIGIN = 'https://study-navi.github.io';

let passed = 0;
let failed = 0;
let createdTestId = null;
let createdEditKey = null;

function ok(name) {
  passed += 1;
  console.log(`OK: ${name}`);
}

function fail(name, detail) {
  failed += 1;
  console.error(`FAIL: ${name} — ${detail}`);
}

async function request(method, urlPath, { headers = {}, body, editKey } = {}) {
  const h = { Origin: ORIGIN, ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (editKey) h['X-Utaeru-Edit-Key'] = editKey;
  const res = await fetch(API + urlPath, {
    method,
    headers: h,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { status: res.status, headers: res.headers, data, text };
}

function samplePayload(streamerId, label) {
  return {
    streamerName: label || 'Phase5 Test',
    subtitle: 'test',
    configVersion: 2,
    themeType: 'preset',
    presetIndex: 0,
    customHex: null,
    streamerId,
    songs: [{ k: 'あ', y: 'てすと', a: 'Test', t: 'Song' }],
    songMeta: {},
    tagPresets: [],
    updatedAt: new Date().toISOString(),
  };
}

async function run() {
  console.log(`API: ${API}\n`);

  const testId = 'p5-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  createdTestId = testId;
  const payload = samplePayload(testId);

  let r = await request('POST', `/api/streamer/${testId}/create-anonymous`, { body: payload });
  if (r.status === 201 && r.data && r.data.editKey && /^ut_[0-9a-f]{64}$/.test(r.data.editKey)) {
    ok('匿名初回作成 → 201 + editKey形式');
    createdEditKey = r.data.editKey;
  } else {
    fail('匿名初回作成', `status ${r.status} ${JSON.stringify(r.data)}`);
    return finish();
  }

  r = await request('PUT', `/api/public/${testId}`, { body: payload });
  if (r.status === 401) ok('編集キーなしPUT → 401');
  else fail('編集キーなしPUT', `status ${r.status}`);

  r = await request('PUT', `/api/public/${testId}`, {
    body: payload,
    editKey: 'ut_' + '0'.repeat(64),
  });
  if (r.status === 401) ok('間違った編集キーPUT → 401');
  else fail('間違った編集キーPUT', `status ${r.status}`);

  payload.streamerName = 'Phase5 Updated';
  r = await request('PUT', `/api/public/${testId}`, { body: payload, editKey: createdEditKey });
  if (r.status === 200 && r.data && r.data.streamerName === 'Phase5 Updated') ok('正しい編集キーPUT → 200');
  else fail('正しい編集キーPUT', `status ${r.status}`);

  r = await request('POST', `/api/streamer/${testId}/verify-edit-key`, {
    body: { editKey: createdEditKey },
  });
  if (r.status === 200 && r.data && r.data.ok) ok('verify-edit-key 成功');
  else fail('verify-edit-key 成功', `status ${r.status}`);

  r = await request('POST', `/api/streamer/${testId}/verify-edit-key`, {
    body: { editKey: 'ut_' + 'f'.repeat(64) },
  });
  if (r.status === 401) ok('verify-edit-key 失敗 → 401');
  else fail('verify-edit-key 失敗', `status ${r.status}`);

  r = await request('POST', `/api/streamer/hiro/create-anonymous`, { body: samplePayload('hiro', 'blocked') });
  if (r.status === 409) ok('Google所有 hiro へ匿名作成 → 409');
  else fail('Google所有 hiro へ匿名作成', `status ${r.status}`);

  r = await request('POST', '/api/streamer/hiro/claim', { body: {} });
  if (r.status === 401) ok('hiro claim 未ログイン → 401（既存維持）');
  else fail('hiro claim 未ログイン', `status ${r.status}`);

  r = await request('POST', `/api/streamer/${testId}/create-anonymous`, { body: payload });
  if (r.status === 409) ok('同一IDへの二重匿名作成 → 409');
  else fail('同一IDへの二重匿名作成', `status ${r.status}`);

  r = await request('GET', `/api/public/hiro`);
  if (r.status === 200 && Array.isArray(r.data.songs) && r.data.songs.length >= 1) {
    ok('GET /api/public/hiro 既存公開データ維持');
  } else {
    fail('GET /api/public/hiro', `status ${r.status}`);
  }

  r = await request('GET', `/api/public/hiro?editKey=${createdEditKey}`);
  if (!r.text.includes(createdEditKey)) ok('編集キーをURL queryに含めない（GET public）');
  else fail('編集キーがURL/レスポンスに露出', 'query test');

  r = await request('POST', `/api/streamer/${testId}/link-google`, {
    body: { editKey: createdEditKey },
  });
  if (r.status === 401) ok('link-google 未Googleログイン → 401');
  else fail('link-google 未Googleログイン', `status ${r.status}`);

  r = await request('GET', "/api/public/hiro'%20OR%201=1--");
  if (r.status === 400) ok('SQL injection風streamerId GET → 400');
  else fail('SQL injection風streamerId GET', `status ${r.status}`);

  const preflight = await fetch(API + '/api/public/hiro', {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'x-utaeru-edit-key, content-type',
    },
  });
  const ach = preflight.headers.get('access-control-allow-headers') || '';
  if (preflight.status === 204 && /x-utaeru-edit-key/i.test(ach)) {
    ok('CORS preflight が X-Utaeru-Edit-Key を許可');
  } else {
    fail('CORS preflight X-Utaeru-Edit-Key', `status ${preflight.status}, headers=${ach}`);
  }

  // ソースコードに平文 editKey が残っていないか（テスト実行中の変数は除く）
  const scanTargets = ['index.html', '404.html', 'worker/src/index.js', 'hiro.html'];
  for (const file of scanTargets) {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/ut_[0-9a-f]{64}/.test(content)) {
      fail(`${file} に editKey 実値パターン`, 'found ut_ + 64hex in source');
    } else {
      ok(`${file} に editKey 実値なし`);
    }
  }

  r = await request('GET', '/api/auth/me');
  if (r.status === 401) ok('既存 /api/auth/me 未認証 → 401');
  else fail('既存 /api/auth/me', `status ${r.status}`);

  console.log('');
  finish();
}

function finish() {
  if (createdTestId && createdEditKey) {
    console.log(`テスト用 streamerId: ${createdTestId}（本番D1に匿名ページが1件残る場合があります）`);
  }
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
