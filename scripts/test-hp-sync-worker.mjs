#!/usr/bin/env node
/**
 * HP sync (「HPに反映する」) — Worker 側の回帰・セキュリティテスト
 *
 * 本番には一切つながない。worker/src/index.js をそのまま読み込み、
 * D1 の代わりに node:sqlite(本物の SQLite)を使った D1 互換シムで動かす。
 *
 *   node scripts/test-hp-sync-worker.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function ok(name) { passed += 1; console.log(`OK: ${name}`); }
function fail(name, detail) { failed += 1; console.error(`FAIL: ${name} — ${detail}`); }
function check(name, cond, detail = '') { if (cond) ok(name); else fail(name, detail || 'assertion failed'); }
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name); else fail(name, `expected ${e}, got ${a}`);
}

// ---------------------------------------------------------------------------
// Worker を読み込む(package.json が commonjs なので、一時 .mjs にして import する)
// ---------------------------------------------------------------------------
const tmpFile = path.join(os.tmpdir(), `utaemo-worker-${process.pid}.mjs`);
fs.copyFileSync(process.env.WORKER_SRC || path.join(ROOT, 'worker/src/index.js'), tmpFile);
const worker = (await import(pathToFileURL(tmpFile).href)).default;
process.on('exit', () => { try { fs.unlinkSync(tmpFile); } catch { /* ignore */ } });

// ---------------------------------------------------------------------------
// D1 互換シム
// ---------------------------------------------------------------------------
const PROD_SCHEMA = `
CREATE TABLE streamers (streamer_id TEXT PRIMARY KEY, public_data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE users (user_id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE, email TEXT, display_name TEXT, created_at TEXT NOT NULL, last_login_at TEXT NOT NULL);
CREATE TABLE streamer_owners (streamer_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(user_id), created_at TEXT NOT NULL);
CREATE TABLE streamer_edit_keys (streamer_id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
`;
const MIGRATION = fs.readFileSync(path.join(ROOT, 'worker/migrations/003_hp_sync.sql'), 'utf8');

function makeD1({ withMigration = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(PROD_SCHEMA);
  if (withMigration) db.exec(MIGRATION);
  const failOn = { pattern: null };
  const hook = { beforeRun: null }; // 書き込み直前に「別のリクエストが先に書いた」状況を差し込む
  const stmt = (sql) => {
    const s = {
      args: [],
      bind(...a) { s.args = a; return s; },
      async first() { return db.prepare(sql).get(...s.args) ?? null; },
      async all() { return { success: true, results: db.prepare(sql).all(...s.args), meta: {} }; },
      async run() {
        if (failOn.pattern && sql.includes(failOn.pattern)) throw new Error('simulated D1 failure');
        if (hook.beforeRun) hook.beforeRun(sql);
        const r = db.prepare(sql).run(...s.args);
        return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      },
    };
    return s;
  };
  return {
    prepare: stmt,
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of list) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    raw: db,
    failOn,
    hook,
  };
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------
const API = 'https://api.test';
const SESSION_SECRET = 'test-session-secret-0123456789';
const ADMIN = 'hp-admin-token-0123456789abcdef';
const HP_ORIGIN = 'https://ante-stage.github.io';
const UTAEMO_ORIGIN = 'https://utalis.github.io';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
function signToken(sub) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub, iat: now, exp: now + 3600 }));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function makeEnv(db, extra = {}) {
  return {
    DB: db,
    SESSION_SECRET,
    HP_ADMIN_TOKEN: ADMIN,
    DEV_WRITE_TOKEN: 'dev-token-should-never-work-for-hp',
    ALLOWED_ORIGINS: `https://study-navi.github.io,${UTAEMO_ORIGIN}`,
    GOOGLE_CLIENT_ID: 'test-client',
    ...extra,
  };
}

async function call(env, method, urlPath, { headers = {}, body, token, editKey, admin, origin } = {}) {
  const h = { ...headers };
  if (origin) h.Origin = origin;
  if (token) h.Authorization = `Bearer ${token}`;
  if (editKey) h['X-Utaeru-Edit-Key'] = editKey;
  if (admin !== undefined) h['X-Utaeru-Admin-Token'] = admin;
  let payload;
  if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await worker.fetch(new Request(API + urlPath, { method, headers: h, body: payload }), env);
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  return { status: res.status, headers: res.headers, data, text };
}

function insertUser(db, sub, email) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.raw.prepare('INSERT INTO users (user_id, google_sub, email, display_name, created_at, last_login_at) VALUES (?,?,?,?,?,?)')
    .run(id, sub, email, null, now, now);
  return id;
}

