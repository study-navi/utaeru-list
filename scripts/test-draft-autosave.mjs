#!/usr/bin/env node
/**
 * Utalis v1.0: ブラウザ内下書き自動保存テスト
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');
const DRAFT_KEY = 'utalis_draft_v1';
const API = 'https://utaeru-api.manabit.workers.dev';

const WIDTHS = [320, 375, 390, 430, 1280];
const FORBIDDEN = [
  'accessToken',
  'access_token',
  'Bearer ',
  'editKey',
  'utaeru_access_token',
  'utaeru_edit_key',
  'ADMIN_STATS_TOKEN',
  'DEV_WRITE_TOKEN',
  'mock.access.token',
  'session token',
];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function assertDraftSecurity(raw) {
  if (!raw) return;
  const lower = raw.toLowerCase();
  for (const needle of FORBIDDEN) {
    if (lower.includes(needle.toLowerCase())) {
      fail('draft に認証情報が含まれる', needle);
      return;
    }
  }
  ok('draft に認証情報なし');
}

async function waitReady(page) {
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined' && draftBootComplete === true, { timeout: 15000 });
  await page.waitForTimeout(350);
}

async function fillBasicEditor(page, opts = {}) {
  const suffix = opts.suffix || 'draft';
  await page.fill('#streamerName', opts.name || '下書きテスト配信者');
  await page.fill('#subtitle', opts.subtitle || '一言サブタイトル');
  await page.fill('#streamerIdInput', opts.streamerId || `draft-test-${suffix}`);
  await page.dispatchEvent('#streamerIdInput', 'input');
  await page.evaluate(({ songCount, themePreset }) => {
    selectedKeys.clear();
    songMeta = {};
    const picks = MASTER_SONGS.slice(0, songCount);
    for (const s of picks) {
      const key = s.a + '\u0001' + s.t;
      selectedKeys.add(key);
      songMeta[key] = { marks: ['signature', 'favorite'], tags: ['anime'] };
    }
    selectPreset(themePreset);
    tagPresets.push({ id: 'free-tag-test', label: '自由タグテスト' });
    renderTagAdmin();
    render();
    updateSelectedCount();
  }, { songCount: opts.songCount || 10, themePreset: opts.themePreset ?? 2 });
  await page.waitForTimeout(600);
}

async function readDraft(page) {
  return page.evaluate((key) => {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }, DRAFT_KEY);
}

async function snapshotEditor(page) {
  return page.evaluate(() => ({
    streamerName: document.getElementById('streamerName')?.value ?? '',
    subtitle: document.getElementById('subtitle')?.value ?? '',
    streamerId: document.getElementById('streamerIdInput')?.value ?? '',
    selectedCount: selectedKeys.size,
    selectedKeys: [...selectedKeys].sort(),
    songMetaKeys: Object.keys(songMeta).sort(),
    themeType: currentTheme.type,
    presetIndex: currentTheme.presetIndex,
    tagLabels: tagPresets.map((t) => t.label),
    draftStatus: document.getElementById('draftSaveStatus')?.textContent?.trim() ?? '',
    authMessage: document.getElementById('authMessage')?.textContent?.trim() ?? '',
  }));
}

async function testA_ReloadRestore(browser) {
  const page = await browser.newPage();
  await waitReady(page);
  await fillBasicEditor(page, { suffix: 'a' });
  const before = await snapshotEditor(page);
  const raw = await readDraft(page);
  if (!raw) fail('A: draft が保存されない');
  else ok('A: draft 保存');
  assertDraftSecurity(raw);
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1) fail('A: draft version', String(parsed.version));
  else ok('A: draft version 1');
  if (Array.isArray(parsed.data?.selectedSongIds) && parsed.data.selectedSongIds.length === 10) ok('A: 曲IDのみ保存');
  else fail('A: selectedSongIds', JSON.stringify(parsed.data?.selectedSongIds));
  if (raw.includes('"k":"あ"') || raw.includes('MASTER_SONGS')) fail('A: MASTER_SONGS 全体を保存');
  else ok('A: MASTER_SONGS 非保存');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => draftBootComplete === true, { timeout: 15000 });
  await page.waitForTimeout(300);
  const after = await snapshotEditor(page);
  if (after.streamerName !== before.streamerName || after.selectedCount !== before.selectedCount) {
    fail('A: リロード復元', JSON.stringify({ before, after }));
  } else ok('A: リロード復元');
  if (!after.authMessage.includes('復元')) fail('A: 復元メッセージ', after.authMessage);
  else ok('A: 復元メッセージ');
  await page.close();
}

async function testB_MarksTags(browser) {
  const page = await browser.newPage();
  await waitReady(page);
  await fillBasicEditor(page, { suffix: 'b', songCount: 3 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => draftBootComplete === true, { timeout: 15000 });
  const snap = await snapshotEditor(page);
  if (snap.songMetaKeys.length !== 3) fail('B: songMeta 復元', String(snap.songMetaKeys.length));
  else ok('B: songMeta 復元');
  const raw = await readDraft(page);
  assertDraftSecurity(raw);
  await page.close();
}

async function testC_NewSession(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await waitReady(page);
  await fillBasicEditor(page, { suffix: 'c', songCount: 4 });
  await page.evaluate(() => saveDraftToStorage());
  const raw = await readDraft(page);
  if (!raw) {
    fail('C: 下書きが保存されない');
    await context.close();
    return;
  }
  const before = await snapshotEditor(page);

  const page2 = await context.newPage();
  await waitReady(page2);
  await page.close();
  const after = await snapshotEditor(page2);
  if (after.streamerName !== before.streamerName || after.selectedCount !== before.selectedCount) {
    fail('C: 新規タブ復元', JSON.stringify({ before, after }));
  } else ok('C: 新規タブ復元');
  await context.close();
}

async function testD_GoogleLogin(browser) {
  const page = await browser.newPage();
  await page.route('**/api/auth/google', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'draft-test@example.com', accessToken: 'mock.access.token' }),
    });
  });
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'draft-test@example.com', ownedStreamerIds: [] }),
    });
  });
  await waitReady(page);
  await fillBasicEditor(page, { suffix: 'd', songCount: 2 });
  const before = await snapshotEditor(page);
  await page.evaluate(async () => {
    await completeUtaeruLogin({ googleAccessToken: 'mock-google-token' });
  });
  await page.waitForTimeout(400);
  const after = await snapshotEditor(page);
  if (after.streamerName !== before.streamerName || after.selectedCount !== before.selectedCount) {
    fail('D: Googleログイン後も編集維持', JSON.stringify({ before, after }));
  } else ok('D: Googleログイン後も編集維持');
  const raw = await readDraft(page);
  assertDraftSecurity(raw);
  await page.close();
}

