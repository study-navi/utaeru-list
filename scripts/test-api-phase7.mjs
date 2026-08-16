#!/usr/bin/env node
/**
 * Phase 7: soft delete, reserved IDs, admin stats, rate-limit smoke
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://utaeru-api.manabit.workers.dev';
const ORIGIN = 'https://utalis.github.io';
const ADMIN_TOKEN = process.env.UTALIS_ADMIN_STATS_TOKEN || '';

let passed = 0;
let failed = 0;
let testId = null;
let testEditKey = null;

function ok(name) { passed += 1; console.log(`OK: ${name}`); }
function fail(name, detail) { failed += 1; console.error(`FAIL: ${name} — ${detail}`); }

async function request(method, urlPath, { headers = {}, body, editKey, adminToken } = {}) {
  const h = { Origin: ORIGIN, ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (editKey) h['X-Utaeru-Edit-Key'] = editKey;
  if (adminToken) h['X-Utaeru-Admin-Token'] = adminToken;
  const res = await fetch(API + urlPath, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { status: res.status, data, text };
}

function samplePayload(streamerId, label) {
  return {
    streamerName: label || 'Phase7 Test',
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

  let r = await request('GET', '/api/public/hiro');
  if (r.status === 200 && r.data && r.data.streamerName) {
    ok(`hiro 既存データ GET 200 (${r.data.streamerName})`);
  } else {
    fail('hiro 既存データ', `status ${r.status}`);
  }

  r = await request('POST', '/api/streamer/admin/create-anonymous', { body: samplePayload('admin', 'x') });
  if (r.status === 400 && r.data?.error === 'reserved_streamer_id') {
    ok('予約ID admin → reserved_streamer_id');
  } else {
    fail('予約ID admin', `status ${r.status} ${JSON.stringify(r.data)}`);
  }

  testId = 'p7-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  r = await request('POST', `/api/streamer/${testId}/create-anonymous`, { body: samplePayload(testId) });
  if (r.status === 201 && r.data?.editKey) {
    ok('匿名作成 → 201');
    testEditKey = r.data.editKey;
  } else {
    fail('匿名作成', `status ${r.status} ${JSON.stringify(r.data)}`);
    console.error('\n以降の削除テストをスキップします');
    process.exit(failed ? 1 : 0);
  }

  r = await request('GET', `/api/public/${testId}`);
  if (r.status === 200) ok('削除前 GET → 200');
  else fail('削除前 GET', `status ${r.status}`);

  r = await request('DELETE', `/api/streamer/${testId}`, {
    body: { confirmStreamerId: 'wrong-id' },
    editKey: testEditKey,
  });
  if (r.status === 400 && r.data?.error === 'confirm_mismatch') ok('confirm不一致 → 400');
  else fail('confirm不一致', `status ${r.status}`);

  r = await request('DELETE', `/api/streamer/${testId}`, {
    body: { confirmStreamerId: testId },
    editKey: 'ut_' + '0'.repeat(64),
  });
  if (r.status === 401) ok('誤editKey削除 → 401');
  else fail('誤editKey削除', `status ${r.status}`);

  r = await request('DELETE', `/api/streamer/${testId}`, {
    body: { confirmStreamerId: testId },
  });
  if (r.status === 401) ok('認証なし削除 → 401');
  else fail('認証なし削除', `status ${r.status}`);

  r = await request('DELETE', `/api/streamer/${testId}`, {
    body: { confirmStreamerId: testId },
    editKey: testEditKey,
  });
  if (r.status === 200 && r.data?.ok) ok('正しいeditKey削除 → 200');
  else fail('正しいeditKey削除', `status ${r.status} ${JSON.stringify(r.data)}`);

  r = await request('GET', `/api/public/${testId}`);
  if (r.status === 410 && r.data?.error === 'page_unpublished') ok('削除後 GET → 410 page_unpublished');
  else fail('削除後 GET', `status ${r.status}`);

  r = await request('POST', `/api/streamer/${testId}/create-anonymous`, { body: samplePayload(testId) });
  if (r.status === 409) ok('削除済みID再取得 → 409');
  else fail('削除済みID再取得', `status ${r.status}`);

  r = await request('POST', `/api/streamer/${testId}/verify-edit-key`, {
    body: { editKey: testEditKey },
  });
  if (r.status === 401) ok('削除後 editKey verify → 401');
  else fail('削除後 editKey verify', `status ${r.status}`);

  r = await request('GET', '/api/admin/stats');
  if (r.status === 401) ok('admin stats 未認証 → 401');
  else fail('admin stats 未認証', `status ${r.status}`);

  if (ADMIN_TOKEN) {
    r = await request('GET', '/api/admin/stats', { adminToken: ADMIN_TOKEN });
    if (r.status === 200 && typeof r.data?.publicPages === 'number') {
      ok(`admin stats 認証 → 200 (publicPages=${r.data.publicPages})`);
    } else {
      fail('admin stats 認証', `status ${r.status} ${JSON.stringify(r.data)}`);
    }
    r = await request('GET', '/api/admin/stats', { adminToken: 'invalid-token' });
    if (r.status === 401) ok('admin stats 誤token → 401');
    else fail('admin stats 誤token', `status ${r.status}`);
  } else {
    console.log('SKIP: admin stats 認証（UTALIS_ADMIN_STATS_TOKEN 未設定）');
  }

  r = await request('GET', '/api/public/hiro');
  if (r.status === 200) ok('hiro 最終確認 GET 200');
  else fail('hiro 最終確認', `status ${r.status}`);

  console.log('');
  if (failed) {
    console.error(`${failed} 件失敗 / ${passed} 件成功`);
    process.exit(1);
  }
  console.log(`すべて成功（${passed} 件）`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