const song = (t, a, y, ty, genres) => ({ t, a, y, ty, genres });
const S1 = song('Story', 'AI', 'あい', 'story', ['J-POP']);
const S2 = song('ドライフラワー', '優里', 'ゆうり', 'どらいふらわー', ['J-POP']);
const S3 = song('千本桜', '黒うさP', 'くろうさぴー', 'せんぼんざくら', ['ボカロ']);
const S4 = song('残酷な天使のテーゼ', '高橋洋子', 'たかはしようこ', 'ざんこくなてんしのてーぜ', ['アニソン']);

// ---------------------------------------------------------------------------
// セットアップ: ユーザー・Utaemo公開ページ・連携
// ---------------------------------------------------------------------------
const db = makeD1();
const env = makeEnv(db);

const userA = insertUser(db, 'sub-a', 'a@example.com');
const userB = insertUser(db, 'sub-b', 'b@example.com');
const tokenA = signToken('sub-a');
const tokenB = signToken('sub-b');

function pagePayload(streamerId) {
  return {
    streamerName: 'テスト配信者', subtitle: 's', configVersion: 2, themeType: 'preset', presetIndex: 0,
    customHex: null, streamerId, songs: [{ k: 'あ', y: 'あい', a: 'AI', t: 'Story' }], songMeta: {}, tagPresets: [],
  };
}

// streamer-a: Google 所有(userA) / streamer-c: Google 所有(userB) / streamer-b: 編集キー所有(匿名)
for (const [sid, tok] of [['streamer-a', tokenA], ['streamer-c', tokenB]]) {
  const c = await call(env, 'POST', `/api/streamer/${sid}/claim`, { token: tok, body: {} });
  check(`[setup] ${sid} を Google で取得`, c.status === 200, JSON.stringify(c.data));
  const p = await call(env, 'PUT', `/api/public/${sid}`, { token: tok, body: pagePayload(sid) });
  check(`[setup] ${sid} を公開`, p.status === 200, JSON.stringify(p.data));
}
const anon = await call(env, 'POST', '/api/streamer/streamer-b/create-anonymous', { body: pagePayload('streamer-b') });
check('[setup] streamer-b を編集キーで作成', anon.status === 201 && /^ut_/.test(anon.data.editKey), JSON.stringify(anon.data));
const editKeyB = anon.data.editKey;

// ---------------------------------------------------------------------------
// 1. 管理者API(紐づけ)
// ---------------------------------------------------------------------------
console.log('\n--- 管理者API ---');
const linkBody = { streamerId: 'streamer-a', hpName: 'あんて｡ OFFICIAL STAGE', hpUrl: 'https://ante-stage.github.io/songs.html' };

eq('管理者トークンなしは 401', (await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { body: linkBody })).status, 401);
eq('間違った管理者トークンは 401', (await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { admin: 'wrong', body: linkBody })).status, 401);
eq('管理者トークンの一覧もなしは 401', (await call(env, 'GET', '/api/admin/hp-links')).status, 401);
eq('HP_ADMIN_TOKEN が未設定の Worker では管理APIは常に 401', (await call(makeEnv(db, { HP_ADMIN_TOKEN: undefined }), 'PUT', '/api/admin/hp-links/ante-hp', { admin: ADMIN, body: linkBody })).status, 401);
eq('短すぎる HP_ADMIN_TOKEN 設定は無効扱い(401)', (await call(makeEnv(db, { HP_ADMIN_TOKEN: 'short' }), 'PUT', '/api/admin/hp-links/ante-hp', { admin: 'short', body: linkBody })).status, 401);
eq('ユーザーのセッションでは管理APIを使えない', (await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { token: tokenA, body: linkBody })).status, 401);
eq('dev トークンでは管理APIを使えない', (await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { headers: { 'X-Utaeru-Dev-Token': env.DEV_WRITE_TOKEN }, body: linkBody })).status, 401);

eq('不正なリンクID(大文字)は 400', (await call(env, 'PUT', '/api/admin/hp-links/Ante_HP', { admin: ADMIN, body: linkBody })).status, 400);
eq('http のURLは拒否', (await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { admin: ADMIN, body: { ...linkBody, hpUrl: 'http://ante-stage.github.io/' } })).status, 400);
eq('javascript: のURLは拒否', (await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { admin: ADMIN, body: { ...linkBody, hpUrl: 'javascript:alert(1)' } })).status, 400);
eq('認証情報つきURLは拒否', (await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { admin: ADMIN, body: { ...linkBody, hpUrl: 'https://user:pw@example.com/' } })).status, 400);
eq('HP名が空は 400', (await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { admin: ADMIN, body: { ...linkBody, hpName: '  ' } })).status, 400);
eq('存在しない公開ページIDには紐づけ不可(404)', (await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { admin: ADMIN, body: { ...linkBody, streamerId: 'nobody-here' } })).data.error, 'streamer_not_found');

