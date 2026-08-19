/**
 * 曲名読み (ty/tk) ユーティリティ
 * - k/y はアーティスト読み（既存）
 * - ty/tk は曲名読み（今回追加）
 */

export function toHiragana(str) {
  return str.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function norm(str) {
  return toHiragana(str).toLowerCase();
}

/** カタログ特殊形式: あ,アーティスト,曲名 → 曲名（読み生成用） */
export function parseCommaCatalogTitle(t) {
  const parts = t.split(',');
  if (parts.length >= 3 && /^[ぁ-ん]$/.test(parts[0])) {
    return { head: parts[0], readingPrefix: parts[1], display: parts.slice(2).join(',') };
  }
  return null;
}

/** 表示用曲名（検索・キー用 t はそのまま、読み生成用に整形） */
export function titleForReading(t) {
  const comma = parseCommaCatalogTitle(t);
  if (comma) return comma.display;
  // 副題括弧を除いた主題部分
  let main = t.split(/\s*[（(]/)[0].trim();
  // feat./CV 等の後半を除去
  main = main.replace(/\s+(feat\.|featuring|CV:|cv:|with\s|＆|&).+$/i, '').trim();
  return main || t;
}

/** 括弧内ひらがな/カタカナ読み */
export function readingFromParentheses(t) {
  const m = t.match(/[（(]([ぁ-んァ-ヶー・\s]+)[）)]/);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw || /[A-Za-z0-9]/.test(raw)) return null;
  return norm(raw.replace(/\s+/g, ''));
}

const HAS_KANJI = /[\u4E00-\u9FFF]/;
const HAS_KANA = /[\u3040-\u309F\u30A0-\u30FF]/;

/** 漢字を含まない曲名は機械変換せずそのまま読みにできる */
export function deriveTitleReadingSafe(t) {
  const comma = parseCommaCatalogTitle(t);
  if (comma) {
    const ty = norm(comma.readingPrefix + toHiragana(comma.display));
    return ty || null;
  }
  const fromParen = readingFromParentheses(t);
  if (fromParen && !HAS_KANJI.test(titleForReading(t).replace(/[（(][^）)]+[）)]/g, ''))) {
    return fromParen;
  }
  const main = titleForReading(t);
  if (HAS_KANJI.test(main)) return null;
  if (!main) return null;
  if (HAS_KANA.test(main)) return norm(toHiragana(main));
  if (/^[A-Za-z0-9\s.+!?&'"-]+$/.test(main)) return norm(main);
  return null;
}

export function firstKanaChar(ty) {
  if (!ty) return null;
  const ch = [...ty][0];
  return ch || null;
}

export function buildTitleLookup(songs) {
  const lookup = {};
  for (const s of songs) {
    if (!s?.a || !s?.t || !s.ty) continue;
    lookup[s.a + '\u0001' + s.t] = { ty: s.ty, tk: s.tk || firstKanaChar(s.ty) };
  }
  return lookup;
}

export function getSongTitleReading(s, lookup) {
  if (s.ty) return { ty: s.ty, tk: s.tk || firstKanaChar(s.ty) };
  const hit = lookup?.[s.a + '\u0001' + s.t];
  if (hit) return hit;
  return null;
}
