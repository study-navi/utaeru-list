/**
 * 曲名読みの手動上書き（kuroshiro では不適切な表記・記号曲名など）
 * キー: artist + "\u0001" + title（keyOf と同一）
 */
export const OVERRIDES = {
  // 記号・略称はカタログ表記に合わせる
  'AI\u0001Story': 'story',
  '相川七瀬\u0001Sweet Emotion': 'sweetemotion',
  'aiko\u0001KissHug': 'kisshug',
  'aiko\u0001milk': 'milk',
};
