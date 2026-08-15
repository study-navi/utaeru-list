# 歌える曲リスト

配信者が「歌える曲リスト」を作成・公開するための静的 Web アプリです。  
サーバーやビルドツールは不要で、HTML ファイルをそのまま配布・閲覧できます。

## ファイル構成

| ファイル / ディレクトリ | 役割 |
|---|---|
| `index.html` | 配信者向けビルダー（曲選択・設定・HTML 書き出し） |
| `hiro.html` | 公開ページの具体例（配信者「ひろ」の 14 曲リスト） |
| `baseline/BASELINE.json` | 機能追加前の基準状態（件数・checksum・互換性契約） |
| `docs/builder-config.schema.json` | 再編集用設定 JSON のスキーマ定義 |
| `scripts/verify-baseline.mjs` | 基準状態・互換性の自動検証スクリプト |

## アーキテクチャ

```
index.html（ビルダー）
  ├─ MASTER_SONGS … 全楽曲カタログ（1,952 曲）
  ├─ 曲選択 UI
  └─ viewer-template-b64 … 公開ページ HTML のテンプレート（Base64）
         │
         ▼ 書き出し
{配信者名}_歌える曲リスト.html  （例: hiro.html）
  ├─ SONGS … 選択された曲
  └─ builder-config … 再編集用 JSON
         │
         ▼ インポート
index.html（設定・選択状態を復元）
```

### 公開ページを変更するときの注意（必読）

公開ページ（検索 UI・ランダム抽選・テーマ切り替えなど）の見た目や挙動を変える場合、**`hiro.html` だけを編集してはいけません。**

正本は `index.html` 内の **`#viewer-template-b64`**（Base64 エンコードされた HTML テンプレート）です。  
ビルダーの「ページを書き出す」はこのテンプレートを展開して HTML を生成します。

**推奨手順**

1. `#viewer-template-b64` をデコードしてテンプレート HTML を編集する
2. 編集後、再エンコードして `index.html` に戻す
3. ビルダーから `hiro.html` 相当のファイルを再書き出しするか、テンプレートと `hiro.html` の構造一致を検証する
4. `node scripts/verify-baseline.mjs --skip-checksums` で構造・互換性を確認する

`hiro.html` はリポジトリ内の公開サンプルです。テンプレートと乖離すると、次回書き出し時に変更が反映されなかったり、サンプルと実際の出力が食い違います。

### ビルダー UI を変更するとき

`index.html` の `<style>` 以降のビルダー専用 UI は、テンプレートとは別コードです。  
公開ページに影響しない変更であれば `index.html` のみ編集して構いません。

## データ形式（互換性契約）

以下は**変更禁止**とする契約です。破ると既存の書き出し HTML や再編集ができなくなります。

### 曲データフィールド

| 用途 | フィールド | 意味 |
|---|---|---|
| マスター（ビルダー内） | `id`, `k`, `y`, `a`, `t` | 内部 ID / 行頭かな / 読み / アーティスト / 曲名 |
| 書き出し（公開ページ） | `k`, `y`, `a`, `t` | 上記のうち `id` を除いた形式 |

`k`, `y`, `a`, `t` の**削除・リネームは不可**。追加フィールドは optional として後方互換で可能。

### 曲キー（選択状態の識別子）

```javascript
artist + "\u0001" + title
// 例: "aiko\u0001カブトムシ"
```

`index.html` の `keyOf()` と `builder-config.selected` で使用。区切り文字 `\u0001` は変更しない。

### builder-config（再編集用 JSON）

書き出し HTML 内に次の形式で埋め込まれます。

```html
<script type="application/json" id="builder-config">…</script>
```

| フィールド | 型 | 説明 |
|---|---|---|
| `streamerName` | string | 配信者名 |
| `subtitle` | string | サブタイトル |
| `themeType` | `"preset"` \| `"custom"` | テーマ種別 |
| `presetIndex` | number \| null | プリセット番号 |
| `customHex` | string \| null | カスタム色（`#RRGGBB`） |
| `selected` | string[] | 曲キーの配列 |

詳細: [`docs/builder-config.schema.json`](docs/builder-config.schema.json)

インポートは上記 `<script>` タグの存在と JSON パースに依存しています。  
タグの `id` / `type` や必須フィールドを変える場合は、**旧形式も読めるフォールバック**を必ず用意してください。

### viewer テンプレートのプレースホルダー

書き出し時に文字列置換されるプレースホルダー（削除・改名不可）:

- `__PAGE_TITLE__`, `__STREAMER_NAME__`, `__SUBTITLE__`
- `__ACCENT_LIGHT__`, `__ACCENT_LIGHT_INK__`, `__ACCENT_LIGHT_WASH__`
- `__ACCENT_DARK__`, `__ACCENT_DARK_INK__`, `__ACCENT_DARK_WASH__`
- `__SONGS_JSON__`, `__UPDATED_LABEL__`, `__BUILDER_CONFIG_JSON__`

## 基準状態（機能追加前）

2026-08-16 時点の状態を「機能追加前の基準状態」として記録しています。

| 項目 | 値 |
|---|---|
| Git コミット | `cba9d3d` |
| マスター楽曲数 | 1,952 曲（886 アーティスト） |
| カタログ更新日 | 2026/7/28 |
| サンプル `hiro.html` | 14 曲 |

機械可読な定義: [`baseline/BASELINE.json`](baseline/BASELINE.json)

意図的に HTML を変更した場合は、`baseline/BASELINE.json` の checksum / 件数を更新し、変更理由を CHANGELOG（下記）に記載してください。

## 互換性検証

機能追加・改修の前後で次を実行します。

```bash
# 基準状態（checksum 含む）との完全一致を確認
node scripts/verify-baseline.mjs

# HTML を意図的に変更した後、構造・互換性のみ確認
node scripts/verify-baseline.mjs --skip-checksums
```

検証内容:

- `index.html` / `hiro.html` の存在と checksum（オプション）
- `MASTER_SONGS` 件数・スキーマ・キー重複なし
- `builder-config` のパースと必須フィールド
- `SONGS` の `{ k, y, a, t }` スキーマ
- `viewer-template-b64` の全プレースホルダー
- `hiro.html` と viewer テンプレートの構造一致

## ローカルでの確認

ブラウザでファイルを直接開いて確認できます。

- ビルダー: `index.html`
- 公開ページ例: `hiro.html`

## 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-08-16 | 初回アップロード（`index.html` ビルダー、`hiro.html` サンプル） |
| 2026-08-16 | 基準状態の記録、README、互換性検証スクリプト、builder-config スキーマを追加（アプリ本体の仕様・見た目は変更なし） |

## 機能追加時のガイドライン

1. 作業前に `node scripts/verify-baseline.mjs` を実行し、起点が健全であることを確認する
2. 公開ページの変更は `#viewer-template-b64` を正本として行い、`hiro.html` を同期する
3. `builder-config` / 曲キー / `{ k, y, a, t }` の後方互換を維持する
4. 作業後に `--skip-checksums` 以上の検証を実行する
5. 意図的な仕様変更時は `baseline/BASELINE.json` と本 README の変更履歴を更新する

## データ提供元

Mirrativ（ミラティブ）内カラオケアプリ「エモカラ」の楽曲一覧（2026/7/28 時点のカタログ）をもとにしています。