// 公開ページ行はあるが所有者のいないID(取得される前に紐づけると乗っ取りの余地が生まれる)
db.raw.prepare("INSERT INTO streamers (streamer_id, public_data, created_at, updated_at) VALUES ('orphan-id','{}','t','t')").run();
eq('所有者のいないIDには紐づけ不可(409)', (await call(env, 'PUT', '/api/admin/hp-links/orphan-hp', { admin: ADMIN, body: { ...linkBody, streamerId: 'orphan-id' } })).data.error, 'streamer_unowned');

// 削除済み(非公開)ページ
db.raw.prepare("INSERT INTO streamers (streamer_id, public_data, created_at, updated_at, deleted_at) VALUES ('gone-id','{}','t','t','2026-01-01')").run();
eq('削除済みページには紐づけ不可(409)', (await call(env, 'PUT', '/api/admin/hp-links/gone-hp', { admin: ADMIN, body: { ...linkBody, streamerId: 'gone-id' } })).data.error, 'page_unpublished');

const created = await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { admin: ADMIN, body: linkBody });
check('紐づけ作成(あんて｡HP → streamer-a)', created.status === 200 && created.data.created === true, JSON.stringify(created.data));
const again = await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { admin: ADMIN, body: { ...linkBody, hpName: 'あんて｡ OFFICIAL STAGE (改)' } });
check('同じ紐づけの再実行は冪等(名前だけ更新)', again.status === 200 && again.data.created === false);
eq('同じリンクIDを別ユーザーのIDへ付け替えは不可(409)', (await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { admin: ADMIN, body: { ...linkBody, streamerId: 'streamer-c' } })).data.error, 'link_id_in_use');
eq('1つのUtaemoページに複数HPは不可(409)', (await call(env, 'PUT', '/api/admin/hp-links/other-hp', { admin: ADMIN, body: linkBody })).data.error, 'streamer_already_linked');
await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { admin: ADMIN, body: linkBody }); // 名前を元に戻す
const list = await call(env, 'GET', '/api/admin/hp-links', { admin: ADMIN });
check('一覧に連携が出る', list.status === 200 && list.data.links.length === 1 && list.data.links[0].linkId === 'ante-hp' && list.data.links[0].revision === null, JSON.stringify(list.data));

// ---------------------------------------------------------------------------
// 2. 公開フィード(HPが読む側)
// ---------------------------------------------------------------------------
console.log('\n--- 公開フィード ---');
const feed0 = await call(env, 'GET', '/api/hp/ante-hp/songs', { origin: HP_ORIGIN });
eq('未反映の間は 404(HPは従来データを使い続ける)', feed0.status, 404);
eq('不正なリンクIDは 400', (await call(env, 'GET', '/api/hp/BAD_ID/songs')).status, 400);
eq('存在しないリンクIDは 404', (await call(env, 'GET', '/api/hp/nobody/songs')).status, 404);
eq('フィードのCORSは全オリジン許可', feed0.headers.get('access-control-allow-origin'), '*');
check('フィードのCORSに認証情報許可を付けない', feed0.headers.get('access-control-allow-credentials') === null);
const pre = await worker.fetch(new Request(`${API}/api/hp/ante-hp/songs`, { method: 'OPTIONS', headers: { Origin: HP_ORIGIN, 'Access-Control-Request-Method': 'GET' } }), env);
check('フィードのプリフライトは 204', pre.status === 204 && pre.headers.get('access-control-allow-origin') === '*');
const me = await call(env, 'GET', '/api/auth/me', { origin: UTAEMO_ORIGIN, token: tokenA });
check('既存APIのCORSは従来どおり(許可オリジンのみ・認証情報あり)', me.headers.get('access-control-allow-origin') === UTAEMO_ORIGIN && me.headers.get('access-control-allow-credentials') === 'true');
const meEvil = await call(env, 'GET', '/api/auth/me', { origin: 'https://evil.example', token: tokenA });
check('既存APIは未許可オリジンにCORSを出さない', meEvil.headers.get('access-control-allow-origin') === null);
const preApi = await worker.fetch(new Request(`${API}/api/streamer/streamer-a/hp-publish`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } }), env);
eq('反映APIのプリフライトは未許可オリジンに 403', preApi.status, 403);

