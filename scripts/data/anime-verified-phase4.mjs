/**
 * Phase 4: 確信度 A のアニソン分類（曲単位・公式タイアップ確認済み）
 * genres 以外は変更しない。patch 再実行でも維持される。
 */
export const ANIME_VERIFIED_PHASE4 = {
  // --- /u/hiro 重点: シド ---
  727: { genres: ['J-POP', 'アニソン'], work: '鋼の錬金術師 FULLMETAL ALCHEMIST', role: 'ED', confidence: 'A' },
  728: { genres: ['J-POP', 'アニソン'], work: 'マギ The labyrinth of magic', role: 'OP', confidence: 'A' },
  729: { genres: ['J-POP', 'アニソン'], work: '鋼の錬金術師 FULLMETAL ALCHEMIST', role: 'OP', confidence: 'A' },
  730: { genres: ['J-POP', 'アニソン'], work: '黒執事', role: 'OP', confidence: 'A' },
  734: { genres: ['J-POP', 'アニソン'], work: '黒執事 Book of the Atlantic', role: '映画主題歌', confidence: 'A' },
  735: { genres: ['J-POP', 'アニソン'], work: 'マギ The kingdom of magic', role: 'OP', confidence: 'A' },
  737: { genres: ['J-POP', 'アニソン'], work: '黒執事 Book of Circus', role: 'OP', confidence: 'A' },
  738: { genres: ['J-POP', 'アニソン'], work: 'BLEACH', role: 'OP', confidence: 'A' },
  // --- /u/hiro 重点: ポルノグラフィティ ---
  1601: { genres: ['J-POP', 'アニソン'], work: '鋼の錬金術師', role: 'OP', confidence: 'A' },
  1605: { genres: ['J-POP', 'アニソン'], work: 'GTO', role: 'OP', confidence: 'A' },
  1609: { genres: ['J-POP', 'アニソン'], work: '僕のヒーローアカデミア', role: 'OP', confidence: 'A' },
  // --- ClariS ---
  535: { genres: ['J-POP', 'アニソン'], work: '魔法少女まどか☆マギカ', role: 'OP', confidence: 'A' },
  536: { genres: ['J-POP', 'アニソン'], work: 'エロマンガ先生', role: 'OP', confidence: 'A' },
  // --- ReoNa ---
  1985: { genres: ['J-POP', 'アニソン'], work: 'ソードアート・オンライン Alicization', role: 'OP', confidence: 'A' },
  // --- EGOIST (Guilty Crown) ---
  269: { genres: ['アニソン'], work: 'ギルティクラウン', role: '挿入歌', confidence: 'A' },
  270: { genres: ['アニソン'], work: 'ギルティクラウン', role: 'ED', confidence: 'A' },
  271: { genres: ['アニソン'], work: 'ギルティクラウン', role: '挿入歌', confidence: 'A' },
  272: { genres: ['アニソン'], work: 'ギルティクラウン', role: '挿入歌', confidence: 'A' },
  273: { genres: ['アニソン'], work: 'ギルティクラウン', role: '劇伴/テーマ', confidence: 'A' },
  274: { genres: ['アニソン'], work: 'ギルティクラウン', role: '挿入歌', confidence: 'A' },
  275: { genres: ['アニソン'], work: 'ギルティクラウン', role: '挿入歌', confidence: 'A' },
  // --- T.M.Revolution ---
  1037: { genres: ['J-POP', 'アニソン'], work: '機動戦士ガンダムSEED DESTINY', role: 'OP', confidence: 'A' },
  1038: { genres: ['J-POP', 'アニソン'], work: '機動戦士ガンダムSEED', role: 'OP', confidence: 'A' },
  // --- 鈴木このみ ---
  850: { genres: ['J-POP', 'アニソン'], work: 'ノーゲーム・ノーライフ', role: 'OP', confidence: 'A' },
  851: { genres: ['J-POP', 'アニソン'], work: 'Re:ゼロから始める異世界生活', role: 'ED', confidence: 'A' },
  // --- KANA-BOON ---
  421: { genres: ['J-POP', 'アニソン'], work: 'NARUTO-ナルト- 疾風伝', role: 'OP', confidence: 'A' },
  // --- UVERworld ---
  247: { genres: ['J-POP', 'アニソン'], work: '約束のネバーランド', role: 'OP', confidence: 'A' },
  249: { genres: ['J-POP', 'アニソン'], work: 'BLOOD+', role: 'OP', confidence: 'A' },
  // --- Aimer ---
  290: { genres: ['J-POP', 'アニソン'], work: 'Fate/stay night [Heaven\'s Feel] II.lost butterfly', role: '映画主題歌', confidence: 'A' },
  295: { genres: ['J-POP', 'アニソン'], work: 'Fate/stay night [Heaven\'s Feel] III.spring song', role: '映画主題歌', confidence: 'A' },
  298: { genres: ['J-POP', 'アニソン'], work: '恋は雨上がりのように', role: 'ED', confidence: 'A' },
  299: { genres: ['J-POP', 'アニソン'], work: 'NO.6', role: 'ED', confidence: 'A' },
  // --- 米倉千尋 ---
  1853: { genres: ['J-POP', 'アニソン'], work: 'FAIRY TAIL', role: 'OP', confidence: 'A' },
  // --- TK / RADWIMPS ---
  1040: { genres: ['J-POP', 'アニソン'], work: '東京喰種トーキョーグール', role: 'OP', confidence: 'A' },
  1914: { genres: ['J-POP', 'アニソン'], work: '君の名は。', role: '映画主題歌', confidence: 'A' },
  // --- キャラクターソング ---
  855: { genres: ['アニソン'], work: '涼宮ハルヒの憂鬱', role: '挿入歌', confidence: 'A' },
  // --- キタニタツヤ / Creepy Nuts / MAN WITH A MISSION ---
  466: { genres: ['J-POP', 'アニソン'], work: '呪術廻戦 懐玉・玉折', role: 'OP', confidence: 'A' },
  553: { genres: ['J-POP', 'アニソン'], work: 'ダンダダン', role: 'OP', confidence: 'A' },
  1668: { genres: ['J-POP', 'アニソン'], work: '鬼滅の刃 刀鍛冶の里編', role: 'OP', confidence: 'A' },
};

/** ボカロ誤分類修正（Phase 4） */
export const GENRE_CORRECTIONS_PHASE4 = {
  1864: { genres: ['J-POP'], work: '米津玄師 1st「diorama」本人歌唱', role: '本人リリース', confidence: 'A', note: 'ハチ名義VOCALOID版ではなく米津玄師本人歌唱としてカタログ登録' },
};
