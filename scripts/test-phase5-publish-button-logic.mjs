#!/usr/bin/env node
/**
 * Phase 5: 公開ボタン有効化ロジックの静的チェック（editKeyVerified が setOnlineMode で消えないこと）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let passed = 0;
let failed = 0;
function ok(m) { passed++; console.log(`OK: ${m}`); }
function fail(m) { failed++; console.error(`FAIL: ${m}`); }

if (/setOnlineMode\('edit-key'\);\s*\n\s*editKeyVerified = true/.test(html)) {
  ok('verify 成功時: setOnlineMode の後に editKeyVerified = true');
} else {
  fail('verify 成功時の editKeyVerified 設定順序が不正');
}

if (/if \(onlineMode !== mode\)[\s\S]*editKeyVerified = false/.test(html)) {
  ok('setOnlineMode: モード変更時のみ editKeyVerified をリセット');
} else {
  fail('setOnlineMode が常に editKeyVerified をリセットしている可能性');
}

if (/editKeyVerifiedStreamerId/.test(html)) {
  ok('editKeyVerifiedStreamerId による streamerId 紐付けあり');
} else {
  fail('editKeyVerifiedStreamerId が未定義');
}

if (/sidMatchesVerified/.test(html)) {
  ok('updatePublishButtonState: 認証済み streamerId 一致チェックあり');
} else {
  fail('updatePublishButtonState に streamerId 一致チェックなし');
}

if (failed) process.exit(1);
console.log(`\nすべて成功（${passed} 件）`);
