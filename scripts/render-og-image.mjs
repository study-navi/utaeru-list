#!/usr/bin/env node
/**
 * og-image.svg を 1200x630 PNG に書き出す（OGP / SNS 共有用）。
 * 依存: playwright（devDependencies 相当）
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = path.join(ROOT, 'og-image.svg');
const out = path.join(ROOT, 'og-image.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('file://' + svg);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log('Wrote', out, '(1200x630)');
