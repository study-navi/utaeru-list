/**
 * 曲名・アーティスト照合（新着バッチ ↔ MASTER_SONGS）
 */

export function normMatch(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[～〜]/g, '~')
    .replace(/[·・]/g, '')
    .replace(/[（）()【】\[\]「」『』《》]/g, '')
    .replace(/[…\.]+$/g, '')
    .trim();
}

export function songKey(artist, title) {
  return `${artist}\u0001${title}`;
}

export function buildMasterIndex(songs) {
  const byExact = new Map();
  const byNorm = new Map();
  for (const s of songs) {
    const k = songKey(s.a, s.t);
    byExact.set(k, s);
    const nk = `${normMatch(s.a)}|${normMatch(s.t)}`;
    if (!byNorm.has(nk)) byNorm.set(nk, []);
    byNorm.get(nk).push(s);
  }
  return { byExact, byNorm };
}

export function matchBatchEntry(entry, index) {
  const { byExact, byNorm } = index;
  const exactKey = songKey(entry.artist, entry.title);
  if (byExact.has(exactKey)) {
    return { status: 'registered', song: byExact.get(exactKey), matchType: 'exact' };
  }
  const nk = `${normMatch(entry.artist)}|${normMatch(entry.title)}`;
  const normHits = byNorm.get(nk) || [];
  if (normHits.length === 1) {
    return { status: 'registered', song: normHits[0], matchType: 'normalized' };
  }
  if (normHits.length > 1) {
    return { status: 'needs_review', reason: '正規化一致が複数', candidates: normHits };
  }

  // 部分一致（タイトル前方一致 + アーティスト正規化一致）— 切れ曲名用
  if (entry.titleNeedsReview) {
    const na = normMatch(entry.artist);
    const nt = normMatch(entry.title.replace(/….*$/, '').replace(/\.\.\.+.*$/, ''));
    const partial = [];
    for (const [key, list] of index.byNorm.entries()) {
      const [aPart, tPart] = key.split('|');
      if (aPart === na && tPart.startsWith(nt) && nt.length >= 8) {
        partial.push(...list);
      }
    }
    if (partial.length === 1) {
      return { status: 'registered', song: partial[0], matchType: 'partial-title' };
    }
    if (partial.length > 1) {
      return { status: 'needs_review', reason: '部分一致が複数', candidates: partial };
    }
  }

  return { status: 'unregistered', reason: 'MASTER_SONGSに未登録' };
}

export function matchBatchEntries(entries, songs) {
  const index = buildMasterIndex(songs);
  return entries.map((entry) => ({ entry, ...matchBatchEntry(entry, index) }));
}