async function testE_Publish(browser) {
  const page = await browser.newPage();
  const sid = `draft-pub-${Date.now().toString(36)}`;
  let putBody = null;
  await page.route(`**/api/streamer/${encodeURIComponent(sid)}/create-anonymous`, async (route) => {
    const body = route.request().postData();
    putBody = body ? JSON.parse(body) : null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ editKey: 'issued-edit-key-plaintext' }),
    });
  });
  await waitReady(page);
  await fillBasicEditor(page, { suffix: 'e', streamerId: sid, songCount: 2 });
  await page.evaluate(() => setOnlineMode('anonymous', { openPanel: false }));
  await page.click('#publishBtn');
  await page.waitForFunction(() => {
    const m = document.getElementById('authMessage')?.textContent || '';
    return m.includes('公開しました');
  }, { timeout: 10000 });
  if (!putBody || putBody.streamerName !== '下書きテスト配信者') fail('E: 公開API', JSON.stringify(putBody));
  else ok('E: 公開API');
  const raw = await readDraft(page);
  assertDraftSecurity(raw);
  if (!raw) fail('E: 公開後 draft');
  else ok('E: 公開後 draft 更新');
  await page.close();
}

async function testF_PostPublishEdit(browser) {
  const page = await browser.newPage();
  const sid = `draft-post-${Date.now().toString(36)}`;
  await page.route(`**/api/streamer/${encodeURIComponent(sid)}/create-anonymous`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ editKey: 'issued-edit-key-plaintext' }),
    });
  });
  await waitReady(page);
  await fillBasicEditor(page, { suffix: 'f', streamerId: sid, songCount: 2 });
  await page.evaluate(() => setOnlineMode('anonymous', { openPanel: false }));
  await page.click('#publishBtn');
  await page.waitForFunction(() => (document.getElementById('authMessage')?.textContent || '').includes('公開しました'), { timeout: 10000 });
  await page.fill('#streamerName', '公開後に編集した名前');
  await page.dispatchEvent('#streamerName', 'input');
  await page.waitForTimeout(600);
  const raw = await readDraft(page);
  if (!raw || !raw.includes('公開後に編集した名前')) fail('F: 公開後編集を draft 保存');
  else ok('F: 公開後編集を draft 保存');
  assertDraftSecurity(raw);
  await page.close();
}

async function testG_BrokenDraft(browser) {
  const page = await browser.newPage();
  await page.addInitScript((key) => {
    localStorage.setItem(key, '{not-json');
  }, DRAFT_KEY);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await waitReady(page);
  if (errors.length) fail('G: 壊れた draft で起動不能', errors.join('; '));
  else ok('G: 壊れた draft でも起動');
  await page.close();
}

