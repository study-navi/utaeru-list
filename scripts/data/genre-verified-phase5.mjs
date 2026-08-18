/**
 * Phase 5: 6ジャンル体系 — 未分類107曲 + Eve/syudou 修正
 * genres のみ。patch 再実行でも維持される。
 */
export const GENRE_VERIFIED_PHASE5 = {
  // --- 洋楽 ---
  129: { genres: ['洋楽'] }, // Alan Walker / Faded
  280: { genres: ['洋楽'] }, // Ed Sheeran / SHAPE OF YOU
  211: { genres: ['洋楽'] }, // WIZ KHALIFA / SEE YOU AGAIN
  864: { genres: ['洋楽'] }, // STEVIE WONDER / Overioyed
  950: { genres: ['洋楽'] }, // CELINE DION / MY HEART WILL GO ON
  1096: { genres: ['洋楽'] }, // TWICE / TT
  1097: { genres: ['洋楽'] }, // TWICE / Pink Lemonade
  1467: { genres: ['洋楽'] }, // BIGBANG / FANTASTIC BABY
  1469: { genres: ['洋楽'] }, // Beyonce / IF I WERE A BOY
  1595: { genres: ['洋楽'] }, // BON JOVI / IT'S MY LIFE

  // --- 演歌 ---
  174: { genres: ['演歌'] }, // 石川さゆり / 天城越え
  175: { genres: ['演歌'] }, // 石川さゆり / 津軽海峡･冬景色
  654: { genres: ['演歌'] }, // 坂本冬美 / また君に恋してる
  655: { genres: ['演歌'] }, // 坂本冬美 / 夜桜お七
  1719: { genres: ['演歌'] }, // 美空ひばり / 川の流れのように
  1720: { genres: ['演歌'] }, // 美空ひばり / 愛燦燦

  // --- ボカロ ---
  276: { genres: ['ボカロ'] }, // EHIKARA / 妄想アスパルテーム feat.初音ミク
  1051: { genres: ['ボカロ'] }, // Dios/シグナルP / サンドリヨン
  1052: { genres: ['ボカロ'] }, // Dios/シグナルP / 会いたい

  // --- J-POP（一般邦楽） ---
  887: { genres: ['J-POP'] }, // Spontania feat.JUJU / 君のすべてに
  998: { genres: ['J-POP'] }, // CHiCO / 可愛くなりたい（HoneyWorksオリジナル）
  1328: { genres: ['J-POP'] }, // HoneyWorks / 東京サマーセッション feat.CHiCO
  1330: { genres: ['J-POP'] }, // HoneyWorks / 東京サマーセッション
  1331: { genres: ['J-POP'] }, // HoneyWorks / 金曜日のおはよう
  1333: { genres: ['J-POP'] }, // HoneyWorks / メイド☆至上主義
  1335: { genres: ['J-POP'] }, // HoneyWorks / 誇り高きアイドル
  1770: { genres: ['J-POP'] }, // mona / おまえも
  1771: { genres: ['J-POP'] }, // mona / #超絶かわいい
  1773: { genres: ['J-POP'] }, // mona / 不屈のアイドル

  // --- アニソン（TVアニメ・ラブライブ・BanG Dream・アイカツ等） ---
  44: { genres: ['アニソン'] }, // Aqours / 勇気はどこに?
  179: { genres: ['アニソン'] }, // らき☆すた OP
  218: { genres: ['アニソン'] }, // 機巧少女 OP
  323: { genres: ['アニソン'] }, // 鬼灯の冷徹 ED
  545: { genres: ['アニソン'] }, // Clef / BanG Dream Argonavis
  546: { genres: ['アニソン'] }, // 黒澤ルビィ from Aqours
  949: { genres: ['アニソン'] }, // AIKATSU☆STARS!
  962: { genres: ['アニソン'] }, // からかい OP
  969: { genres: ['アニソン'] }, // アイドルマスター
  995: { genres: ['J-POP', 'アニソン'] }, // ガールフレンド(仮) OP
  996: { genres: ['J-POP', 'アニソン'] },
  997: { genres: ['J-POP', 'アニソン'] }, // いろはにほと ED
  999: { genres: ['J-POP', 'アニソン'] },
  1000: { genres: ['J-POP', 'アニソン'] }, // ハイキュー!! 関連
  1136: { genres: ['アニソン'] }, // けもフレ OP
  1139: { genres: ['アニソン'] }, // うまる OP
  1203: { genres: ['アニソン'] }, // AIKATSU
  1319: { genres: ['アニソン'] }, // うしとら ED
  1329: { genres: ['J-POP', 'アニソン'] }, // ヒロイン失格
  1332: { genres: ['J-POP', 'アニソン'] },
  1334: { genres: ['J-POP', 'アニソン'] },
  1337: { genres: ['J-POP', 'アニソン'] },
  1430: { genres: ['アニソン'] }, // Pastel*Palettes
  1431: { genres: ['アニソン'] },
  1479: { genres: ['アニソン'] }, // ポケモン
  1504: { genres: ['アニソン'] }, // 異世界はスマートフォン OP
  1524: { genres: ['アニソン'] }, // 四月は君の嘘 OP
  1526: { genres: ['アニソン'] }, // アイマス
  1532: { genres: ['J-POP', 'アニソン'] }, // fripSide / とある
  1552: { genres: ['アニソン'] }, // ブレイブバング OP
  1728: { genres: ['アニソン'] }, // ラブライブ
  1732: { genres: ['アニソン'] }, // μ's
  1734: { genres: ['アニソン'] },
  1735: { genres: ['アニソン'] },
  1736: { genres: ['アニソン'] },
  1767: { genres: ['J-POP', 'アニソン'] },
  1769: { genres: ['J-POP', 'アニソン'] }, // ファンサ
  1772: { genres: ['J-POP', 'アニソン'] },
  1963: { genres: ['J-POP', 'アニソン'] }, // LIP×LIP
  1964: { genres: ['J-POP', 'アニソン'] },
  1965: { genres: ['J-POP', 'アニソン'] },
  1977: { genres: ['アニソン'] }, // AIKATSU
  1990: { genres: ['アニソン'] }, // Re:ゼロ ED
  2000: { genres: ['アニソン'] }, // SHOW BY ROCK!!

  // --- その他 ---
  95: { genres: ['その他'] }, // After the Rain 歌い手
  101: { genres: ['その他'] }, // 天月
  102: { genres: ['その他'] },
  131: { genres: ['その他'] }, // Disney cover 洋楽アーティストだがディズニー曲
  139: { genres: ['その他'] }, // Ensemble Stars
  165: { genres: ['その他'] }, // ABC体操 番組
  549: { genres: ['その他'] }, // 96猫 歌い手
  865: { genres: ['その他'] }, // すとぷり
  866: { genres: ['その他'] },
  886: { genres: ['その他'] }, // ウマ娘 ゲーム
  1054: { genres: ['その他'] }, // ディズニー
  1055: { genres: ['その他'] },
  1056: { genres: ['その他'] },
  1057: { genres: ['その他'] },
  1058: { genres: ['その他'] },
  1059: { genres: ['その他'] },
  1104: { genres: ['その他'] }, // TDR
  1127: { genres: ['その他'] }, // 仮面ライダー電王 特撮
  1167: { genres: ['その他'] }, // DCT 仮面ライダーW
  1248: { genres: ['その他'] }, // にじさんじ VTuber
  1249: { genres: ['その他'] },
  1250: { genres: ['その他'] },
  1336: { genres: ['その他'] }, // VTuber 星川サラ
  1397: { genres: ['その他'] }, // Ensemble Stars
  1570: { genres: ['その他'] }, // 星街すいせい VTuber
  1571: { genres: ['その他'] },
  1572: { genres: ['その他'] },
  1644: { genres: ['その他'] }, // まふまふ 歌い手
  1646: { genres: ['その他'] },
  1647: { genres: ['その他'] },
  1648: { genres: ['その他'] },
  1649: { genres: ['その他'] },
  1824: { genres: ['その他'] }, // FF10 ゲーム
  1825: { genres: ['その他'] },
};

/** 既存分類の誤り修正（Eve / syudou 本人歌唱） */
export const GENRE_CORRECTIONS_PHASE5 = {
  191: { genres: ['J-POP'] }, // Eve / ドラマツルギー 本人歌唱
  192: { genres: ['J-POP', 'アニソン'] }, // 文豪ストレイドッグス OP
  193: { genres: ['J-POP'] },
  195: { genres: ['J-POP'] },
  196: { genres: ['J-POP'] },
  197: { genres: ['J-POP'] },
  198: { genres: ['J-POP'] },
  764: { genres: ['J-POP'] }, // syudou / 邪魔 本人歌唱
  765: { genres: ['J-POP'] },
  766: { genres: ['J-POP'] },
  767: { genres: ['ボカロ'] }, // syudou feat. 初音ミク / コールボーイ
};
