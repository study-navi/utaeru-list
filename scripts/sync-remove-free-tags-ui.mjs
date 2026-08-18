#!/usr/bin/env node
/**
 * 自由タグ UI を editor / viewer から撤去（データ保存パスは維持）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function patchHiro(html) {
  html = html.replace(/\n  <div class="filter-row" id="tagFilterRow" style="display:none;"><\/div>/, '');

  html = html.replace(
    /const tagFilterRow = document\.getElementById\('tagFilterRow'\);\n/,
    '',
  );

  html = html.replace(
    /\/\/ ---- Phase 3: タグフィルタ[\s\S]*?tagFilterRow\.appendChild\(chip\);\n  \}\);\n\}\n\n/,
    '',
  );

  html = html.replace(
    /  if \(activeTags\.size > 0\) \{\n    const labels = \[\.\.\.activeTags\]\.map\(id => \{\n      const t = TAG_PRESETS\.find\(t => t\.id === id\);\n      return t \? t\.label : null;\n    \}\)\.filter\(Boolean\);\n    if \(labels\.length\) parts\.push\(labels\.join\(' \/ '\)\);\n  \}\n/,
    '',
  );

  function stripTagDisplay(fnBody) {
    return fnBody.replace(
      /  const tagObjs = Array\.isArray\(meta\.tags\)[\s\S]*?const tagsHtml = tagObjs\.length[\s\S]*?: '';\n/g,
      '',
    ).replace(/\n      \$\{tagsHtml\}/g, '');
  }

  html = html.replace(/function songRowHtml\(s, q\) \{[\s\S]*?\n\}/, (block) => stripTagDisplay(block));
  html = html.replace(/function flatSongRowHtml\(s, q\) \{[\s\S]*?\n\}/, (block) => stripTagDisplay(block));

  return html;
}

function patchIndex(html) {
  html = html.replace(
    /      <div class="ui-field-group">\n        <h3>タグの候補（任意）<\/h3>[\s\S]*?        <\/div>\n      <\/div>\n      <div class="ui-field-group">\n        <h3>バックアップ・書き出し<\/h3>/,
    `      <div class="ui-field-group">
        <h3>バックアップ・書き出し</h3>`,
  );

  html = html.replace(
    /\/\/ Phase 2: タグ候補の初期値（プリセット）。配信者は「⑤ タグの候補を編集」で追加・削除できる。\n\/\/ インポート時は既存のフォールバック処理により config\.tagPresets（配列なら）で完全に上書きされる。\nconst DEFAULT_TAG_PRESETS = \[[\s\S]*?\];\nlet tagPresets = DEFAULT_TAG_PRESETS\.map\(t => \(\{ \.\.\.t \}\)\); \/\/ \{ id: string, label: string, color\?: string\|null \}\[\]/,
    `// 互換用: 旧 DEFAULT_TAG_PRESETS（UI では未使用。既存 import / 公開データの tagPresets は保持）
const DEFAULT_TAG_PRESETS = [
  { id: 'ballad', label: 'バラード' },
  { id: 'upbeat', label: '盛り上がる' },
  { id: 'quiet', label: '静か' },
  { id: 'male', label: '男性曲' },
  { id: 'female', label: '女性曲' },
  { id: 'request', label: 'リクエスト歓迎' },
];
let tagPresets = []; // 新規は空。既存データは import / draft / 公開復元で上書き`,
  );

  html = html.replace(
    /  if \(Array\.isArray\(data\.tagPresets\) && data\.tagPresets\.length\) \{\n    tagPresets = data\.tagPresets\.map\(t => \(\{\n      id: t\.id,\n      label: t\.label,\n      \.\.\.\(t\.color != null \? \{ color: t\.color \} : \{\}\),\n    \}\)\);\n  \} else \{\n    tagPresets = DEFAULT_TAG_PRESETS\.map\(t => \(\{ \.\.\.t \}\)\);\n  \}\n\n  expandedKeys\.clear\(\);\n  renderTagAdmin\(\);/,
    `  if (Array.isArray(data.tagPresets)) {
    tagPresets = data.tagPresets.map(t => ({
      id: t.id,
      label: t.label,
      ...(t.color != null ? { color: t.color } : {}),
    }));
  } else {
    tagPresets = [];
  }

  expandedKeys.clear();`,
  );

  html = html.replace(
    /  if \(meta\.tags && meta\.tags\.length\) parts\.push\(`<span class="song-badge" title="タグ\$\{meta\.tags\.length\}件">🏷\$\{meta\.tags\.length\}<\/span>`\);\n/,
    '',
  );

  html = html.replace(
    /function songPanelHtml\(s\) \{[\s\S]*?  const tags = meta\.tags \|\| \[\];\n  const addedAt = meta\.addedAt \|\| '';\n\n  const markButtons = MARK_OPTIONS\.map\(opt => `[\s\S]*?  const tagChips = tagPresets\.length[\s\S]*?: `<span class="tag-empty-hint">タグ候補がまだありません。「管理」から追加できます<\/span>`;\n\n  return `\n    <div class="song-meta-panel">\n      <div class="meta-block">\n        <div class="meta-block-label">この曲につけるマーク<\/div>\n        <div class="mark-row">\$\{markButtons\}<\/div>\n      <\/div>\n      <div class="meta-block">\n        <div class="meta-block-label">自由タグ（複数選べます）<\/div>\n        <div class="tag-chip-row">\$\{tagChips\}<\/div>\n      <\/div>\n      <div class="meta-block">/,
    `function songPanelHtml(s) {
  const key = keyOf(s);
  const meta = songMeta[key] || {};
  const marks = normalizedMarks(meta);
  const addedAt = meta.addedAt || '';

  const markButtons = MARK_OPTIONS.map(opt => \`
    <button type="button" class="mark-btn \${marks.includes(opt.value) ? 'active' : ''}" data-key="\${escapeHtml(key)}" data-value="\${opt.value}">\${escapeHtml(opt.label)}</button>
  \`).join('');

  return \`
    <div class="song-meta-panel">
      <div class="meta-block">
        <div class="meta-block-label">この曲につけるマーク</div>
        <div class="mark-row">\${markButtons}</div>
      </div>
      <div class="meta-block">`,
  );

  html = html.replace(
    /  const tagChip = e\.target\.closest\('\.song-tag-chip'\);\n  if \(tagChip\) \{\n    const key = tagChip\.dataset\.key;\n    const tagId = tagChip\.dataset\.tagId;\n    updateSongMeta\(key, m => \{\n      const set = new Set\(m\.tags \|\| \[\]\);\n      if \(set\.has\(tagId\)\) set\.delete\(tagId\); else set\.add\(tagId\);\n      m\.tags = \[\.\.\.set\];\n    \}\);\n    return;\n  \}\n/,
    '',
  );

  html = html.replace(
    /function previewSongRowHtml\(s\) \{[\s\S]*?  const tagObjs = Array\.isArray\(meta\.tags\)[\s\S]*?  const tagsHtml = tagObjs\.length[\s\S]*?: '';\n  return `\n    <li>\n      <div class="pv-song-main">\n        <span class="pv-song-title">\$\{escapeHtml\(s\.t\)\}<\/span>\n        \$\{badges\.length \? `<span class="pv-badges">\$\{badges\.join\(''\)\}<\/span>` : ''\}\n      <\/div>\n      \$\{previewMarksRowHtml\(meta\)\}\n      \$\{tagsHtml\}\n    <\/li>`;\n\}/,
    `function previewSongRowHtml(s) {
  const meta = songMeta[keyOf(s)] || {};
  const badges = [];
  if (isCurrentNewBatchSong(s)) badges.push('<span class="pv-badge v-badge-utaemo-new" title="UTAEMO新着">NEW</span>');
  if (previewIsNewArrival(meta.addedAt)) badges.push('<span class="pv-badge" title="リスト追加から30日以内">🆕</span>');
  return \`
    <li>
      <div class="pv-song-main">
        <span class="pv-song-title">\${escapeHtml(s.t)}</span>
        \${badges.length ? \`<span class="pv-badges">\${badges.join('')}</span>\` : ''}
      </div>
      \${previewMarksRowHtml(meta)}
    </li>\`;
}`,
  );

  html = html.replace(
    /  const usedTagIds = new Set\(\);\n  songs\.forEach\(s => \{\n    const m = songMeta\[keyOf\(s\)\];\n    if \(m && Array\.isArray\(m\.tags\)\) m\.tags\.forEach\(id => usedTagIds\.add\(id\)\);\n  \}\);\n  const usedTags = tagPresets\.filter\(t => usedTagIds\.has\(t\.id\)\);\n  const hasNewArrival = songs\.some\(s => previewIsNewArrival\(\(songMeta\[keyOf\(s\)\] \|\| \{\}\)\.addedAt\)\);\n/,
    `  const hasNewArrival = songs.some(s => previewIsNewArrival((songMeta[keyOf(s)] || {}).addedAt));\n`,
  );

  html = html.replace(
    /  const tagChips = usedTags\.length\n    \? usedTags\.map\(t => `<span class="pv-chip">\$\{escapeHtml\(t\.label\)\}<\/span>`\)\.join\(''\)\n    : '';\n\n/,
    '',
  );

  html = html.replace(
    /\n    \$\{tagChips \? `<div class="pv-filter-row">\$\{tagChips\}<\/div>` : ''\}/,
    '',
  );

  html = html.replace(/\n  renderTagAdmin\(\);/g, (m, offset) => {
    const before = html.slice(Math.max(0, offset - 80), offset);
    if (before.includes('expandedKeys.clear()') || before.includes('applyPublicDataToBuilder')) return m;
    return '';
  });

  html = html.replace(/\nrenderTagAdmin\(\);\ninitEditTabs\(\);/, '\ninitEditTabs();');

  return html;
}

function main() {
  for (const file of ['hiro.html', 'index.html']) {
    const p = path.join(ROOT, file);
    const src = fs.readFileSync(p, 'utf8');
    const out = file === 'hiro.html' ? patchHiro(src) : patchIndex(src);
    if (out === src) console.warn(`warn: no changes in ${file}`);
    else fs.writeFileSync(p, out);
    console.log(`patched ${file}`);
  }
  execSync('node scripts/build-404-html.mjs', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/sync-viewer-template.mjs', { cwd: ROOT, stdio: 'inherit' });
}

main();
