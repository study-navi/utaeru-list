/**
 * 英語表記を、カラオケで使う外来語のひらがな読みにする。
 * 曲名の五十音・あいうえお順用。意味の翻訳はしない（Story → すとーりー）。
 */
import { EXTRA_WORDS } from '../data/english-word-readings.mjs';

const WORD = {
  a: 'あ', an: 'あん', the: 'ざ', of: 'オブ', to: 'トゥ', and: 'アンド',
  in: 'イン', on: 'オン', or: 'オア', at: 'アット', as: 'アズ', for: 'フォー',
  is: 'イズ', it: 'イット', be: 'ビー', by: 'バイ', from: 'フロム', with: 'ウィズ',
  i: 'アイ', you: 'ユー', me: 'ミー', my: 'マイ', we: 'ウィー', your: 'ユア', our: 'アワー',
  he: 'ヒー', she: 'シー', they: 'ゼイ', them: 'ゼム', his: 'ヒズ', her: 'ハー',
  love: 'ラブ', loved: 'ラブド', lover: 'ラバー', loves: 'ラブス',
  one: 'ワン', two: 'トゥー', three: 'スリー', four: 'フォー', five: 'ファイブ',
  six: 'シックス', seven: 'セブン', eight: 'エイト', nine: 'ナイン', ten: 'テン',
  go: 'ゴー', going: 'ゴーイング', gone: 'ゴーン',
  story: 'ストーリー', stories: 'ストーリーズ', sweet: 'スイート',
  hero: 'ヒーロー', heroes: 'ヒーローズ', heart: 'ハート', hearts: 'ハーツ',
  world: 'ワールド', day: 'デイ', days: 'デイズ', time: 'タイム', times: 'タイムズ',
  song: 'ソング', songs: 'ソングス', rain: 'レイン', baby: 'ベイビー',
  again: 'アゲイン', happy: 'ハッピー', happiness: 'ハピネス', dear: 'ディア',
  power: 'パワー', eternal: 'エターナル', black: 'ブラック', white: 'ホワイト',
  night: 'ナイト', nights: 'ナイツ', life: 'ライフ', live: 'リヴ', lives: 'リブズ',
  dream: 'ドリーム', dreams: 'ドリームズ', star: 'スター', stars: 'スターズ',
  light: 'ライト', lights: 'ライツ', fire: 'ファイア', blue: 'ブルー', red: 'レッド',
  green: 'グリーン', girl: 'ガール', girls: 'ガールズ', boy: 'ボーイ', boys: 'ボーイズ',
  kiss: 'キス', hug: 'ハグ', milk: 'ミルク', road: 'ロード', roads: 'ローズ',
  bandage: 'バンテージ', celebrate: 'セレブレイト', can: 'キャン', cant: 'キャント',
  fight: 'ファイト', together: 'トゥゲザー', winding: 'ワインディング',
  innocence: 'イノセンス', ignite: 'イグナイト', emotion: 'エモーション', emotions: 'エモーションズ',
  cartoon: 'カートゥーン', cherry: 'チェリー', alone: 'アローン', alones: 'アローンズ',
  bunny: 'バニー', great: 'グレイト', greatest: 'グレイテスト',
  if: 'イフ', will: 'ウィル', get: 'ゲット', got: 'ゴット', so: 'ソー',
  la: 'ラ', re: 'リー', do: 'ドゥー', dont: 'ドント', not: 'ノット', no: 'ノー',
  yes: 'イエス', now: 'ナウ', know: 'ノー', known: 'ノウン',
  what: 'ホワット', when: 'ホエン', where: 'ホエア', who: 'フー', why: 'ホワイ', how: 'ハウ',
  all: 'オール', call: 'コール', fall: 'フォール', small: 'スモール',
  come: 'カム', some: 'サム', have: 'ハブ', give: 'ギブ', move: 'ムーブ',
  are: 'アー', was: 'ワズ', were: 'ワー', been: 'ビーン',
  this: 'ディス', that: 'ザット', there: 'ゼア', here: 'ヒア', these: 'ジーズ', those: 'ゾーズ',
  just: 'ジャスト', like: 'ライク', want: 'ウォント', need: 'ニード',
  feel: 'フィール', feeling: 'フィーリング', believe: 'ビリーブ',
  remember: 'リメンバー', forget: 'フォーゲット', goodbye: 'グッバイ', hello: 'ハロー',
  hey: 'ヘイ', yeah: 'イェー', wow: 'ワオ', oh: 'オー', ah: 'アー',
  music: 'ミュージック', musica: 'ムジカ', tot: 'トット', jap: 'ジャップ',
  mr: 'ミスター', mrs: 'ミセス', miss: 'ミス',
  christmas: 'クリスマス', xmas: 'クリスマス',
  rock: 'ロック', roll: 'ロール', blues: 'ブルース', jazz: 'ジャズ', soul: 'ソウル',
  dance: 'ダンス', party: 'パーティー', forever: 'フォーエバー', always: 'オールウェイズ',
  never: 'ネバー', ever: 'エバー', over: 'オーバー', under: 'アンダー',
  after: 'アフター', before: 'ビフォー', beautiful: 'ビューティフル', pretty: 'プリティー',
  little: 'リトル', big: 'ビッグ', new: 'ニュー', old: 'オールド', young: 'ヤング',
  good: 'グッド', bad: 'バッド', best: 'ベスト', last: 'ラスト', first: 'ファースト',
  only: 'オンリー', please: 'プリーズ',
  ok: 'オーケー', tv: 'ティーヴィー', dj: 'ディージェー',
  love: 'ラブ', so: 'ソー',
  up: 'アップ', down: 'ダウン', out: 'アウト', off: 'オフ', on: 'オン',
  back: 'バック', way: 'ウェイ', ways: 'ウェイズ', away: 'アウェイ',
  home: 'ホーム', house: 'ハウス', town: 'タウン', city: 'シティ',
  sky: 'スカイ', sun: 'サン', moon: 'ムーン', sea: 'シー', ocean: 'オーシャン',
  summer: 'サマー', winter: 'ウィンター', spring: 'スプリング', autumn: 'オータム',
  morning: 'モーニング', tonight: 'トゥナイト', today: 'トゥデイ', tomorrow: 'トゥモロー',
  yesterday: 'イエスタデイ',
  smile: 'スマイル', cry: 'クライ', tear: 'ティア', tears: 'ティアーズ',
  kiss: 'キス', touch: 'タッチ', hold: 'ホールド', hand: 'ハンド', hands: 'ハンズ',
  eyes: 'アイズ', eye: 'アイ', face: 'フェイス', voice: 'ボイス',
  name: 'ネーム', game: 'ゲーム', fame: 'フェイム',
  true: 'トゥルー', truth: 'トゥルース', lie: 'ライ', lies: 'ライズ',
  real: 'リアル', really: 'リアリー',
  free: 'フリー', freedom: 'フリーダム',
  fly: 'フライ', flying: 'フライング', high: 'ハイ', higher: 'ハイアー',
  low: 'ロー', slow: 'スロー', fast: 'ファスト',
  run: 'ラン', running: 'ランニング', walk: 'ウォーク',
  stop: 'ストップ', start: 'スタート', end: 'エンド',
  begin: 'ビギン', beginning: 'ビギニング',
  open: 'オープン', close: 'クローズ', closed: 'クローズド',
  break: 'ブレイク', broken: 'ブロークン',
  change: 'チェンジ', turn: 'ターン', return: 'リターン',
  stay: 'ステイ', wait: 'ウェイト', waiting: 'ウェイティング',
  leave: 'リーブ', left: 'レフト', right: 'ライト',
  long: 'ロング', short: 'ショート',
  more: 'モア', most: 'モスト', much: 'マッチ', many: 'メニー',
  very: 'ベリー', too: 'トゥー', also: 'オールソー',
  still: 'スティル', yet: 'イェット', already: 'オールレディ',
  into: 'イントゥ', onto: 'オントゥ', about: 'アバウト', around: 'アラウンド',
  through: 'スルー', without: 'ウィズアウト', within: 'ウィズイン',
  between: 'ビトウィーン', among: 'アマング',
  because: 'ビコーズ', since: 'シンス', while: 'ホワイル', until: 'アンティル',
  than: 'ザン', then: 'ゼン',
  but: 'バット', or: 'オア', and: 'アンド',
  let: 'レット', lets: 'レッツ', make: 'メイク', made: 'メイド',
  take: 'テイク', took: 'トゥック', taken: 'テイクン',
  say: 'セイ', said: 'セッド', says: 'セズ',
  tell: 'テル', told: 'トールド',
  see: 'シー', saw: 'ソー', seen: 'シーン',
  look: 'ルック', looking: 'ルッキング',
  find: 'ファインド', found: 'ファウンド',
  keep: 'キープ', kept: 'ケプト',
  think: 'シンク', thought: 'ソート',
  try: 'トライ', tried: 'トライド',
  wish: 'ウィッシュ', hope: 'ホープ', hopes: 'ホープス',
  pray: 'プレイ', prayer: 'プレイヤー',
  god: 'ゴッド', heaven: 'ヘブン', angel: 'エンジェル', angels: 'エンジェルズ',
  devil: 'デビル', hell: 'ヘル',
  love: 'ラブ', hate: 'ヘイト',
  friend: 'フレンド', friends: 'フレンズ',
  people: 'ピープル', person: 'パーソン', man: 'マン', men: 'メン', woman: 'ウーマン', women: 'ウィメン',
  lady: 'レディ', ladies: 'レディース', gentleman: 'ジェントルマン',
  mom: 'マム', mother: 'マザー', dad: 'ダッド', father: 'ファーザー',
  brother: 'ブラザー', sister: 'シスター', family: 'ファミリー',
  lonely: 'ロンリー', alone: 'アローン',
  sad: 'サッド', glad: 'グラッド', crazy: 'クレイジー',
  magic: 'マジック', miracle: 'ミラクル',
  secret: 'シークレット', mystery: 'ミステリー',
  memory: 'メモリー', memories: 'メモリーズ',
  moment: 'モーメント', moments: 'モーメンツ',
  future: 'フューチャー', past: 'パスト', present: 'プレゼント',
  christmas: 'クリスマス', birthday: 'バースデイ',
  party: 'パーティー', dance: 'ダンス', dancing: 'ダンシング',
  sing: 'シング', singing: 'シンギング', singer: 'シンガー',
  play: 'プレイ', playing: 'プレイング', player: 'プレイヤー',
  show: 'ショー', shows: 'ショーズ',
  movie: 'ムービー', film: 'フィルム',
  piece: 'ピース', peace: 'ピース',
  red: 'レッド',
  color: 'カラー', colour: 'カラー',
  gold: 'ゴールド', silver: 'シルバー',
  diamond: 'ダイヤモンド', jewel: 'ジュエル',
  rose: 'ローズ', roses: 'ローゼズ', flower: 'フラワー', flowers: 'フラワーズ',
  wind: 'ウィンド', winds: 'ウィンズ', storm: 'ストーム', snow: 'スノー',
  rainbow: 'レインボー', sunshine: 'サンシャイン', moonlight: 'ムーンライト',
  shadow: 'シャドウ', shadows: 'シャドウズ',
  dark: 'ダーク', darkness: 'ダークネス', bright: 'ブライト',
  hot: 'ホット', cold: 'コールド', cool: 'クール', warm: 'ウォーム',
  hard: 'ハード', soft: 'ソフト', strong: 'ストロング', weak: 'ウィーク',
  wild: 'ワイルド', gentle: 'ジェントル',
  special: 'スペシャル', ordinary: 'オーディナリー',
  perfect: 'パーフェクト', wonderful: 'ワンダフル', amazing: 'アメージング',
  super: 'スーパー', ultra: 'ウルトラ', mega: 'メガ',
  original: 'オリジナル', classic: 'クラシック',
  version: 'バージョン', remix: 'リミックス',
  radio: 'レディオ', telephone: 'テレフォン', phone: 'フォン',
  letter: 'レター', message: 'メッセージ', mail: 'メール',
  word: 'ワード', words: 'ワーズ',
  book: 'ブック', page: 'ページ', story: 'ストーリー',
  school: 'スクール', class: 'クラス',
  work: 'ワーク', working: 'ワーキング', job: 'ジョブ',
  money: 'マネー', dollar: 'ダラー',
  car: 'カー', drive: 'ドライブ', driving: 'ドライビング', driver: 'ドライバー',
  train: 'トレイン', airplane: 'エアプレイン', fly: 'フライ',
  ship: 'シップ', boat: 'ボート',
  city: 'シティ', street: 'ストリート', road: 'ロード',
  bridge: 'ブリッジ', river: 'リバー', mountain: 'マウンテン',
  island: 'アイランド', beach: 'ビーチ',
  america: 'アメリカ', american: 'アメリカン',
  japan: 'ジャパン', japanese: 'ジャパニーズ', tokyo: 'トウキョウ',
  london: 'ロンドン', paris: 'パリ', newyork: 'ニューヨーク',
  christmas: 'クリスマス',
  santa: 'サンタ',
  baby: 'ベイビー',
  darling: 'ダーリング', honey: 'ハニー', sweetheart: 'スイートハート',
  kisshug: 'キスハグ',
  lovestory: 'ラブストーリー', lovepower: 'ラブパワー',
  sweetemotion: 'スイートエモーション',
  cartoonheroes: 'カートゥーンヒーローズ',
  fighttogether: 'ファイトトゥゲザー',
  windingroad: 'ワインディングロード',
  blackcherry: 'ブラックチェリー',
  bunnygirl: 'バニーガール',
  greatdays: 'グレイトデイズ',
  lovesosweet: 'ラブソースイート',
  onelove: 'ワンラブ',
  canyoucelebrate: 'キャンユーセレブレイト',
  totmusica: 'トットムジカ',
};