// ---------------------------------------------------------------------------
// 3. 連携状況(本人のみ)
// ---------------------------------------------------------------------------
console.log('\n--- 連携状況 ---');
eq('未認証は 401', (await call(env, 'GET', '/api/streamer/streamer-a/hp-link')).status, 401);
eq('他人(userB)は streamer-a の連携状況を見られない(403)', (await call(env, 'GET', '/api/streamer/streamer-a/hp-link', { token: tokenB })).status, 403);
eq('他人の編集キーでは 401', (await call(env, 'GET', '/api/streamer/streamer-a/hp-link', { editKey: editKeyB })).status, 401);
const stA = await call(env, 'GET', '/api/streamer/streamer-a/hp-link', { token: tokenA });
check('本人は連携状況を取得できる', stA.status === 200 && stA.data.linked === true && stA.data.hpName === 'あんて｡ OFFICIAL STAGE' && stA.data.hpUrl === 'https://ante-stage.github.io/songs.html' && stA.data.published === null, JSON.stringify(stA.data));
check('連携状況は no-store', stA.headers.get('cache-control') === 'no-store');
eq('未連携ユーザー(Google)は linked:false', (await call(env, 'GET', '/api/streamer/streamer-c/hp-link', { token: tokenB })).data, { linked: false });
eq('未連携ユーザー(編集キー)も linked:false', (await call(env, 'GET', '/api/streamer/streamer-b/hp-link', { editKey: editKeyB })).data, { linked: false });

// ---------------------------------------------------------------------------
// 4. 反映(認可)
// ---------------------------------------------------------------------------
console.log('\n--- 反映: 認可 ---');
const pub = (extra = {}) => ({ expectedRevision: 0, songs: [S1, S2, S3], ...extra });
eq('未認証は 401', (await call(env, 'POST', '/api/streamer/streamer-a/hp-publish', { body: pub() })).status, 401);
eq('他人(userB)のセッションで streamer-a には反映できない(403)', (await call(env, 'POST', '/api/streamer/streamer-a/hp-publish', { token: tokenB, body: pub() })).status, 403);
eq('他人の編集キーでは反映できない(401)', (await call(env, 'POST', '/api/streamer/streamer-a/hp-publish', { editKey: editKeyB, body: pub() })).status, 401);
eq('dev トークンでは反映できない', (await call(env, 'POST', '/api/streamer/streamer-a/hp-publish', { headers: { 'X-Utaeru-Dev-Token': env.DEV_WRITE_TOKEN }, body: pub() })).status, 401);
eq('管理者トークンでは反映できない', (await call(env, 'POST', '/api/streamer/streamer-a/hp-publish', { admin: ADMIN, body: pub() })).status, 401);
eq('リンクID(ante-hp)をパスに入れても反映できない', (await call(env, 'POST', '/api/streamer/ante-hp/hp-publish', { token: tokenA, body: pub() })).status, 403);
eq('連携していないページ(streamer-c)は 404 hp_not_linked', (await call(env, 'POST', '/api/streamer/streamer-c/hp-publish', { token: tokenB, body: pub() })).data.error, 'hp_not_linked');
eq('未認証のフィードは何も変わらない(まだ404)', (await call(env, 'GET', '/api/hp/ante-hp/songs')).status, 404);

// ---------------------------------------------------------------------------
// 5. 反映(入力検証・公開データ)
// ---------------------------------------------------------------------------
console.log('\n--- 反映: 入力検証・公開データ ---');
const P = (body, who = { token: tokenA }) => call(env, 'POST', '/api/streamer/streamer-a/hp-publish', { ...who, body });
eq('expectedRevision がないと 400', (await P({ songs: [S1] })).status, 400);
eq('songs が配列でないと 400', (await P({ expectedRevision: 0, songs: 'x' })).status, 400);
eq('曲名が空の曲は 400', (await P({ expectedRevision: 0, songs: [{ t: '', a: 'x' }] })).status, 400);
eq('不正JSONは 400', (await call(env, 'POST', '/api/streamer/streamer-a/hp-publish', { token: tokenA, body: '{oops' })).status, 400);
eq('空リストは確認なしだと 400(全曲が非表示になるため)', (await P({ expectedRevision: 0, songs: [] })).data.error, 'empty_requires_confirmation');
eq('confirmEmpty が true 以外(文字列)でも 400', (await P({ expectedRevision: 0, songs: [], confirmEmpty: 'true' })).data.error, 'empty_requires_confirmation');
eq('曲数の上限超過は 400', (await P({ expectedRevision: 0, songs: Array.from({ length: 5001 }, (_, i) => ({ t: `t${i}`, a: 'a' })) })).status, 400);
const big = await call(env, 'POST', '/api/streamer/streamer-a/hp-publish', { token: tokenA, body: JSON.stringify({ expectedRevision: 0, songs: [{ t: 'x'.repeat(2.5 * 1024 * 1024), a: 'a' }] }) });
eq('2MB 超は 413', big.status, 413);
eq('ここまでの失敗で公開データは作られていない', (await call(env, 'GET', '/api/hp/ante-hp/songs')).status, 404);

