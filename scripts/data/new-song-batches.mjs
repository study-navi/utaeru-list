/**
 * UTAEMO 新着バッチ管理（エモカラ新着画面より手動転記）
 *
 * 更新手順:
 * 1. 新バッチを batches に追加（既存 batch の songs は削除しない）
 * 2. CURRENT_NEW_BATCH を新 batch id に変更
 * 3. node scripts/sync-new-batch.mjs を実行
 */

/** @type {string} 現在の新着バッチ ID */
export const CURRENT_NEW_BATCH = 'batch-2026-emokara-01';

/**
 * @typedef {{ title: string, artist: string, titleNeedsReview?: boolean, note?: string }} BatchSongEntry
 * @typedef {{ id: string, label: string, source: string, songs: BatchSongEntry[] }} NewSongBatch
 */

/** @type {NewSongBatch[]} */
export const NEW_SONG_BATCHES = [
  {
    id: 'batch-2026-emokara-01',
    label: 'エモカラ新着（2026-08 提供分）',
    source: 'emokara-screenshots-4pages',
    songs: [
      // 画像4（上段）
      { title: 'Happy children《レコおと》', artist: 'シマエナガ' },
      { title: 'Rosa', artist: '中山美穂' },
      { title: 'およげ！たいやきくん', artist: '子門真人' },
      { title: '希望の轍', artist: 'サザンオールスターズ' },
      { title: 'ジュリアン', artist: 'PRINCESS PRINCESS' },
      { title: '19 GROWING UP -ode to my buddy-', artist: 'PRINCESS PRINCESS' },
      { title: '僕のそばに', artist: '徳永英明' },
      { title: '北風 ～君にとどきますように～', artist: '槇原敬之' },
      { title: 'ROSIER', artist: 'LUNA SEA' },
      { title: '魔訶不思議アドベンチャー！', artist: '高橋洋樹' },
      { title: 'SEVEN DAYS WAR (FOUR PIECES', artist: 'TM NETWORK(TMN)', titleNeedsReview: true, note: '画像で曲名末尾が切れている' },
      { title: '夜明け', artist: 'RAZZ MA TAZZ' },
      { title: 'チュッ！夏パ〜ティ', artist: '三人祭' },
      // 画像3
      { title: 'ザ☆ピ～ス！', artist: 'モーニング娘。' },
      { title: '汗の中でCRY', artist: 'ZARD' },
      { title: 'くじら12号', artist: 'JUDY AND MARY' },
      { title: '謎', artist: '小松未歩' },
      { title: 'Caress of Venus', artist: "L'Arc～en～Ciel" },
      { title: '渇いた叫び', artist: 'the FIELD OF VIEW' },
      { title: 'たしかなこと', artist: '小田和正' },
      { title: '運命のルーレット廻して', artist: 'ZARD' },
      { title: 'WIND', artist: '倖田來未' },
      { title: '桜', artist: 'Janne Da Arc' },
      { title: 'ターゲット ～赤い衝撃～', artist: '和田光司' },
      { title: '最期の川', artist: 'CHEMISTRY' },
      { title: '転がる岩、君に朝が降る', artist: 'ASIAN KUNG-FU GENERATION' },
      // 画像2
      { title: 'CARTOON HEROES', artist: 'AQUA' },
      { title: '風のららら', artist: '倉木麻衣' },
      { title: '手をたたけ', artist: 'NICO Touches the Walls' },
      { title: 'departure!', artist: '小野正利' },
      { title: 'Always', artist: '西野カナ' },
      { title: '桜流し', artist: '宇多田ヒカル' },
      { title: 'Dear my....', artist: 'Janne Da Arc' },
      { title: '砂漠の花', artist: 'スピッツ' },
      { title: 'あんなに一緒だったのに', artist: 'See-Saw' },
      { title: 'Funny Bunny', artist: 'the pillows' },
      { title: '聲', artist: '天野月子' },
      { title: '優しい嘘', artist: 'Acid Black Cherry' },
      { title: 'Anything Goes!', artist: '大黒摩季' },
      // 画像1
      { title: '初音ミクの暴走', artist: 'cosMo@暴走P' },
      { title: 'ENAMEL', artist: 'シド' },
      { title: 'うたかた', artist: 'Kagrra,' },
      { title: 'Love Power', artist: 'Aice5' },
      { title: '火葬曲', artist: 'No.D/上野悠仁' },
      { title: 'Soup', artist: '藤原さくら' },
      { title: 'ティアドロップ', artist: 'BOWL' },
      { title: 'ミラクルペイント', artist: 'OSTER project' },
      { title: 'なめこのうた', artist: '福原遥' },
      { title: '夏空', artist: 'Galileo Galilei' },
      { title: '乱舞のメロディ', artist: 'シド' },
      { title: 'Rosso & Dry', artist: 'SiM' },
      { title: '夜な夜な夜な', artist: '倉橋ヨエコ' },
    ],
  },
];

export function getBatchById(id) {
  return NEW_SONG_BATCHES.find((b) => b.id === id) || null;
}

export function getCurrentBatch() {
  return getBatchById(CURRENT_NEW_BATCH);
}
