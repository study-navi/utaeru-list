#!/usr/bin/env node
/**
 * お問い合わせ導線（Google フォーム定数）の単体・埋め込み確認
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTACT_FORM_URL,
  isGoogleFormUrl,
  expectedContactHref,
  contactFormBrowserSnippet,
} from './lib/contact-form.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

if (isGoogleFormUrl('https://docs.google.com/forms/d/e/xxxx/viewform')) ok('docs.google.com/forms を受理');
else fail('docs.google.com/forms を受理');
if (isGoogleFormUrl('https://forms.gle/abc')) ok('forms.gle を受理');
else fail('forms.gle を受理');
if (!isGoogleFormUrl('')) ok('空文字は無効');
else fail('空文字は無効');
if (!isGoogleFormUrl('https://example.com/forms')) ok('他ドメインは無効');
else fail('他ドメインは無効');
if (!isGoogleFormUrl('http://docs.google.com/forms/d/e/x/viewform')) ok('http は無効');
else fail('http は無効');

const expected = expectedContactHref();
if (isGoogleFormUrl(CONTACT_FORM_URL)) {
  if (expected === String(CONTACT_FORM_URL).trim()) ok('expectedContactHref = フォーム URL');
  else fail('expectedContactHref = フォーム URL', expected);
} else if (expected === 'contact.html') ok('未設定時は contact.html');
else fail('未設定時は contact.html', expected);

const snippet = contactFormBrowserSnippet();
if (snippet.includes('CONTACT_FORM_URL') && snippet.includes('applyContactFormLinks')) ok('browser snippet');
else fail('browser snippet');
if (snippet.includes('noopener noreferrer')) ok('snippet: rel');
else fail('snippet: rel');

const files = [
  'index.html',
  'hiro.html',
  'guide.html',
  'terms.html',
  'privacy.html',
  'contact.html',
];
for (const rel of files) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (html.includes('// @contact-form-inject') && html.includes('applyContactFormLinks()')) ok(`${rel}: inject`);
  else fail(`${rel}: inject`);
  if (/class="[^"]*contact-form-link/.test(html)) ok(`${rel}: contact-form-link`);
  else fail(`${rel}: contact-form-link`);
}
const build404 = fs.readFileSync(path.join(ROOT, 'scripts/build-404-html.mjs'), 'utf8');
if (build404.includes('contactFormBrowserSnippet') && build404.includes('contact-form-link')) ok('build-404-html: フォーム同期');
else fail('build-404-html: フォーム同期');

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (/バグを報告する/.test(index)) fail('index: 独立ボタンなし');
else ok('index: 独立ボタンなし');
const hiro = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');
if (/バグを報告する/.test(hiro)) fail('hiro: 独立ボタンなし');
else ok('hiro: 独立ボタンなし');

const html404 = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
if (html404.includes('applyContactFormLinks()') && /class="[^"]*contact-form-link/.test(html404)) ok('404.html: フォーム導線');
else fail('404.html: フォーム導線');
if (/バグを報告する/.test(html404)) fail('404: 独立ボタンなし');
else ok('404: 独立ボタンなし');

if (failed) {
  console.error(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
