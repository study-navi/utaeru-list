/**
 * MASTER_SONGS 標準ジャンル分類ルール（保守的・曲単位）
 *
 * 採用ジャンル: J-POP / アニソン / ボカロ
 * 推測やアーティスト一括判定は行わない。判断できない曲は []。
 */

export const MASTER_GENRE_LABELS = ['J-POP', 'アニソン', 'ボカロ'];

/** @type {Set<string>} アーティスト名がこの一覧と一致する曲は、カタログ上すべてボカロ原曲として扱える */
export const VOCALOID_ONLY_ARTISTS = new Set([
  '40mP',
  'cosMo@暴走P',
  'DECO*27',
  'Kanaria',
  'kemu',
  'MARETU',
  'n-buna',
  'Neru',
  'Orangestar',
  'doriko',
  '八王子P',
  'かいりきベア',
  'きくお',
  'ぬゆり',
  'ピノキオピー',
  'みきとP',
  'すりぃ',
  'トーマ',
  'ハチ',
  '煮ル果実',
  'じん',
  'sasakure.UK',
]);

/** @type {RegExp} feat.初音ミク 等（flower は小文字 feat のみ。sumika「Flower」等を除外） */
export const VOCALOID_FEAT_RE = /feat\.?\s*(初音ミク|鏡音(?:リン|レン)|巡音ルカ|MEIKO|KAITO|可不(?:\(KAFU\))?|KAFU|flower|GUMI|MAYU|重音テト|結月ゆかり)/i;

/** @type {RegExp} タイトル内の明示的なアニメ・映画作品参照 */
export const EXPLICIT_ANIME_TITLE_RE = /(?:from|FROM)\s+[A-Z][A-Z\s\-]+|ONE PIECE|ドラゴンボール|鬼滅の刃|呪術廻戦|進撃の巨人|名探偵コナン|エヴァンゲリオン|ガンダム|ポケットモンスター|ポケモン|ジブリ|Disney|ディズニー|ウタ from/i;

/**
 * 曲 ID ごとの手動確認済みジャンル（最優先）
 * キー: id (number), 値: genres[]
 */
export const VERIFIED_GENRES_BY_ID = {
  // --- 米津玄師: ボカロ文化上の原曲のみ ---
  1863: ['J-POP', 'ボカロ'], // 砂の惑星(＋初音ミク)
  1864: ['ボカロ'], // ゴーゴー幽霊船（ハチ名義のVOCALOID曲）
  // --- Eve: いずれもVOCALOID原曲として知られる ---
  191: ['ボカロ'],
  192: ['ボカロ'],
  193: ['ボカロ'],
  195: ['ボカロ'],
  196: ['ボカロ'],
  197: ['ボカロ'],
  198: ['ボカロ'],
  // --- Ado ---
  89: ['J-POP', 'ボカロ'], // 桜日和とタイムマシン with 初音ミク
  70: ['J-POP', 'アニソン'],
  74: ['J-POP', 'アニソン'],
  75: ['J-POP', 'アニソン'],
  77: ['J-POP', 'アニソン'],
  78: ['J-POP', 'アニソン'],
  79: ['J-POP', 'アニソン'],
  81: ['J-POP', 'アニソン'],
  // --- YOASOBI: 確認済みアニメタイアップ ---
  1839: ['J-POP', 'アニソン'], // アイドル
  1841: ['J-POP', 'アニソン'], // 怪物
  1844: ['J-POP', 'アニソン'], // 祝福
  1845: ['J-POP', 'アニソン'], // 勇者
  1849: ['J-POP', 'アニソン'], // UNDEAD
  // --- LiSA ---
  1952: ['J-POP', 'アニソン'], // Catch the Moment (SAO)
  1953: ['J-POP', 'アニソン'], // Rising Hope
  1955: ['J-POP', 'アニソン'], // crossing field (SAO)
  1956: ['J-POP', 'アニソン'], // oath sign (Fate)
  1957: ['J-POP', 'アニソン'], // 紅蓮華
  1958: ['J-POP', 'アニソン'], // 炎
  // --- Aimer ---
  297: ['J-POP', 'アニソン'], // 残響散歌
  301: ['J-POP', 'アニソン'], // Re:I AM
  // --- 米津玄師: アニメタイアップ ---
  1856: ['J-POP', 'アニソン'], // ピースサイン (Naruto)
  1871: ['J-POP', 'アニソン'], // KICK BACK (Chainsaw Man)
  // --- Official髭男dism ---
  372: ['J-POP', 'アニソン'], // Subtitle (ONE PIECE FILM RED)
};

/** @type {Set<string>} アニソン付与時に J-POP も付ける一般アーティスト（ボカロ専門P名義は除外） */
function isVocaloidOnlyProducerArtist(artist) {
  if (VOCALOID_ONLY_ARTISTS.has(artist)) return true;
  for (const name of VOCALOID_ONLY_ARTISTS) {
    if (artist.startsWith(`${name} feat`) || artist.startsWith(`${name} ft`)) return true;
  }
  return false;
}

function normalizeGenreList(genres) {
  if (!Array.isArray(genres)) return [];
  const out = [];
  for (const g of genres) {
    if (MASTER_GENRE_LABELS.includes(g) && !out.includes(g)) out.push(g);
  }
  return out;
}

function addJPopIfNeeded(genres, artist) {
  if (!genres.includes('アニソン')) return genres;
  if (genres.includes('J-POP')) return genres;
  if (isVocaloidOnlyProducerArtist(artist)) return genres;
  return ['J-POP', ...genres];
}

/**
 * @param {{ id: number, a: string, t: string, genres?: string[] }} song
 * @returns {string[]}
 */
export function classifySongGenres(song) {
  if (VERIFIED_GENRES_BY_ID[song.id]) {
    return normalizeGenreList(VERIFIED_GENRES_BY_ID[song.id]);
  }

  const genres = [];
  const combined = `${song.a} ${song.t}`;

  if (isVocaloidOnlyProducerArtist(song.a)) {
    genres.push('ボカロ');
  } else if (VOCALOID_FEAT_RE.test(combined)) {
    // feat.初音ミク 等: 原曲がボカロ文化圏
    genres.push('ボカロ');
    if (!isVocaloidOnlyProducerArtist(song.a)) genres.push('J-POP');
  }

  if (EXPLICIT_ANIME_TITLE_RE.test(song.t)) {
    if (!genres.includes('アニソン')) genres.push('アニソン');
  }

  return normalizeGenreList(addJPopIfNeeded(genres, song.a));
}

/** @param {{ genres?: string[] }} song */
export function getSongGenres(song) {
  if (!song) return [];
  if (Array.isArray(song.genres)) return normalizeGenreList(song.genres);
  return [];
}

export function summarizeGenreStats(songs) {
  const stats = {
    total: songs.length,
    jpop: 0,
    anime: 0,
    vocaloid: 0,
    multi: 0,
    unclassified: 0,
  };
  for (const s of songs) {
    const g = getSongGenres(s);
    if (!g.length) {
      stats.unclassified += 1;
      continue;
    }
    if (g.length > 1) stats.multi += 1;
    if (g.includes('J-POP')) stats.jpop += 1;
    if (g.includes('アニソン')) stats.anime += 1;
    if (g.includes('ボカロ')) stats.vocaloid += 1;
  }
  return stats;
}
