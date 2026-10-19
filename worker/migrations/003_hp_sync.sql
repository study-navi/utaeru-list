-- HP sync: 利用者が好きなタイミングで自分のHPへ「歌える曲リスト」を反映する機能
-- Safe to run on production: CREATE IF NOT EXISTS only. 既存テーブルには一切触れません。
--
--   wrangler d1 execute utaeru-db --remote --file=migrations/003_hp_sync.sql
--
-- hp_links     : 「どのUtaemo公開ページ(streamer_id)が、どのHPに連携しているか」。制作者(管理者)だけが作成・解除する。
-- hp_published : HPが読む「最後に反映が成功した公開データ」。Utaemoの編集中データとは完全に別管理。
--                反映は1行のUPSERT(revisionによる楽観ロック)なので、失敗しても前回の行がそのまま残る。

CREATE TABLE IF NOT EXISTS hp_links (
  link_id     TEXT PRIMARY KEY,           -- HP側の読み込みコードに書く公開ID(秘密ではない。知っていても更新はできない)
  streamer_id TEXT NOT NULL UNIQUE,       -- 更新できる本人 = このUtaemo公開ページIDの所有者(Google or 編集キー)
  hp_name     TEXT NOT NULL,              -- 画面に表示する連携先HP名
  hp_url      TEXT NOT NULL,              -- 「反映後のHPを開く」リンク先
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hp_published (
  link_id      TEXT PRIMARY KEY REFERENCES hp_links(link_id),
  revision     INTEGER NOT NULL,          -- 反映のたびに +1。同時更新・連打の検出に使う
  published_at TEXT NOT NULL,             -- 最終反映日時 (ISO 8601 / UTC)
  song_count   INTEGER NOT NULL,
  data         TEXT NOT NULL              -- JSON: 公開用の曲配列のみ (t, a, y, ty, genres)
);