// 非公開情報が混ざった曲を送っても、公開データには許可フィールドしか載らない
const dirty = {
  ...S1, id: 1, k: 'あ', tk: 's',
  memo: '練習メモ: サビの高音が苦手', marks: ['learning', 'signature'], tags: ['練習中タグ'], addedAt: '2026-10-01',
  email: 'a@example.com', accessToken: 'ut_' + 'f'.repeat(64), editKey: 'ut_' + 'e'.repeat(64), password: 'hunter2',
};
const dirty2 = { ...S2, genres: ['J-POP', '自作ジャンル', 'J-POP'], note: '秘密' };
const dirty3 = { t: 'ctrl\u0001chars\u0000', a: 'bad artist', genres: 'J-POP' };
const first = await P({ expectedRevision: 0, songs: [dirty, dirty2, S3, S1 /* 重複 */, dirty3] });
check('初回反映(revision 1)', first.status === 200 && first.data.revision === 1 && first.data.songCount === 4 && first.data.unchanged === false, JSON.stringify(first.data));
const feed1 = await call(env, 'GET', '/api/hp/ante-hp/songs', { origin: HP_ORIGIN });
check('フィードが 200 で曲を返す', feed1.status === 200 && feed1.data.songCount === 4 && feed1.data.revision === 1 && feed1.data.linkId === 'ante-hp');
check('フィードは no-cache + ETag', feed1.headers.get('cache-control') === 'no-cache' && feed1.headers.get('etag') === '"r1"');
const allowedKeys = new Set(['t', 'a', 'y', 'ty', 'genres']);
check('公開データの曲は許可フィールド(t,a,y,ty,genres)だけ', feed1.data.songs.every((s) => Object.keys(s).every((k) => allowedKeys.has(k))), JSON.stringify(feed1.data.songs));
for (const secret of ['練習メモ', 'learning', 'signature', '練習中タグ', 'a@example.com', 'hunter2', 'ut_ffff', 'ut_eeee', '秘密', '2026-10-01', '自作ジャンル']) {
  check(`公開データに「${secret}」が含まれない`, !feed1.text.includes(secret));
}
eq('重複曲(同じアーティスト+曲名)は1件にまとまる', feed1.data.songs.filter((s) => s.t === 'Story').length, 1);
eq('許可外ジャンルは落ち、重複ジャンルは1つになる', feed1.data.songs.find((s) => s.t === 'ドライフラワー').genres, ['J-POP']);
check('制御文字(曲キー区切り \\u0001 など)は除去される', feed1.data.songs.some((s) => s.t === 'ctrlchars' && s.a === 'badartist' && Array.isArray(s.genres) && s.genres.length === 0), JSON.stringify(feed1.data.songs));
const feed304 = await worker.fetch(new Request(`${API}/api/hp/ante-hp/songs`, { headers: { 'If-None-Match': '"r1"', Origin: HP_ORIGIN } }), env);
eq('ETag が一致すれば 304', feed304.status, 304);
const rawRow = db.raw.prepare('SELECT data FROM hp_published WHERE link_id = ?').get('ante-hp');
check('DBに保存されたデータにも非公開情報は無い', !rawRow.data.includes('練習メモ') && !rawRow.data.includes('hunter2') && !rawRow.data.includes('ut_'));

// ---------------------------------------------------------------------------
// 6. 編集しただけでは変わらない / 追加・変更・削除の反映
// ---------------------------------------------------------------------------
console.log('\n--- 編集と反映の分離 / 追加・変更・削除 ---');
const upd = await call(env, 'PUT', '/api/public/streamer-a', { token: tokenA, body: { ...pagePayload('streamer-a'), songs: [{ k: 'あ', y: 'x', a: 'Other', t: 'Other' }] } });
check('Utaemo本体の公開(/u/ページ)を更新しても…', upd.status === 200);
eq('…HP用の公開データは変わらない', (await call(env, 'GET', '/api/hp/ante-hp/songs')).data.songs.map((s) => s.t).sort(), ['Story', 'ctrlchars', 'ドライフラワー', '千本桜'].sort());

