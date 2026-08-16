#!/usr/bin/env node
/**
 * Phase 4C-2/4C-3 API 回帰テスト（認証不要項目 + 環境変数 DEV_WRITE_TOKEN があれば書き込みテスト）
 *
 * 使い方:
 *   node scripts/test-api-phase4c.mjs
 *   DEV_WRITE_TOKEN=... node scripts/test-api-phase4c.mjs
 */

const API = 'https://utaeru-api.manabit.workers.dev';
const ORIGIN = 'https://study-navi.github.io';

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

async function request(method, path, { headers = {}, body, cookie } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (cookie) h.Cookie = cookie;
  const res = await fetch(API + path, {
    method,
    headers: h,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { status: res.status, headers: res.headers, data };
}

async function run() {
  console.log(`API: ${API}\n`);

  let r = await request('GET', '/api/auth/me');
  if (r.status === 401) ok('Cookieなし /api/auth/me → 401');
  else fail('/api/auth/me 未認証', `status ${r.status}`);

  r = await request('GET', '/api/auth/me', { cookie: 'utaeru_session=invalid.token.here' });
  if (r.status === 401) ok('壊れたCookie → 401');
  else fail('壊れたCookie', `status ${r.status}`);

  r = await request('GET', '/api/auth/me', { cookie: 'utaeru_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.tampered' });
  if (r.status === 401) ok('改ざんCookie → 401');
  else fail('改ざんCookie', `status ${r.status}`);

  r = await request('GET', '/api/auth/me', { headers: { Authorization: 'Bearer invalid.token.here' } });
  if (r.status === 401) ok('不正Bearer → 401');
  else fail('不正Bearer', `status ${r.status}`);

  r = await request('POST', '/api/auth/google', { body: { idToken: 'invalid.token.here' } });
  if (r.status === 401) ok('不正Google ID Token → 401');
  else fail('不正Google ID Token', `status ${r.status}`);

  r = await request('POST', '/api/auth/google', { body: { googleAccessToken: 'invalid.access.token' } });
  if (r.status === 401) ok('不正googleAccessToken → 401');
  else fail('不正googleAccessToken', `status ${r.status}`);

  r = await request('POST', '/api/streamer/test-id-xyz/claim', { body: {} });
  if (r.status === 401) ok('claim未ログイン（有効ID） → 401');
  else fail('claim未ログイン', `status ${r.status}`);

  r = await request('POST', '/api/streamer/INVALID!!/claim', { body: {} });
  if (r.status === 400) ok('不正streamerId claim → 400');
  else fail('不正streamerId claim', `status ${r.status}`);

  r = await request('PUT', '/api/public/hiro', { body: { streamerName: 'x', songs: [] } });
  if (r.status === 401) ok('未認証PUT → 401');
  else fail('未認証PUT', `status ${r.status}`);

  r = await request('PUT', '/api/public/hiro', {
    headers: { 'X-Utaeru-Dev-Token': 'wrong-token-value' },
    body: { streamerName: 'x', songs: [] },
  });
  if (r.status === 401) ok('不正DEV_WRITE_TOKEN → 401');
  else fail('不正DEV_WRITE_TOKEN', `status ${r.status}`);

  r = await request('GET', '/api/public/invalid!!');
  if (r.status === 400) ok('GET 不正streamerId → 400');
  else fail('GET 不正streamerId', `status ${r.status}`);

  r = await request('GET', '/api/public/nonexistent-test-id-xyz');
  if (r.status === 404) ok('GET 未登録 → 404');
  else fail('GET 未登録', `status ${r.status}`);

  r = await request('GET', "/api/public/hiro'%20OR%201=1--");
  if (r.status === 400) ok('SQL injection風streamerId → 400');
  else fail('SQL injection風streamerId', `status ${r.status}`);

  const preflight = await fetch(API + '/api/auth/me', {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  });
  const aco = preflight.headers.get('access-control-allow-origin');
  const acc = preflight.headers.get('access-control-allow-credentials');
  const ach = preflight.headers.get('access-control-allow-headers') || '';
  if (preflight.status === 204 && aco === ORIGIN && acc === 'true' && /authorization/i.test(ach)) {
    ok('CORS preflight（Origin + credentials + Authorization）');
  } else {
    fail('CORS preflight', `status ${preflight.status}, origin=${aco}, credentials=${acc}, headers=${ach}`);
  }

  r = await request('POST', '/api/auth/logout', { body: {} });
  const setCookie = r.headers.get('set-cookie') || '';
  if (r.status === 200 && /SameSite=None/i.test(setCookie) && !/SameSite=Lax/i.test(setCookie)) {
    ok('logout Set-Cookie が SameSite=None（cross-site セッション対応）');
  } else {
    fail('logout Set-Cookie SameSite', `status ${r.status}, set-cookie=${setCookie || '(none)'}`);
  }

  const devToken = process.env.DEV_WRITE_TOKEN;
  if (devToken) {
    const testId = 'utaeru-test-' + Date.now().toString(36);
    const payload = {
      streamerName: 'API Test',
      subtitle: 'test',
      configVersion: 2,
      themeType: 'preset',
      presetIndex: 0,
      customHex: null,
      streamerId: testId,
      songs: [{ k: 'あ', y: 'てすと', a: 'Test', t: 'Song' }],
      songMeta: {},
      tagPresets: [],
      updatedAt: new Date().toISOString(),
    };
    r = await request('PUT', '/api/public/' + testId, {
      headers: { 'X-Utaeru-Dev-Token': devToken },
      body: payload,
    });
    if (r.status === 200 || r.status === 201 || r.status === 204) {
      ok('DEV_WRITE_TOKEN PUT → 成功');
      const got = await request('GET', '/api/public/' + testId);
      if (got.status === 200 && got.data && got.data.streamerName === 'API Test') {
        ok('GET 公開データ回帰');
      } else {
        fail('GET 公開データ回帰', `status ${got.status}`);
      }
    } else {
      fail('DEV_WRITE_TOKEN PUT', `status ${r.status} ${JSON.stringify(r.data)}`);
    }
  } else {
    console.log('SKIP: DEV_WRITE_TOKEN 未設定のため書き込みテストはスキップ');
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
