-- Rollback HP sync (manual use only).
-- HP連携の公開データと紐づけがすべて消えます。HP側は従来のデータ元に自動で戻ります。
DROP TABLE IF EXISTS hp_published;
DROP TABLE IF EXISTS hp_links;
