/**
 * 曲名読みの手動上書き（kuroshiro では不適切な表記・記号曲名など）
 * キー: artist + "\u0001" + title（keyOf と同一）
 */
export const OVERRIDES = {
  // 英語曲名は外来語のひらがな読み（アルファベットのままにしない）
  'AI\u0001Story': 'すとーりー',
  '相川七瀬\u0001Sweet Emotion': 'すいーとえもーしょん',
  'aiko\u0001KissHug': 'きすはぐ',
  'aiko\u0001milk': 'みるく',
};
