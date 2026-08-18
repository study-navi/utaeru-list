#!/usr/bin/env node
/**
 * Utalis v1.0: Googleログイン前後の編集state保持テスト（OAuth/APIはモック）
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');
const API = 'https://utaeru-api.manabit.workers.dev';

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function snapshotFromPage(page) {
  return page.evaluate(() => ({
    streamerName: document.getElementById('streamerName')?.value ?? '',
    subtitle: document.getElementById('subtitle')?.value ?? '',
    streamerId: document.getElementById('streamerIdInput')?.value ?? '',
    search: document.getElementById('searchInput')?.value ?? '',
    selectedCount: selectedKeys.size,
    selectedKeys: [...selectedKeys].sort(),
    songMetaKeys: Object.keys(songMeta).sort(),
    songMetaSample: JSON.stringify(songMeta),
    themeType: currentTheme.type,
    presetIndex: currentTheme.presetIndex,
    customHex: currentTheme.customHex,
    customColorInput: document.getElementById('customColorInput')?.value ?? '',
    tagPresets: tagPresets.map((t) => t.label),
    activeEditTab,
    songListView,
    searchTarget,
    activeGyo,
    activeKana,
    onlineMode,
    authUserEmail: authUser?.email ?? null,
    authOwned: authUser?.ownedStreamerIds ?? [],
  }));
}

async function setupEditorState(page, suffix) {
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.waitForTimeout(100);

  await page.fill('#streamerName', 'ログイン保持テスト');
  await page.fill('#subtitle', 'ログイン前に入力した文章です');
  await page.fill('#streamerIdInput', `login-state-test-${suffix}`);
  await page.dispatchEvent('#streamerIdInput', 'input');

  await page.click('#editTabSongs');
  await page.waitForSelector('#panelSongs:not([hidden])');

  await page.evaluate(() => {
    selectedKeys.clear();
    songMeta = {};
    const picks = MASTER_SONGS.slice(0, 3);
    for (const s of picks) {
      const key = s.a + '\u0001' + s.t;
      selectedKeys.add(key);
      songMeta[key] = { marks: ['signature', 'favorite'], tags: ['anime'] };
    }
    selectPreset(2);
    tagPresets.push({ id: 'free-tag', label: '自由タグテスト' });
    activeGyo = 'あ';
    activeKana = 'あ';
    songListView = 'selected';
    searchTarget = 'artist';
    document.getElementById('searchInput').value = 'テストアーティスト';
    document.getElementById('searchTargetArtist')?.click();
    document.querySelector('#viewTabSelected')?.click();
    render();
    updateSelectedCount();
    updateGyoSubRow();
    [...document.getElementById('gyoRow').children].forEach((c, i) => {
      c.classList.toggle('active', i === 1);
    });
    setEditTab('design', { scroll: false });
  });

  await page.waitForTimeout(150);
}

async function mockAuthRoutes(page, opts = {}) {
  const { ownedIds = [], loginOk = true, meOk = true, delayMeMs = 0 } = opts;
  let meCalls = 0;
  await page.route('**/api/auth/google', async (route) => {
    if (!loginOk) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_token' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'login-test@example.com', accessToken: 'mock.access.token' }),
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    meCalls += 1;
    const auth = route.request().headers()['authorization'];
    if (!auth) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
      return;
    }
    if (delayMeMs > 0) await new Promise((r) => setTimeout(r, delayMeMs));
    if (!meOk) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'login-test@example.com',
        ownedStreamerIds: ownedIds,
      }),
    });
  });

  await page.route('**/api/public/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          streamerName: 'サーバー上の古い名前',
          subtitle: 'サーバー上の古いサブタイトル',
          songs: [],
          songMeta: {},
          tagPresets: [],
          themeType: 'preset',
          presetIndex: 0,
        }),
      });
      return;
    }
    await route.continue();
  });

  return () => meCalls;
}

function compareSnapshots(before, after, label) {
  const fields = [
    ['streamerName', '配信者名'],
    ['subtitle', 'サブタイトル'],
    ['streamerId', '公開ページID'],
    ['selectedCount', '選択曲数'],
    ['themeType', 'テーマ種別'],
    ['presetIndex', 'プリセットindex'],
    ['activeEditTab', '編集タブ'],
    ['songListView', 'すべて/選択中'],
    ['searchTarget', '検索対象'],
    ['search', '検索文字列'],
    ['activeGyo', '五十音行'],
    ['activeKana', 'かな1文字'],
  ];

  for (const [key, name] of fields) {
    if (before[key] !== after[key]) {
      fail(`${label}: ${name}保持`, `before=${JSON.stringify(before[key])} after=${JSON.stringify(after[key])}`);
    } else {
      ok(`${label}: ${name}保持`);
    }
  }

  if (JSON.stringify(before.selectedKeys) !== JSON.stringify(after.selectedKeys)) {
    fail(`${label}: 選択曲キー`, `before=${before.selectedKeys.length} after=${after.selectedKeys.length}`);
  } else {
    ok(`${label}: 選択曲キー保持 (${after.selectedCount}曲)`);
  }

  if (before.songMetaSample !== after.songMetaSample) {
    fail(`${label}: songMeta`, '内容不一致');
  } else {
    ok(`${label}: songMeta保持`);
  }

  if (JSON.stringify(before.tagPresets) !== JSON.stringify(after.tagPresets)) {
    fail(`${label}: tagPresets`, `before=${before.tagPresets.join(',')} after=${after.tagPresets.join(',')}`);
  } else {
    ok(`${label}: tagPresets保持`);
  }
}

