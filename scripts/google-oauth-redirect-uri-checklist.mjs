#!/usr/bin/env node
/**
 * Google OAuth redirect_uri 確認用（Console 登録チェックリスト）
 */
const CLIENT_ID = '580845367374-ep76c8sqpo5g57lsjc63n08p92s99prd.apps.googleusercontent.com';

const REDIRECT_URIS = [
  'https://utalis.github.io/',
  'https://utalis.github.io/index.html',
  'https://study-navi.github.io/utaeru-list/',
  'https://study-navi.github.io/utaeru-list/index.html',
];

const JS_ORIGINS = [
  'https://utalis.github.io',
  'https://study-navi.github.io',
];

console.log('=== Google OAuth Client 設定チェックリスト ===\n');
console.log('Client ID:', CLIENT_ID);
console.log('\nConsole URL:');
console.log('https://console.cloud.google.com/apis/credentials/oauthclient/' + CLIENT_ID);
console.log('\n【Authorized redirect URIs】（In-App Browser の implicit フローに必須・完全一致）');
for (const uri of REDIRECT_URIS) console.log('  -', uri);
console.log('\n本番で送信する redirect_uri（コード正規化後）:');
console.log('  - https://utalis.github.io/');
console.log('  （/index.html から開いても同じ URI を送ります）');
console.log('\n【Authorized JavaScript origins】（Safari / PC の GIS ポップアップ用）');
for (const origin of JS_ORIGINS) console.log('  -', origin);
console.log('\n旧実装（修正前）の問題:');
console.log('  location.origin + location.pathname により');
console.log('  https://utalis.github.io/ と https://utalis.github.io/index.html が混在 → mismatch の原因');
