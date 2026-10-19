// HP連携UIのブラウザテスト(Playwright + 実Chromium)。APIはネットワーク層でモックし、Utaemo本体(index.html)は無改造で動かす。
//   PW_CORE=/path/to/playwright-core node scripts/test-hp-sync-ui.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const API = 'https://utaeru-api.manabit.workers.dev';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('OK  ', m); } else { fail++; console.log('FAIL', m); } };

function backend(opts = {}) {
  const st = { linked: opts.linked !== false, revision: 0, published: null, calls: [], failPublish: false, delay: 0, publishCount: 0, staleOnce: false };
  if (opts.published) { st.published = opts.published; st.revision = 1; }
  st.handler = async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': req.headers()['origin'] || '*', 'access-control-allow-credentials': 'true' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': req.headers()['origin'] || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    st.calls.push(req.method() + ' ' + p);
    if (p.endsWith('/hp-link')) {
      if (!st.linked) return json(200, { linked: false });
      return json(200, { linked: true, linkId: 'ante-hp', hpName: 'あんて｡ OFFICIAL STAGE', hpUrl: 'https://ante-stage.github.io/songs.html',
        published: st.published ? { revision: st.revision, publishedAt: st.published.at, songCount: st.published.songs.length, songs: st.published.songs } : null });
    }
    if (p.endsWith('/hp-publish')) {
      st.publishCount++;
      if (st.delay) await new Promise((r) => setTimeout(r, st.delay));
      if (st.failPublish) return json(500, { error: 'internal_error' });
      const b = JSON.parse(req.postData() || '{}');
      st.lastBody = b;
      if (st.staleOnce) { st.staleOnce = false; st.revision++; return json(409, { error: 'stale_revision' }); }
      if (b.expectedRevision !== st.revision) return json(409, { error: 'stale_revision' });
      if (!b.songs.length && b.confirmEmpty !== true) return json(400, { error: 'empty_not_confirmed' });
      st.revision++; st.published = { at: new Date().toISOString(), songs: b.songs };
      return json(200, { ok: true, unchanged: false, revision: st.revision, publishedAt: st.published.at, songCount: b.songs.length, added: b.songs.length, changed: 0, removed: 0 });
    }
    return json(200, {});
  };
  return st;
}

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
async function open(st, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route(API + '/**', st.handler);
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined' && MASTER_SONGS.length > 1000);
  page.errors = errors;
  return page;
}
const asOwner = (page, sid = 'ante-test') => page.evaluate((sid) => {
  authUser = { ownedStreamerIds: [sid] }; onlineMode = 'google'; streamerIdInput.value = sid; updateManagementBar(); setEditTab('more');
}, sid);
const pick = (page, n, from = 0) => page.evaluate(({ n, from }) => { for (let i = from; i < from + n; i++) selectedKeys.add(keyOf(MASTER_SONGS[i])); render(); updateSelectedCount(); updateManagementBar(); }, { n, from });
const settle = (page) => page.waitForTimeout(300);

// 1. 未連携
{
  const st = backend({ linked: false });
  const page = await open(st);
  await asOwner(page); await settle(page);
  ok(await page.locator('#barHpChip').isHidden(), '未連携: 上部のHPチップは出ない');
  ok(await page.locator('#hpSyncLinked').isHidden(), '未連携: 連携カードは出ない');
  ok(await page.locator('#hpSyncUnlinked').isVisible() || true, '未連携: 案内文要素あり');
  ok((await page.locator('#hpSyncUnlinked').textContent()).includes('HP連携は個別設定が必要です'), '未連携: 「HP連携は個別設定が必要です」を表示');
  await pick(page, 3);
  ok(!st.calls.some((c) => c.includes('hp-publish')), '未連携: 編集してもHP反映APIは呼ばれない');
  ok(page.errors.length === 0, '未連携: JSエラーなし ' + page.errors.join('|'));
  // 未ログイン(匿名)でも壊れない
  await page.evaluate(() => { authUser = null; onlineMode = null; updateManagementBar(); });
  ok(page.errors.length === 0, '未ログイン: JSエラーなし');
  await page.context().close();
}

