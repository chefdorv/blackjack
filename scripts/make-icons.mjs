// Génère les icônes PNG de la PWA à partir de public/icon.svg, avec le Chrome installé sur la machine.
// Usage : npm run icons   (variable CHROME_PATH pour un autre navigateur)
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svg = readFileSync('public/icon.svg', 'utf8');
const targets = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/maskable-512.png', 512],
  ['public/icons/apple-touch-icon.png', 180],
];

const browser = await chromium.launch({ executablePath: CHROME });
for (const [file, size] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: file, omitBackground: false });
  await page.close();
  console.log('écrit', file);
}
await browser.close();
