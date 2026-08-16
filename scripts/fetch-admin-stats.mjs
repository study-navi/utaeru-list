#!/usr/bin/env node
/**
 * Utalis 運営統計 CLI（Phase 7）
 *
 * 使い方:
 *   UTALIS_ADMIN_STATS_TOKEN=... node scripts/fetch-admin-stats.mjs
 */
const API = process.env.UTALIS_API_BASE || 'https://utaeru-api.manabit.workers.dev';
const TOKEN = process.env.UTALIS_ADMIN_STATS_TOKEN || '';

if (!TOKEN) {
  console.error('UTALIS_ADMIN_STATS_TOKEN が未設定です（Cloudflare Worker Secret をローカルに設定して実行）');
  process.exit(1);
}

const res = await fetch(API + '/api/admin/stats', {
  headers: { 'X-Utaeru-Admin-Token': TOKEN },
});
const text = await res.text();
let data;
try { data = JSON.parse(text); } catch { data = { raw: text }; }

if (!res.ok) {
  console.error('取得失敗:', res.status, data);
  process.exit(1);
}

console.log('Utalis 管理統計');
console.log('生成:', data.generatedAt);
console.log('');
console.log('公開ページ　　　', data.publicPages);
console.log('削除済みページ　', data.deletedPages);
console.log('Google管理　　　', data.googleManagedPages);
console.log('編集キー管理　　', data.editKeyManagedPages);
console.log('登録ユーザー　　', data.registeredUsers);
console.log('登録曲数　　　　', data.registeredSongs);
console.log('直近7日作成　　 ', data.createdLast7Days);
console.log('直近30日作成　　', data.createdLast30Days);