const LETTER = {
  a: 'エー', b: 'ビー', c: 'シー', d: 'ディー', e: 'イー', f: 'エフ', g: 'ジー',
  h: 'エイチ', i: 'アイ', j: 'ジェー', k: 'ケー', l: 'エル', m: 'エム', n: 'エヌ',
  o: 'オー', p: 'ピー', q: 'キュー', r: 'アール', s: 'エス', t: 'ティー', u: 'ユー',
  v: 'ブイ', w: 'ダブリュー', x: 'エックス', y: 'ワイ', z: 'ゼット',
};

const DIGIT = {
  0: 'ゼロ', 1: 'ワン', 2: 'ツー', 3: 'スリー', 4: 'フォー',
  5: 'ファイブ', 6: 'シックス', 7: 'セブン', 8: 'エイト', 9: 'ナイン',
};

function kataToHira(str) {
  return str.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function spellLetters(word) {
  return [...word.toLowerCase()].map((ch) => LETTER[ch] || DIGIT[ch] || '').join('');
}

/** 末尾の黙字 e と、その前の母音を長音にする */
function applyMagicE(word) {
  if (!/[aeiou][^aeiou]e$/i.test(word)) return null;
  if (/(ee|ye|oe)$/i.test(word)) return null;
  const stem = word.slice(0, -1);
  const vowelAt = stem.search(/[aeiou](?=[^aeiou]+$)/);
  if (vowelAt < 0) return null;
  const v = stem[vowelAt];
  const long = { a: 'ei', e: 'i', i: 'ai', o: 'o', u: 'u' }[v];
  return stem.slice(0, vowelAt) + long + stem.slice(vowelAt + 1);
}

function phonetic(raw) {
  let w = applyMagicE(raw) || raw;
  w = w
    .replace(/tion/g, 'shon')
    .replace(/sion/g, 'shon')
    .replace(/sure/g, 'sha')
    .replace(/ture/g, 'cha')
    .replace(/ough/g, 'o')
    .replace(/aught/g, 'ot')
    .replace(/eigh/g, 'ei')
    .replace(/igh/g, 'ai')
    .replace(/ph/g, 'f')
    .replace(/wh/g, 'w')
    .replace(/wr/g, 'r')
    .replace(/kn/g, 'n')
    .replace(/qu/g, 'kw')
    .replace(/ck/g, 'k')
    .replace(/ch/g, 'ch')
    .replace(/sh/g, 'sh')
    .replace(/th/g, 's');

  const mora = {
    a: 'ア', i: 'イ', u: 'ウ', e: 'エ', o: 'オ',
    k: 'ク', s: 'ス', t: 'ト', n: 'ン', h: 'フ', f: 'フ', m: 'ム',
    y: 'イ', r: 'ル', w: 'ウ', g: 'グ', z: 'ズ', d: 'ド', b: 'ブ', p: 'プ',
    j: 'ジ', v: 'ヴ', l: 'ル', c: 'ク', x: 'クス',
  };
  // 簡易: 子音+母音を外来語の拍にする
  const cv = {
    ka: 'カ', ki: 'キ', ku: 'ク', ke: 'ケ', ko: 'コ',
    sa: 'サ', shi: 'シ', si: 'シ', su: 'ス', se: 'セ', so: 'ソ',
    ta: 'タ', chi: 'チ', ti: 'ティ', tu: 'トゥ', te: 'テ', to: 'ト',
    na: 'ナ', ni: 'ニ', nu: 'ヌ', ne: 'ネ', no: 'ノ',
    ha: 'ハ', hi: 'ヒ', hu: 'フ', fu: 'フ', he: 'ヘ', ho: 'ホ',
    fa: 'ファ', fi: 'フィ', fe: 'フェ', fo: 'フォ',
    ma: 'マ', mi: 'ミ', mu: 'ム', me: 'メ', mo: 'モ',
    ya: 'ヤ', yu: 'ユ', yo: 'ヨ',
    ra: 'ラ', ri: 'リ', ru: 'ル', re: 'レ', ro: 'ロ',
    wa: 'ワ', wi: 'ウィ', we: 'ウェ', wo: 'ウォ',
    ga: 'ガ', gi: 'ギ', gu: 'グ', ge: 'ゲ', go: 'ゴ',
    za: 'ザ', ji: 'ジ', zi: 'ジ', zu: 'ズ', ze: 'ゼ', zo: 'ゾ',
    da: 'ダ', di: 'ディ', du: 'ドゥ', de: 'デ', do: 'ド',
    ba: 'バ', bi: 'ビ', bu: 'ブ', be: 'ベ', bo: 'ボ',
    pa: 'パ', pi: 'ピ', pu: 'プ', pe: 'ペ', po: 'ポ',
    va: 'ヴァ', vi: 'ヴィ', ve: 'ヴェ', vo: 'ヴォ',
    ja: 'ジャ', ju: 'ジュ', je: 'ジェ', jo: 'ジョ',
    cha: 'チャ', chu: 'チュ', che: 'チェ', cho: 'チョ',
    sha: 'シャ', shu: 'シュ', she: 'シェ', sho: 'ショ',
    tsu: 'ツ',
  };
  const out = [];
  let i = 0;
  while (i < w.length) {
    const two = w.slice(i, i + 2);
    const three = w.slice(i, i + 3);
    if (cv[three]) { out.push(cv[three]); i += 3; continue; }
    if (cv[two]) { out.push(cv[two]); i += 2; continue; }
    const ch = w[i];
    if (ch === w[i + 1] && /[bcdfgklmnprstvz]/.test(ch)) {
      out.push('ッ');
      i += 1;
      continue;
    }
    if (mora[ch]) { out.push(mora[ch]); i += 1; continue; }
    i += 1;
  }
  let text = kataToHira(out.join(''));
  text = text
    .replace(/おう/g, 'おー')
    .replace(/えい/g, 'えー')
    .replace(/うう/g, 'うー')
    .replace(/いい/g, 'いー')
    .replace(/ああ/g, 'あー');
  return text;
}

function lookupWord(key) {
  if (EXTRA_WORDS[key]) return EXTRA_WORDS[key];
  if (WORD[key]) return kataToHira(WORD[key]);
  return null;
}

const TITLE_FIX = {
  'NO.1': 'なんばーわん',
  'AM11：00': 'えーえむいれぶん',
  'AM11:00': 'えーえむいれぶん',
  'LAT.43°N 〜forty-three degree〜': 'らっとよんじゅうさんどーえぬ',
};

function convertToken(token) {
  if (/^\d+$/.test(token)) {
    if (token === '00') return 'ぜろぜろ';
    if (token === '11') return 'いれぶん';
    return kataToHira([...token].map((d) => DIGIT[d]).join(''));
  }
  const key = token.toLowerCase().replace(/'/g, '');
  const known = lookupWord(key);
  if (known) return known;
  const isAcronym = token.length <= 3 && token === token.toUpperCase() && /[A-Z]/.test(token);
  if (isAcronym) return kataToHira(spellLetters(token));
  const pronounced = phonetic(key);
  return pronounced || kataToHira(spellLetters(key));
}

/** CamelCase と記号で語を分ける */
function splitTokens(text) {
  const spaced = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.match(/[A-Za-z0-9']+|[\u3040-\u30FFー]+/g) || [];
}

/**
 * 曲名（表示用に整えた文字列）をひらがな読みにする。
 * すでに含まれるかなはそのまま残す。
 */
export function englishTitleToHiragana(title) {
  const raw = String(title || '').normalize('NFKC');
  if (TITLE_FIX[raw]) return TITLE_FIX[raw];
  let text = raw;
  text = text.replace(/[＆&]/g, ' and ');
  text = text.replace(/\b([A-Za-z])(?:\.([A-Za-z]))+\.?/g, (m) => m.replace(/\./g, ''));
  text = text.replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2');
  const tokens = splitTokens(text);
  if (!tokens.length) return null;
  const reading = tokens.map((token) => {
    if (/[\u3040-\u30FFー]/.test(token) && !/[A-Za-z0-9]/.test(token)) return kataToHira(token);
    return convertToken(token);
  }).join('');
  const cleaned = foldVu(reading.replace(/[^\u3040-\u309Fーゔ]/g, ''));
  return cleaned || null;
}

/** ゔぁ行を五十音のば行に寄せる（ヴァレンティ → ばれんてぃ） */
export function foldVu(reading) {
  return String(reading || '')
    .replace(/ゔぁ/g, 'ば')
    .replace(/ゔぃ/g, 'び')
    .replace(/ゔぅ/g, 'ぶ')
    .replace(/ゔぇ/g, 'べ')
    .replace(/ゔぉ/g, 'ぼ')
    .replace(/ゔ/g, 'ぶ');
}

/** 読みの中に残った英単語だけをひらがなにする。かな部分は残す。 */
export function kanaizeEmbeddedLatin(ty) {
  if (!ty) return ty;
  const next = String(ty).replace(/[A-Za-z]+(?:'[A-Za-z]+)*/g, (word) => {
    if (word.length === 1) return kataToHira(spellLetters(word));
    return englishTitleToHiragana(word) || word;
  });
  let folded = foldVu(next);
  let prev = '';
  while (folded !== prev) {
    prev = folded;
    folded = folded.replace(/([ぁ-んゔー])[ \t]+([ぁ-んゔー])/g, '$1$2');
  }
  return folded;
}

export function firstKanaOfReading(reading) {
  if (!reading) return null;
  const ch = [...reading].find((c) => /[ぁ-んァ-ヶ]/.test(c));
  return ch ? kataToHira(ch) : null;
}
