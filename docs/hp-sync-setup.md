# HP連携（「HPに反映する」）初回設定手順

利用者のHPごとに **制作者が1回だけ** 設定します。設定後は、利用者が Utaemo で曲を編集して「HPに反映する」を押すだけで、制作者への依頼やコード編集は不要です。連携していない利用者は従来どおり使えます。

## しくみ（要点）
- 利用者が押すと、Utaemo が曲リスト（曲名・アーティスト・読み・ジャンルのみ）を Worker の D1 に保存します。HPはその「最後に反映成功したデータ」を読み込みます。編集中のデータには触れません。
- 更新できるのは、その Utaemo ページの所有者（Googleログイン／編集キー）だけです。リンクID（HPのコードに書く公開ID）を知っていても更新できません。
- 秘密鍵・GitHubトークンはブラウザにもHPにも置きません（`HP_ADMIN_TOKEN` は制作者のPCと Worker の secret のみ）。
- サーバー側（Worker + D1）が必要な理由：静的サイト（GitHub Pages）だけでは「本人だけが更新できる」認証と、失敗時に前回データを残す保存先を安全に持てないため。既存の Worker/D1/認証をそのまま使います。

## 初回設定（全HP共通・1回だけ）
1. D1 にテーブルを追加（既存テーブルには触れません）  
   `cd worker && wrangler d1 execute utaeru-db --remote --file=migrations/003_hp_sync.sql`
2. 管理者トークンを設定（16文字以上のランダム値。控えを安全な場所に）  
   `wrangler secret put HP_ADMIN_TOKEN`
3. Worker をデプロイ：`wrangler deploy`
4. `index.html`（Utaemo本体）をデプロイ（GitHub Pages へ push）

## HPごとの連携（例：あんて｡ OFFICIAL STAGE）
1. 利用者が Utaemo で一度「公開する」を済ませ、ページID（例 `ante`）を確認。
2. 制作者のPCで紐づけ：
   ```
   export UTAEMO_HP_ADMIN_TOKEN='（手順2のトークン）'
   node scripts/hp-link-admin.mjs link --link-id ante-hp --streamer <UtaemoのページID> \
     --name "あんて｡ OFFICIAL STAGE" --url https://ante-stage.github.io/songs.html
   ```
   リンクIDは半角英小文字・数字・ハイフン。HPごとに別の値にします。
3. HP側に読み込みコードを入れる：`docs/hp-patches/ante-stage-utaemo-feed.patch`
   （`ante-stage.github.io` で `git apply` → push。`assets/site.js` と各HTMLの `?v=`、`version.json` が変わります）。
   読み込み先は `https://utaeru-api.manabit.workers.dev/api/hp/<リンクID>/songs`。
   他のHPに使うときは、パッチ内の `ante-hp` とデータの取り込み部分を、そのHPの表示形式に合わせます。
4. 反映前のHPは従来のデータ元の表示のまま（404のときは従来データを使う作りです）。

## 利用者の操作
Utaemo → 曲を編集 → 「管理」タブ（または上部の「HP 反映待ち」）→ **HPに反映する** → 追加/変更/削除の件数と曲名を確認 → **この内容で反映する** → 「HPに反映しました」。  
編集しただけではHPは変わりません。0曲で反映するときは「全曲が非表示になることを理解しました」のチェックが必要です。

## 確認方法
- 制作者：`node scripts/hp-link-admin.mjs status --link-id ante-hp`（公開中の件数・最終反映・先頭10曲）
- HP：ページを開き直す（またはHPの「更新」ボタン）で新しい曲リストが出ることを確認。
- 失敗時：HPは最後に成功した内容（端末に保存した直近の取得分、無ければ従来データ）を表示します。

## 連携の解除・ロールバック
- 解除：`node scripts/hp-link-admin.mjs unlink --link-id ante-hp --yes`（HPは従来のデータ元に戻る。Utaemo側の編集データは消えない）
- HP側を戻す：パッチを `git apply -R`。
- 機能ごと外す：`worker/migrations/003_hp_sync_down.sql`（全連携データが消えます）。

## 注意
- あんてHPの管理画面で曲を直接編集（`ante_save_songs`）する運用は、連携中は表示に反映されなくなります（Utaemoが優先）。連携後は Utaemo 側で編集してください。
- HPの「隠す」設定（曲単位の非表示）は従来どおり効きます。

## テスト
- Worker：`node --disable-warning=ExperimentalWarning scripts/test-hp-sync-worker.mjs`
- UI（要 Chromium）：`PW_CORE=<playwright-coreのパス> node scripts/test-hp-sync-ui.mjs`