const afterEdit = [S1, { ...S2, genres: ['J-POP', 'アイドル曲'] }, S4]; // S3 削除 / S2 変更 / S4 追加 / dirty3 削除
const second = await P({ expectedRevision: 1, songs: afterEdit });
check('追加・変更・削除の反映(revision 2)', second.status === 200 && second.data.revision === 2 && second.data.added === 1 && second.data.changed === 1 && second.data.removed === 2, JSON.stringify(second.data));
const feed2 = await call(env, 'GET', '/api/hp/ante-hp/songs');
eq('フィードが新しい内容になっている', feed2.data.songs.map((s) => s.t).sort(), ['Story', 'ドライフラワー', '残酷な天使のテーゼ'].sort());
eq('ジャンル変更が反映されている', feed2.data.songs.find((s) => s.t === 'ドライフラワー').genres, ['J-POP', 'アイドル曲']);
eq('古いETagでは 200 で最新を返す', (await worker.fetch(new Request(`${API}/api/hp/ante-hp/songs`, { headers: { 'If-None-Match': '"r1"' } }), env)).status, 200);

const same = await P({ expectedRevision: 2, songs: [S4, S1, afterEdit[1]] /* 並び順だけ違う */ });
check('内容が同じなら unchanged(revisionも日時も変わらない)', same.status === 200 && same.data.unchanged === true && same.data.revision === 2 && same.data.publishedAt === second.data.publishedAt, JSON.stringify(same.data));

// ---------------------------------------------------------------------------
// 7. 連打・同時更新・失敗時
// ---------------------------------------------------------------------------
console.log('\n--- 連打・同時更新・失敗時 ---');
const stale = await P({ expectedRevision: 1, songs: [S1] });
check('古い revision での反映は 409 で拒否され、公開データは変わらない', stale.status === 409 && stale.data.error === 'stale_revision' && stale.data.currentRevision === 2);
eq('拒否後もフィードは revision 2 のまま', (await call(env, 'GET', '/api/hp/ante-hp/songs')).data.revision, 2);

const next = [S1, S4, S3];
const [r1, r2, r3] = await Promise.all([P({ expectedRevision: 2, songs: next }), P({ expectedRevision: 2, songs: next }), P({ expectedRevision: 2, songs: next })]);
const wins = [r1, r2, r3].filter((r) => r.status === 200 && r.data.unchanged === false);
const losers = [r1, r2, r3].filter((r) => r.status === 409);
check('連打(同時3回)でも更新は1回だけ', wins.length === 1 && wins.length + losers.length === 3, JSON.stringify([r1.status, r2.status, r3.status]));
eq('連打後の revision は +1 だけ', (await call(env, 'GET', '/api/hp/ante-hp/songs')).data.revision, 3);

// SELECT と UPDATE の間に、別の端末の反映が先に確定してしまう状況(楽観ロックの検証)
db.hook.beforeRun = (sql) => {
  if (!sql.includes('UPDATE hp_published')) return;
  db.hook.beforeRun = null;
  db.raw.prepare("UPDATE hp_published SET revision = revision + 1, song_count = 1, data = ? WHERE link_id = 'ante-hp'")
    .run(JSON.stringify({ songs: [S4] }));
};
const raced = await P({ expectedRevision: 3, songs: [S1, S2] });
db.hook.beforeRun = null;
check('反映の途中で別の更新が先に確定していたら 409(上書きしない)', raced.status === 409 && raced.data.error === 'stale_revision', JSON.stringify(raced.data));
const feedRaced = await call(env, 'GET', '/api/hp/ante-hp/songs');
check('先に確定した更新の内容がそのまま残る', feedRaced.data.revision === 4 && feedRaced.data.songs.length === 1 && feedRaced.data.songs[0].t === '残酷な天使のテーゼ', JSON.stringify(feedRaced.data));
// 以降は revision 4 / [S4] を起点にする
const restore = await P({ expectedRevision: 4, songs: next });
check('最新の状態を読み直してからなら反映できる(revision 5)', restore.status === 200 && restore.data.revision === 5, JSON.stringify(restore.data));

const before = (await call(env, 'GET', '/api/hp/ante-hp/songs')).text;
db.failOn.pattern = 'UPDATE hp_published';
const failedWrite = await P({ expectedRevision: 5, songs: [S2] });
db.failOn.pattern = null;
eq('書き込み失敗は 500', failedWrite.status, 500);
eq('書き込み失敗でも、HPは前回成功時の曲リストをそのまま返す', (await call(env, 'GET', '/api/hp/ante-hp/songs')).text, before);

const failedNoHidden = await P({ expectedRevision: 5, songs: [{ t: '' }] });
eq('不正な内容で失敗しても前回の公開データのまま', [failedNoHidden.status, (await call(env, 'GET', '/api/hp/ante-hp/songs')).text === before], [400, true]);

