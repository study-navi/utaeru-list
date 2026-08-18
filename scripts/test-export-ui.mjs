#!/usr/bin/env node
/**
 * HTML書き出しUIの配置回帰（管理タブへ移動・公開ボタン維持）
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');
const WIDTHS = [320, 375, 390, 430, 1280];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function runViewport(width) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });

  const label = `${width}px`;
  const layout = await page.evaluate(() => {
    const exportBtn = document.getElementById('exportBtn');
    const exportBar = document.querySelector('.export-bar');
    const publishBtn = document.getElementById('publishBtn');
    const inBar = exportBar?.contains(exportBtn);
    const inManage = document.getElementById('panelMore')?.contains(exportBtn);
    const hint = document.querySelector('#panelMore .ui-field-group h3 + .hint')?.textContent || '';
    const backupHeading = [...document.querySelectorAll('#panelMore h3')].map((h) => h.textContent?.trim());
    const publishStyle = publishBtn ? getComputedStyle(publishBtn) : null;
    const exportStyle = exportBtn ? getComputedStyle(exportBtn) : null;
    return {
      inBar,
      inManage,
      btnText: exportBtn?.textContent?.trim() || '',
      backupHeading,
      hintNearBtn: exportBtn?.closest('.ui-field-group')?.querySelector('.hint')?.textContent || '',
      publishVisible: publishBtn && publishBtn.offsetParent !== null,
      publishPrimary: publishBtn?.classList.contains('bar-btn-primary'),
      exportIsToolBtn: exportBtn?.classList.contains('tool-btn'),
      publishFontSize: publishStyle ? parseFloat(publishStyle.fontSize) : 0,
      exportFontSize: exportStyle ? parseFloat(exportStyle.fontSize) : 0,
      docScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  if (!layout.inBar && layout.inManage) ok(`${label}: 書き出しボタンは管理タブ内`);
  else fail(`${label}: 書き出しボタンは管理タブ内`, JSON.stringify({ inBar: layout.inBar, inManage: layout.inManage }));
  if (layout.btnText === 'HTMLファイルとして保存') ok(`${label}: ボタン名`);
  else fail(`${label}: ボタン名`, layout.btnText);
  if (layout.backupHeading.includes('バックアップ・書き出し')) ok(`${label}: セクション見出し`);
  else fail(`${label}: セクション見出し`, JSON.stringify(layout.backupHeading));
  if (layout.hintNearBtn.includes('通常の編集では、この操作は必要ありません')) ok(`${label}: 補足説明`);
  else fail(`${label}: 補足説明`, layout.hintNearBtn);
  if (layout.publishVisible && layout.publishPrimary) ok(`${label}: 公開するは主要ボタン`);
  else fail(`${label}: 公開するは主要ボタン`, JSON.stringify(layout));
  if (layout.exportIsToolBtn && layout.publishFontSize >= layout.exportFontSize) ok(`${label}: 書き出しは公開より目立たない`);
  else fail(`${label}: 書き出しは公開より目立たない`, JSON.stringify(layout));
  if (!layout.docScroll) ok(`${label}: 横スクロールなし`);
  else fail(`${label}: 横スクロール`);

  await page.click('#editTabMore');
  await page.waitForTimeout(100);
  const manageScroll = await page.evaluate(() =>
    document.getElementById('panelMore')?.scrollWidth > document.getElementById('panelMore')?.clientWidth
  );
  if (!manageScroll) ok(`${label}: 管理タブ横スクロールなし`);
  else fail(`${label}: 管理タブ横スクロール`);

  await page.click('#editTabBasic');
  await page.fill('#streamerName', '書き出しテスト');
  await page.evaluate(() => {
    selectedKeys.clear();
    for (const s of MASTER_SONGS.slice(0, 1)) selectedKeys.add(keyOf(s));
    updateSelectedCount();
  });
  await page.click('#editTabMore');
  const enabled = await page.evaluate(() => !document.getElementById('exportBtn').disabled);
  if (enabled) ok(`${label}: 書き出しボタン有効化`);
  else fail(`${label}: 書き出しボタン有効化`);

  if (!errors.length) ok(`${label}: Consoleエラーなし`);
  else fail(`${label}: Consoleエラー`, errors.join('; '));

  await browser.close();
}

async function testExportLogic() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof b64ToUtf8 === 'function', { timeout: 15000 });
  const hasTemplate = await page.evaluate(() => !!document.getElementById('viewer-template-b64')?.textContent?.trim());
  const hasHandler = await page.evaluate(() => !!document.getElementById('exportBtn'));
  if (hasTemplate) ok('書き出し: viewer-template 維持');
  else fail('書き出し: viewer-template 維持');
  if (hasHandler) ok('書き出し: exportBtn イベント維持');
  else fail('書き出し: exportBtn イベント維持');
  await browser.close();
}

async function main() {
  console.log('=== test-export-ui.mjs ===\n');
  for (const width of WIDTHS) await runViewport(width);
  await testExportLogic();
  console.log('');
  if (failed) {
    console.error(`${failed} 件失敗`);
    process.exit(1);
  }
  console.log('すべて成功');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