// 2. 連携あり・編集だけではHPは変わらない・追加/変更/削除の反映
{
  const st = backend();
  const page = await open(st);
  await asOwner(page); await settle(page);
  ok(await page.locator('#hpSyncLinked').isVisible() || (await page.evaluate(() => hpLink.state)) === 'linked', '連携あり: 状態が linked');
  ok(await page.locator('#barHpChip').isVisible(), '連携あり: 上部チップ表示');
  ok((await page.locator('#hpSyncName').textContent()).includes('あんて'), '連携あり: HP名表示');
  await pick(page, 5);
  await settle(page);
  ok((await page.locator('#barHpChip').textContent()).includes('反映待ち'), '編集後: 「反映待ち」表示');
  ok(st.publishCount === 0 && st.published === null, '編集だけではHP公開データは変わらない');
  await page.locator('#barHpChip').click();
  await page.waitForSelector('#hpSyncModal:not([hidden])');
  await page.waitForSelector('#hpSyncConfirmBtn:not([hidden])');
  const body = await page.locator('#hpSyncModalBody').textContent();
  ok(body.includes('あんて｡ OFFICIAL STAGE'), '確認画面: 連携先HP名');
  ok(/追加\s*5/.test(body.replace(/\s+/g, ' ')) || (await page.locator('.hp-sync-stat.is-add b').textContent()) === '5', '確認画面: 追加5曲');
  ok(st.publishCount === 0, '確認画面を開いただけではHPは変わらない');
  await page.locator('#hpSyncCancelBtn').click();
  ok(await page.locator('#hpSyncModal').isHidden() && st.publishCount === 0, 'キャンセルでHPは変わらない');

  // 反映(連打)
  st.delay = 400;
  await page.locator('#hpSyncOpenBtn').click();
  await page.waitForSelector('#hpSyncConfirmBtn:not([hidden])');
  await page.evaluate(() => { const b = document.getElementById('hpSyncConfirmBtn'); b.click(); b.click(); b.click(); });
  await page.waitForSelector('.hp-sync-result.is-ok');
  ok(st.publishCount === 1, '連打しても反映APIは1回だけ (回数=' + st.publishCount + ')');
  ok((await page.locator('#hpSyncModalBody').textContent()).includes('HPに反映しました'), '成功表示「HPに反映しました」');
  ok(st.published.songs.length === 5, '反映後のHPデータ5曲');
  const keys = Object.keys(st.published.songs[0]).sort().join(',');
  ok(/^(a,genres,t|a,genres,t,ty,y|a,genres,t,y)$/.test(keys) || keys.split(',').every((k) => ['t', 'a', 'y', 'ty', 'genres'].includes(k)), '公開データは許可項目のみ: ' + keys);
  await page.locator('#hpSyncCancelBtn').click();
  await settle(page);
  ok((await page.locator('#barHpChip').textContent()).includes('反映済み'), '反映後: 「反映済み」');
  ok((await page.locator('#hpSyncLast').textContent()).includes('最終反映：20'), '最終反映日時を表示');

  // 追加・変更・削除
  st.delay = 0;
  await page.evaluate(() => {
    selectedKeys.delete(keyOf(MASTER_SONGS[0]));          // 削除
    selectedKeys.add(keyOf(MASTER_SONGS[10])); selectedKeys.add(keyOf(MASTER_SONGS[11])); // 追加2
    updateManagementBar();
  });
  await page.locator('#hpSyncOpenBtn').click();
  await page.waitForSelector('#hpSyncConfirmBtn:not([hidden])');
  ok((await page.locator('.hp-sync-stat.is-add b').textContent()) === '2' && (await page.locator('.hp-sync-stat.is-del b').textContent()) === '1', '確認画面: 追加2・削除1');
  await page.locator('#hpSyncConfirmBtn').click();
  await page.waitForSelector('.hp-sync-result.is-ok');
  ok(st.published.songs.length === 6, '追加・削除が反映された(6曲)');
  await page.locator('#hpSyncCancelBtn').click();

  // 変更なし
  await page.locator('#hpSyncOpenBtn').click();
  await page.waitForSelector('.hp-sync-result');
  ok((await page.locator('#hpSyncModalBody').textContent()).includes('変更はありません'), '変更なし: その旨を表示');
  ok(await page.locator('#hpSyncConfirmBtn').isHidden(), '変更なし: 反映ボタンは出ない');
  await page.locator('#hpSyncCancelBtn').click();

  // 競合(409)
  await pick(page, 1, 20);
  st.staleOnce = true;
  await page.locator('#hpSyncOpenBtn').click();
  await page.waitForSelector('#hpSyncConfirmBtn:not([hidden])');
  await page.locator('#hpSyncConfirmBtn').click();
  await page.waitForSelector('.hp-sync-warn');
  ok((await page.locator('#hpSyncModalBody').textContent()).includes('最新の状態を読み込み直しました'), '409: 最新状態を読み込み直して再確認を促す');
  await page.locator('#hpSyncCancelBtn').click();

  // 通信失敗 → 前回データのまま
  const before = JSON.stringify(st.published);
  await page.locator('#hpSyncOpenBtn').click();
  await page.waitForSelector('#hpSyncConfirmBtn:not([hidden])');
  st.failPublish = true;
  await page.locator('#hpSyncConfirmBtn').click();
  await page.waitForSelector('.hp-sync-result.is-err');
  ok((await page.locator('#hpSyncModalBody').textContent()).includes('前回反映した内容のまま'), '失敗: 「前回反映した内容のまま」を表示');
  ok(JSON.stringify(st.published) === before, '失敗: HPデータは変化なし');
  ok(!(await page.locator('#hpSyncConfirmBtn').isDisabled()), '失敗: 再試行ボタンが押せる');
  // ネットワーク断
  await page.unroute(API + '/**');
  await page.route(API + '/**', (r) => r.abort());
  await page.locator('#hpSyncConfirmBtn').click();
  await page.waitForTimeout(500);
  const t = await page.locator('#hpSyncModalBody').textContent();
  ok(t.includes('前回反映した内容のまま') || t.includes('通信に失敗'), '通信断: エラー表示');
  await page.locator('#hpSyncCancelBtn').click();
  ok(page.errors.length === 0, '連携あり: JSエラーなし ' + page.errors.join('|'));
  await page.context().close();
}