// ---------------------------------------------------------------------------
// 8. 空リスト
// ---------------------------------------------------------------------------
console.log('\n--- 空リスト ---');
const emptyOk = await P({ expectedRevision: 5, songs: [], confirmEmpty: true });
check('確認つきの空リストは反映できる(全曲が非表示)', emptyOk.status === 200 && emptyOk.data.songCount === 0 && emptyOk.data.removed === 3, JSON.stringify(emptyOk.data));
const feedEmpty = await call(env, 'GET', '/api/hp/ante-hp/songs');
check('フィードは 200 で曲0件(HPは「曲リストは準備中です」表示になる)', feedEmpty.status === 200 && feedEmpty.data.songs.length === 0 && feedEmpty.data.songCount === 0);
const emptyAgain = await P({ expectedRevision: 6, songs: [], confirmEmpty: true });
check('空のまま再度反映しても unchanged', emptyAgain.status === 200 && emptyAgain.data.unchanged === true);

// ---------------------------------------------------------------------------
// 9. 他の連携先・利用者への影響がない
// ---------------------------------------------------------------------------
console.log('\n--- 別の利用者・別のHP ---');
await P({ expectedRevision: 6, songs: [S1, S2, S3] });
const linkB = await call(env, 'PUT', '/api/admin/hp-links/b-hp', { admin: ADMIN, body: { streamerId: 'streamer-b', hpName: 'B のHP', hpUrl: 'https://b-hp.example/' } });
eq('別の利用者(編集キー所有)のHPも紐づけられる', linkB.status, 200);
const bPub = await call(env, 'POST', '/api/streamer/streamer-b/hp-publish', { editKey: editKeyB, body: { expectedRevision: 0, songs: [S4] } });
check('編集キーの本人は自分のHPに反映できる', bPub.status === 200 && bPub.data.revision === 1, JSON.stringify(bPub.data));
eq('Bの反映はAのHPに影響しない', (await call(env, 'GET', '/api/hp/ante-hp/songs')).data.songs.map((s) => s.t).sort(), ['Story', 'ドライフラワー', '千本桜'].sort());
eq('AのHPへの反映はBのHPに影響しない', (await call(env, 'GET', '/api/hp/b-hp/songs')).data.songs.map((s) => s.t), ['残酷な天使のテーゼ']);
eq('A(Google)は B のページには反映できない', (await call(env, 'POST', '/api/streamer/streamer-b/hp-publish', { token: tokenA, body: { expectedRevision: 1, songs: [S1] } })).status, 403);
eq('B(編集キー)は A のページには反映できない', (await call(env, 'POST', '/api/streamer/streamer-a/hp-publish', { editKey: editKeyB, body: { expectedRevision: 7, songs: [S1] } })).status, 401);
eq('Bの編集キーを失効させると反映できない', await (async () => {
  db.raw.prepare("UPDATE streamer_edit_keys SET revoked_at = 'x' WHERE streamer_id = 'streamer-b'").run();
  return (await call(env, 'POST', '/api/streamer/streamer-b/hp-publish', { editKey: editKeyB, body: { expectedRevision: 1, songs: [S1] } })).status;
})(), 401);

// Utaemo公開ページが削除された場合(Google 所有の streamer-c を連携してから削除する)
eq('streamer-c(Google所有・userB)も連携できる', (await call(env, 'PUT', '/api/admin/hp-links/c-hp', { admin: ADMIN, body: { streamerId: 'streamer-c', hpName: 'C のHP', hpUrl: 'https://c-hp.example/' } })).status, 200);
const cPub = await call(env, 'POST', '/api/streamer/streamer-c/hp-publish', { token: tokenB, body: { expectedRevision: 0, songs: [S2] } });
check('userB は自分のページ(streamer-c)だけに反映できる', cPub.status === 200 && cPub.data.revision === 1);
// A は自分のURL(streamer-a)で認可されている。本文に C のID/リンクIDを混ぜても、C のHPには書けない。
const cBefore = (await call(env, 'GET', '/api/hp/c-hp/songs')).text;
const smuggle = await call(env, 'POST', '/api/streamer/streamer-a/hp-publish', { token: tokenA, body: { expectedRevision: 1, songs: [S4], streamerId: 'streamer-c', linkId: 'c-hp', link_id: 'c-hp' } });
check('本文のstreamerId/linkIdは無視され、Aの連携先(revision不一致)として扱われる', smuggle.status === 409 && smuggle.data.error === 'stale_revision', JSON.stringify(smuggle.data));
eq('他人のHP(c-hp)のフィードは変わらない', (await call(env, 'GET', '/api/hp/c-hp/songs')).text, cBefore);
eq('クエリで linkId を渡しても無視される', (await call(env, 'POST', '/api/streamer/streamer-a/hp-publish?linkId=c-hp&streamerId=streamer-c', { token: tokenA, body: { expectedRevision: 1, songs: [S4] } })).status, 409);
eq('…c-hp は引き続き変わらない', (await call(env, 'GET', '/api/hp/c-hp/songs')).text, cBefore);
db.raw.prepare("UPDATE streamers SET deleted_at = 'x' WHERE streamer_id = 'streamer-c'").run();
eq('Utaemoページを削除済みなら反映できない(403 page_unpublished)', (await call(env, 'POST', '/api/streamer/streamer-c/hp-publish', { token: tokenB, body: { expectedRevision: 1, songs: [S1] } })).data.error, 'page_unpublished');
eq('削除済みでも、前回反映分のフィードはそのまま残る', (await call(env, 'GET', '/api/hp/c-hp/songs')).data.songs.map((s) => s.t), ['ドライフラワー']);