async function testH_OldVersion(browser) {
  const page = await browser.newPage();
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 0, data: { streamerName: '古い' } }));
  }, DRAFT_KEY);
  await waitReady(page);
  const snap = await snapshotEditor(page);
  if (snap.streamerName === '古い') fail('H: 古い version を復元してしまう');
  else ok('H: 古い version は無視');
  await page.close();
}

async function testEditKeyOverridesStaleDraft(browser) {
  const page = await browser.newPage();
  const sid = 'edit-key-draft-test';
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      streamerId: sid,
      data: {
        streamerName: '古い下書き',
        subtitle: '古い',
        streamerId: sid,
        selectedSongIds: [1],
        songMeta: {},
        tagPresets: [{ id: 'anime', label: 'アニメ' }],
        themeType: 'preset',
        presetIndex: 0,
        customHex: '#2a78d6',
        customColorConfigured: false,
      },
    }));
  }, DRAFT_KEY);
  await page.route(`**/api/streamer/${encodeURIComponent(sid)}/verify-edit-key`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route(`**/api/public/${encodeURIComponent(sid)}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        streamerName: 'サーバー公開データ',
        subtitle: '公開サブ',
        themeType: 'preset',
        presetIndex: 1,
        customHex: '#2a78d6',
        songs: [
          { k: 'あ', y: 'あい', a: 'AI', t: 'Story' },
          { k: 'あ', y: 'あい', a: 'AI', t: 'ハピネス' },
        ],
        songMeta: {},
        tagPresets: [{ id: 'anime', label: 'アニメ' }],
      }),
    });
  });
  await waitReady(page);
  await page.evaluate(() => setOnlineMode('edit-key', { openPanel: true }));
  await page.fill('#editKeyStreamerIdInput', sid);
  await page.fill('#editKeyInput', 'user-edit-key');
  await page.click('#editKeyVerifyBtn');
  await page.waitForFunction(() => (document.getElementById('streamerName')?.value || '') === 'サーバー公開データ', { timeout: 10000 });
  const snap = await snapshotEditor(page);
  if (snap.streamerName !== 'サーバー公開データ' || snap.selectedCount !== 2) {
    fail('編集キー読込が古い下書きに負ける', JSON.stringify(snap));
  } else ok('編集キー読込はサーバー優先');
  const raw = await readDraft(page);
  if (!raw || !raw.includes('サーバー公開データ')) fail('編集キー読込後 draft 更新');
  else ok('編集キー読込後 draft 更新');
  assertDraftSecurity(raw);
  await page.close();
}

async function testDraftStatusLayout(browser) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await waitReady(page);
    await fillBasicEditor(page, { suffix: `w${width}`, songCount: 1 });
    const layout = await page.evaluate(() => {
      const status = document.getElementById('draftSaveStatus');
      const publish = document.getElementById('publishBtn');
      return {
        status: status?.textContent?.trim() ?? '',
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        publishVisible: publish ? publish.getBoundingClientRect().width > 0 : false,
      };
    });
    if (layout.overflow) fail(`${width}px: 横スクロール`);
    else ok(`${width}px: 横スクロールなし`);
    if (!layout.status.includes('下書き')) fail(`${width}px: 下書き表示`, layout.status);
    else ok(`${width}px: 下書き表示`);
    await page.close();
  }
}

async function runFileChecks() {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!index.includes("const DRAFT_STORAGE_KEY = 'utalis_draft_v1'")) fail('index: DRAFT_STORAGE_KEY');
  else ok('index: DRAFT_STORAGE_KEY');
  if (!index.includes('この端末に下書き保存済み')) fail('index: 下書き表示文言');
  else ok('index: 下書き表示文言');
  if (index.includes('localStorage.setItem(SESSION_TOKEN_KEY') && index.includes('DRAFT_STORAGE_KEY')) {
    ok('index: draft と sessionStorage 分離');
  }
  const guide = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
  if (!guide.includes('この端末に下書き保存済み')) fail('guide: 下書き説明');
  else ok('guide: 下書き説明');
  const privacy = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
  if (!privacy.includes('localStorage')) fail('privacy: localStorage 記載');
  else ok('privacy: localStorage 記載');
}

async function main() {
  console.log('=== test-draft-autosave.mjs ===\n');
  await runFileChecks();
  const browser = await chromium.launch();
  try {
    await testA_ReloadRestore(browser);
    await testB_MarksTags(browser);
    await testC_NewSession(browser);
    await testD_GoogleLogin(browser);
    await testE_Publish(browser);
    await testF_PostPublishEdit(browser);
    await testG_BrokenDraft(browser);
    await testH_OldVersion(browser);
    await testEditKeyOverridesStaleDraft(browser);
    await testDraftStatusLayout(browser);
  } finally {
    await browser.close();
  }
  console.log('');
  if (failed) {
    console.error(`${failed} 件失敗`);
    process.exit(1);
  }
  console.log('すべて成功');
}

main().catch((e) => { console.error(e); process.exit(1); });
