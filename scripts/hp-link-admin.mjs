#!/usr/bin/env node
/**
 * HP連携の初回設定用 CLI(制作者専用)。
 *
 *   export UTAEMO_HP_ADMIN_TOKEN='...'      # Worker の secret HP_ADMIN_TOKEN と同じ値。コマンド引数には渡さない
 *   node scripts/hp-link-admin.mjs list
 *   node scripts/hp-link-admin.mjs link   --link-id ante-hp --streamer <UtaemoのページID> \
 *                                         --name "あんて｡ OFFICIAL STAGE" --url https://ante-stage.github.io/songs.html
 *   node scripts/hp-link-admin.mjs status --link-id ante-hp        # HPが読む公開フィードの現在の内容(認証不要)
 *   node scripts/hp-link-admin.mjs unlink --link-id ante-hp --yes  # 連携の解除
 *
 * 任意: UTAEMO_API_BASE (既定 https://utaeru-api.manabit.workers.dev)
 */

const API_BASE = (process.env.UTAEMO_API_BASE || 'https://utaeru-api.manabit.workers.dev').replace(/\/+$/, '');
const TOKEN = process.env.UTAEMO_HP_ADMIN_TOKEN || '';

const ERRORS = {
  unauthorized: '管理者トークンが違います(UTAEMO_HP_ADMIN_TOKEN / Worker の HP_ADMIN_TOKEN を確認)。',
  rate_limited: '操作が多すぎます。少し待ってからもう一度。',
  invalid_link_id: 'リンクIDは半角英小文字・数字・ハイフン(3〜40文字、先頭末尾と連続のハイフン不可)です。',
  invalid_streamer_id: 'UtaemoのページIDの形式が正しくありません。',
  reserved_streamer_id: 'そのIDは予約されています。',
  streamer_not_found: 'そのUtaemoページIDは公開されていません。利用者がUtaemoで一度「公開する」を済ませている必要があります。',
  streamer_unowned: 'そのUtaemoページには所有者(Googleアカウント/編集キー)がいません。',
  page_unpublished: 'そのUtaemoページは削除(非公開)されています。',
  link_id_in_use: 'そのリンクIDは別のUtaemoページに紐づいています。別のリンクIDにしてください。',
  streamer_already_linked: 'そのUtaemoページはすでに別のHPに連携しています。先に unlink してください。',
  migration_required: 'D1のマイグレーション(worker/migrations/003_hp_sync.sql)が未適用です。',
  not_found: '見つかりません。',
};

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

async function api(method, path, body, { admin = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (admin) headers['X-Utaeru-Admin-Token'] = TOKEN;
  const res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { res, data };
}

function die(message) {
  console.error(`エラー: ${message}`);
  process.exit(1);
}

function explain(res, data) {
  const code = data && data.error;
  return `${ERRORS[code] || '失敗しました。'} (HTTP ${res.status}${code ? `, ${code}` : ''}${data && data.message ? `: ${data.message}` : ''})`;
}

function requireToken() {
  if (!TOKEN) die('環境変数 UTAEMO_HP_ADMIN_TOKEN が未設定です。');
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (cmd === 'list') {
  requireToken();
  const { res, data } = await api('GET', '/api/admin/hp-links');
  if (!res.ok) die(explain(res, data));
  if (!data.links.length) console.log('連携はまだありません。');
  for (const l of data.links) {
    console.log(`${l.linkId}  ←  Utaemo「${l.streamerId}」  ${l.hpName}  ${l.hpUrl}`);
    console.log(`    最終反映: ${l.publishedAt || '(まだ反映されていません)'}  曲数: ${l.songCount ?? '-'}  revision: ${l.revision ?? '-'}`);
  }
} else if (cmd === 'link') {
  requireToken();
  const linkId = args['link-id'];
  if (!linkId || !args.streamer || !args.name || !args.url) {
    die('必要な指定: --link-id, --streamer, --name, --url');
  }
  const { res, data } = await api('PUT', `/api/admin/hp-links/${encodeURIComponent(linkId)}`, {
    streamerId: args.streamer, hpName: args.name, hpUrl: args.url,
  });
  if (!res.ok) die(explain(res, data));
  console.log(`${data.created ? '連携を作成しました' : '連携を更新しました'}: ${data.linkId} ← Utaemo「${data.streamerId}」 (${data.hpName})`);
  console.log(`HP側の読み込み先: ${API_BASE}/api/hp/${data.linkId}/songs`);
  console.log('次の手順: 利用者がUtaemoの「管理」タブ → HP連携 →「HPに反映する」を押すと、HPに表示されます。');
} else if (cmd === 'status') {
  const linkId = args['link-id'];
  if (!linkId) die('必要な指定: --link-id');
  const { res, data } = await api('GET', `/api/hp/${encodeURIComponent(linkId)}/songs`, undefined, { admin: false });
  if (res.status === 404) {
    console.log('まだ反映されていません(または連携がありません)。HPは従来のデータ元を表示します。');
  } else if (!res.ok) {
    die(explain(res, data));
  } else {
    console.log(`revision ${data.revision} / ${data.songCount}曲 / 最終反映 ${data.publishedAt}`);
    console.log(data.songs.slice(0, 10).map((s) => `  ・${s.t} / ${s.a}${s.genres && s.genres.length ? ` [${s.genres.join(', ')}]` : ''}`).join('\n'));
    if (data.songs.length > 10) console.log(`  …ほか ${data.songs.length - 10} 曲`);
  }
} else if (cmd === 'unlink') {
  requireToken();
  const linkId = args['link-id'];
  if (!linkId) die('必要な指定: --link-id');
  if (args.yes !== true) {
    die('連携を解除すると、HPは従来のデータ元の曲リストに戻ります(Utaemo側の編集データは消えません)。実行するには --yes を付けてください。');
  }
  const { res, data } = await api('DELETE', `/api/admin/hp-links/${encodeURIComponent(linkId)}`);
  if (!res.ok) die(explain(res, data));
  console.log(`連携を解除しました: ${data.linkId}`);
} else {
  console.log('使い方: node scripts/hp-link-admin.mjs <list | link | status | unlink> [オプション]');
  console.log('詳しくはファイル先頭のコメント、または docs/hp-sync-setup.md を参照してください。');
  process.exit(cmd ? 1 : 0);
}