async function runSuccessfulLoginCase() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const suffix = Date.now().toString(36);
  await setupEditorState(page, suffix);
  const getMeCalls = await mockAuthRoutes(page, { ownedIds: [`login-state-test-${suffix}`] });
  const before = await snapshotFromPage(page);

  await page.evaluate(async () => {
    setOnlineMode('google', { openPanel: false });
    await completeUtaeruLogin({ googleAccessToken: 'mock.google.access' });
  });
  await page.waitForFunction(() => authUser && authUser.email, { timeout: 5000 });
  await page.waitForTimeout(200);

  const after = await snapshotFromPage(page);
  compareSnapshots(before, after, 'ログイン成功');

  if (!after.authUserEmail) fail('ログイン成功', 'authUser が null');
  else ok('ログイン成功: authUser 設定');

  const publicFetch = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/public/') && req.method() === 'GET') publicFetch.push(req.url());
  });
  await page.waitForTimeout(100);
  if (publicFetch.length) fail('ログイン成功', `意図しない GET /api/public: ${publicFetch.length}件`);
  else ok('ログイン成功: サーバーデータ自動読込なし');

  const payload = await page.evaluate(() => buildPublicPayload(document.getElementById('streamerIdInput').value.trim()));
  if (payload.streamerName !== before.streamerName) fail('公開payload', 'streamerName不一致');
  else ok('公開payload: 配信者名保持');
  if ((payload.songs || []).length !== before.selectedCount) fail('公開payload', '曲数不一致');
  else ok('公開payload: 選択曲保持');

  if (errors.length) fail('Consoleエラー', errors.join('; '));
  else ok('Consoleエラーなし');

  console.log(`NOTE: /api/auth/me calls during test: ${getMeCalls()}`);
  await browser.close();
}

async function runCancelCase() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditorState(page, 'cancel');
  await mockAuthRoutes(page);
  const before = await snapshotFromPage(page);

  await page.evaluate(() => {
    onGoogleTokenResponse({ error: 'popup_closed_by_user', error_description: 'User cancelled' });
  });
  await page.waitForTimeout(200);

  const after = await snapshotFromPage(page);
  compareSnapshots(before, after, 'ログインキャンセル');
  await browser.close();
}

async function runFailureCase() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditorState(page, 'fail');
  await mockAuthRoutes(page, { loginOk: false });
  const before = await snapshotFromPage(page);

  await page.evaluate(async () => {
    await completeUtaeruLogin({ googleAccessToken: 'bad.token' });
  });
  await page.waitForTimeout(300);

  const after = await snapshotFromPage(page);
  compareSnapshots(before, after, 'ログイン失敗');
  await browser.close();
}

async function runSlowInitialMeRaceCase() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await setupEditorState(page, 'race');
  await mockAuthRoutes(page, { delayMeMs: 800 });
  const before = await snapshotFromPage(page);

  await page.evaluate(async () => {
    await completeUtaeruLogin({ googleAccessToken: 'mock.google.access' });
  });
  await page.waitForTimeout(1200);

  const after = await snapshotFromPage(page);
  compareSnapshots(before, after, '初期auth/me競合');
  if (!after.authUserEmail) fail('初期auth/me競合', 'authUser が null のまま（競合でログイン状態が消えた可能性）');
  else ok('初期auth/me競合: authUser 最終的に保持');
  await browser.close();
}

async function runSetOnlineModeLoginCase() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const suffix = `mode-${Date.now().toString(36)}`;
  await setupEditorState(page, suffix);
  await mockAuthRoutes(page);
  const before = await snapshotFromPage(page);

  await page.evaluate(async () => {
    setOnlineMode('google', { openPanel: true });
    await completeUtaeruLogin({ googleAccessToken: 'mock.google.access' });
  });
  await page.waitForTimeout(300);

  const after = await snapshotFromPage(page);
  compareSnapshots(before, after, 'setOnlineMode→ログイン');
  await browser.close();
}

async function main() {
  console.log('=== Googleログイン編集state保持テスト ===\n');
  await runSuccessfulLoginCase();
  console.log('');
  await runSetOnlineModeLoginCase();
  console.log('');
  await runCancelCase();
  console.log('');
  await runFailureCase();
  console.log('');
  await runSlowInitialMeRaceCase();
  console.log('');
  if (failed) {
    console.error(`\n${failed} 件失敗`);
    process.exit(1);
  }
  console.log('すべて成功');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
