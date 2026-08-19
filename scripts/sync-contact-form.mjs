#!/usr/bin/env node
/**
 * CONTACT_FORM_URL を HTML / 404 生成スクリプトへ同期する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { contactFormBrowserSnippet } from './lib/contact-form.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = '// @contact-form-inject';
const END = '// @end-contact-form-inject';

const FILES = [
  'index.html',
  'hiro.html',
  'guide.html',
  'terms.html',
  'privacy.html',
  'contact.html',
];

function replaceInjectBlock(src) {
  const block = `${START}
${contactFormBrowserSnippet().trimEnd()}
${END}`;
  const re = new RegExp(
    `${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  );
  if (!re.test(src)) throw new Error('contact-form inject block not found');
  return src.replace(re, block);
}

for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  const next = replaceInjectBlock(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, next);
  console.log('synced', rel);
}

execSync('node scripts/build-404-html.mjs', { cwd: ROOT, stdio: 'inherit' });
execSync('node scripts/sync-viewer-template.mjs', { cwd: ROOT, stdio: 'inherit' });
