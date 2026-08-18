/**
 * 新着バッチ lookup 生成（MASTER_SONGS / viewer 注入用）
 */
import { matchBatchEntries } from './song-match.mjs';
import { NEW_SONG_BATCHES, CURRENT_NEW_BATCH } from '../data/new-song-batches.mjs';

export function buildNewBatchLookup(songs, batches = NEW_SONG_BATCHES) {
  /** @type {Record<string, string[]>} */
  const lookup = {};
  for (const batch of batches) {
    const results = matchBatchEntries(batch.songs, songs);
    for (const r of results) {
      if (r.status !== 'registered' || !r.song) continue;
      const key = `${r.song.a}\u0001${r.song.t}`;
      if (!lookup[key]) lookup[key] = [];
      if (!lookup[key].includes(batch.id)) lookup[key].push(batch.id);
    }
  }
  return lookup;
}

export function runBatchMatchReport(songs, batchId = CURRENT_NEW_BATCH) {
  const batch = NEW_SONG_BATCHES.find((b) => b.id === batchId);
  if (!batch) throw new Error(`batch not found: ${batchId}`);
  const results = matchBatchEntries(batch.songs, songs);
  const registered = [];
  const unregistered = [];
  const needsReview = [];
  for (const r of results) {
    const row = {
      title: r.entry.title,
      artist: r.entry.artist,
      note: r.entry.note,
    };
    if (r.status === 'registered') {
      registered.push({ ...row, masterTitle: r.song.t, masterArtist: r.song.a, matchType: r.matchType });
    } else if (r.status === 'needs_review') {
      needsReview.push({
        ...row,
        reason: r.reason,
        candidates: (r.candidates || []).map((s) => `${s.a} / ${s.t}`),
      });
    } else {
      unregistered.push(row);
    }
  }
  return { batch, registered, unregistered, needsReview, total: batch.songs.length };
}