// ---------------------------------------------------------------------------
// 10. 連携の解除
// ---------------------------------------------------------------------------
console.log('\n--- 連携の解除 ---');
eq('解除は管理者だけ(トークンなし 401)', (await call(env, 'DELETE', '/api/admin/hp-links/ante-hp')).status, 401);
eq('本人のセッションでは解除できない', (await call(env, 'DELETE', '/api/admin/hp-links/ante-hp', { token: tokenA })).status, 401);
const del = await call(env, 'DELETE', '/api/admin/hp-links/ante-hp', { admin: ADMIN });
check('管理者が解除できる', del.status === 200 && del.data.deleted === true);
eq('解除後、フィードは 404(HPは従来データに戻る)', (await call(env, 'GET', '/api/hp/ante-hp/songs')).status, 404);
eq('解除後、本人の連携状況は linked:false', (await call(env, 'GET', '/api/streamer/streamer-a/hp-link', { token: tokenA })).data, { linked: false });
eq('解除後は反映できない(404)', (await P({ expectedRevision: 7, songs: [S1] })).data.error, 'hp_not_linked');
const ownPage = await call(env, 'GET', '/api/public/streamer-a');
check('解除してもUtaemo側の公開ページ・編集データには影響しない', ownPage.status === 200 && ownPage.data.streamerName === 'テスト配信者');
eq('存在しない連携の解除は 404', (await call(env, 'DELETE', '/api/admin/hp-links/ante-hp', { admin: ADMIN })).status, 404);
await call(env, 'PUT', '/api/admin/hp-links/ante-hp', { admin: ADMIN, body: linkBody });
// 再連携直後の初回反映で、別の端末の初回反映が先に確定していた場合
db.hook.beforeRun = (sql) => {
  if (!sql.includes('INSERT INTO hp_published')) return;
  db.hook.beforeRun = null;
  db.raw.prepare("INSERT INTO hp_published (link_id, revision, published_at, song_count, data) VALUES ('ante-hp', 1, 't', 1, ?)")
    .run(JSON.stringify({ songs: [S3] }));
};
const firstRace = await P({ expectedRevision: 0, songs: [S1] });
db.hook.beforeRun = null;
check('初回反映の競合も 409(先に確定した方を上書きしない)', firstRace.status === 409 && firstRace.data.error === 'stale_revision', JSON.stringify(firstRace.data));
eq('先に確定した初回反映の内容が残る', (await call(env, 'GET', '/api/hp/ante-hp/songs')).data.songs.map((s) => s.t), ['千本桜']);
const relinked = await P({ expectedRevision: 1, songs: [S1] });
check('読み直してから反映できる(revision 2)', relinked.status === 200 && relinked.data.revision === 2, JSON.stringify(relinked.data));

// ---------------------------------------------------------------------------
// 11. マイグレーション未適用でも通常利用を妨げない
// ---------------------------------------------------------------------------
console.log('\n--- マイグレーション未適用の Worker ---');
const db0 = makeD1({ withMigration: false });
const env0 = makeEnv(db0);
const u0 = insertUser(db0, 'sub-a', 'a@example.com');
await call(env0, 'POST', '/api/streamer/streamer-a/claim', { token: tokenA, body: {} });
await call(env0, 'PUT', '/api/public/streamer-a', { token: tokenA, body: pagePayload('streamer-a') });
eq('連携状況は linked:false(500にならない)', (await call(env0, 'GET', '/api/streamer/streamer-a/hp-link', { token: tokenA })).data, { linked: false });
eq('フィードは 404', (await call(env0, 'GET', '/api/hp/ante-hp/songs')).status, 404);
eq('反映は 404 hp_not_linked', (await call(env0, 'POST', '/api/streamer/streamer-a/hp-publish', { token: tokenA, body: { expectedRevision: 0, songs: [S1] } })).data.error, 'hp_not_linked');
eq('管理APIは migration_required を返す', (await call(env0, 'GET', '/api/admin/hp-links', { admin: ADMIN })).data.error, 'migration_required');
check('従来の公開・取得APIは影響なし', (await call(env0, 'GET', '/api/public/streamer-a')).status === 200);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