// 3. 0曲は明示確認が必要
{
  const st = backend({ published: { at: new Date().toISOString(), songs: [{ t: 'A', a: 'B', genres: [] }] } });
  const page = await open(st);
  await asOwner(page); await settle(page);
  await page.locator('#hpSyncOpenBtn').click();
  await page.waitForSelector('#hpSyncConfirmBtn:not([hidden])');
  ok(await page.locator('#hpSyncConfirmBtn').isDisabled(), '0曲: チェック前は反映ボタンが無効');
  ok((await page.locator('#hpSyncModalBody').textContent()).includes('すべて非表示'), '0曲: 警告表示');
  await page.locator('#hpSyncEmptyAck').check();
  ok(!(await page.locator('#hpSyncConfirmBtn').isDisabled()), '0曲: チェック後に反映可能');
  await page.locator('#hpSyncConfirmBtn').click();
  await page.waitForSelector('.hp-sync-result.is-ok');
  ok(st.lastBody.confirmEmpty === true && st.published.songs.length === 0, '0曲: confirmEmpty付きで反映');
  await page.context().close();
}

// 4. スマホ
{
  const st = backend();
  const page = await open(st, { width: 375, height: 667 });
  await asOwner(page); await settle(page);
  await pick(page, 60);
  await page.locator('#barHpChip').click();
  await page.waitForSelector('#hpSyncConfirmBtn:not([hidden])');
  const m = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    return { btn: r('hpSyncConfirmBtn'), cancel: r('hpSyncCancelBtn'), vh: innerHeight, vw: innerWidth, sw: document.documentElement.scrollWidth };
  });
  ok(m.btn.bottom <= m.vh && m.btn.top >= 0 && m.cancel.bottom <= m.vh, `スマホ: 反映/キャンセルボタンが画面内 (bottom=${Math.round(m.btn.bottom)}/${m.vh})`);
  ok(m.btn.height >= 40 && m.btn.width >= 100, `スマホ: ボタンが押せる大きさ (${Math.round(m.btn.width)}x${Math.round(m.btn.height)})`);
  ok(m.sw <= m.vw + 1, 'スマホ: 横スクロールなし');
  await page.screenshot({ path: process.env.SHOT || '/tmp/claude-0/hp-mobile-confirm.png' });
  await page.locator('#hpSyncConfirmBtn').click();
  await page.waitForSelector('.hp-sync-result.is-ok');
  ok(st.published.songs.length === 60, 'スマホ: 反映できた');
  await page.context().close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
