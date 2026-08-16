#!/usr/bin/env node
/**
 * Phase 5: 編集キー認証 → PUT更新 → 公開反映 の API フロー検証
 * 編集キー平文はログ出力しない。
 */

const API = 'https://utaeru-api.manabit.workers.dev';
const ORIGIN = 'https://study-navi.github.io';

let passed = 0;
let failed = 0;

function ok(name) { passed++; console.log(`OK: ${name}`); }
function fail(name, detail) { failed++; console.error(`FAIL: ${name} — ${detail}`); }

async function request(method, urlPath, { body, editKey } = {}) {
  const headers = { Origin: ORIGIN };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (editKey) headers['X-Utaeru-Edit-Key'] = editKey;
  const res = await fetch(API + urlPath, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  return { status: res.status, data, headers: res.headers };
}

function payload(streamerId, name) {
  return {
    streamerName: name,
    subtitle: 'edit flow test',
    configVersion: 2,
    themeType: 'preset',
    presetIndex: 0,
    customHex: null,
    streamerId,
    songs: [
      { k: 'あ', y: 'てすと', a: 'Test', t: 'Song A' },
      { k: 'い', y: 'てすと', a: 'Test', t: 'Song B' },
    ],
    songMeta: {},
    tagPresets: [],
    updatedAt: new Date().toISOString(),
  };
}

async function run() {
  const testId = 'p5e-' + Date.now().toString(36);
  console.log(`streamerId: ${testId}\n`);

  let r = await request('POST', `/api/streamer/${testId}/create-anonymous`, {
    body: payload(testId, 'Before Edit'),
  });
  if (r.status !== 201 || !r.data?.editKey) {
    fail('匿名作成', `status ${r.status}`);
    return finish();
  }
  ok('匿名作成 → 201');
  const editKey = r.data.editKey;

  r = await request('POST', `/api/streamer/${testId}/verify-edit-key`, {
    body: { editKey },
  });
  if (r.status === 200 && r.data?.ok) ok('verify-edit-key → 200');
  else fail('verify-edit-key', `status ${r.status}`);

  const updated = payload(testId, 'After Edit');
  updated.songs.push({ k: 'う', y: 'てすと', a: 'Test', t: 'Song C' });

  r = await request('PUT', `/api/public/${testId}`, { body: updated, editKey });
  if (r.status === 200 && r.data?.streamerName === 'After Edit' && r.data.songs.length === 3) {
    ok('PUT + X-Utaeru-Edit-Key → 200（3曲）');
  } else {
    fail('PUT + X-Utaeru-Edit-Key', `status ${r.status}, songs=${r.data?.songs?.length}`);
  }

  r = await request('GET', `/api/public/${testId}`);
  if (r.status === 200 && r.data?.streamerName === 'After Edit' && r.data.songs.length === 3) {
    ok('GET 公開データに変更反映');
  } else {
    fail('GET 公開データ反映', `status ${r.status}`);
  }

  r = await request('PUT', `/api/public/${testId}`, {
    body: updated,
    editKey: 'ut_' + '0'.repeat(64),
  });
  if (r.status === 401) ok('間違ったキー PUT → 401');
  else fail('間違ったキー PUT', `status ${r.status}`);

  finish();
}

function finish() {
  console.log('');
  if (failed) { console.error(`${failed} 件失敗 / ${passed} 件成功`); process.exit(1); }
  console.log(`すべて成功（${passed} 件）`);
}

run().catch(err => { console.error(err); process.exit(1); });
