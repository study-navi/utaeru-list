/**
 * MASTER_SONGS から公開 viewer 用ジャンル辞書を生成する。
 * キー: artist + "\u0001" + title（keyOf と同一）
 */
export function buildGenreLookup(songs) {
  const lookup = {};
  for (const s of songs) {
    if (!s || !s.a || !s.t) continue;
    const genres = Array.isArray(s.genres) ? s.genres.filter(Boolean) : [];
    if (genres.length) {
      lookup[s.a + '\u0001' + s.t] = genres;
    }
  }
  return lookup;
}

export function parseMasterSongsFromIndexHtml(html) {
  const match = html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/);
  if (!match) throw new Error('MASTER_SONGS not found in index.html');
  return eval(match[1]);
}
