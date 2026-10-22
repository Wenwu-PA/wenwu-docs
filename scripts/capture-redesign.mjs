import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/data/manifest.json', 'utf8'));
const source = manifest.nodes.find((node) => node.type === 'file' && node.ext === '.py' && node.contentFile);
if (!source) throw new Error('No previewable Python file available for assignment screenshot.');
const output = 'docs/screenshots/redesign';
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { stdio: 'ignore' });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => localStorage.setItem('wenwu-settings-v1', JSON.stringify({ version: 1, theme: 'dark', textSize: 'normal', codeSize: 14, wrapCode: false, lineNumbers: true, highlightTheme: 'auto', historyLimit: 20, diaryUrl: '', diaryTemplate: 'Работа: {title}', zipFileName: '{title}.zip' })));
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetch('http://127.0.0.1:4174'); if (response.ok) { ready = true; break; } } catch { /* Wait for Vite. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Vite preview did not start.');
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Периоды' }).waitFor();
  await page.screenshot({ path: `${output}/home-after.png`, fullPage: true });
  await page.goto(`http://127.0.0.1:4174/#/file/${source.id}`, { waitUntil: 'networkidle' });
  await page.locator('.solution-code').waitFor();
  await page.screenshot({ path: `${output}/assignment-after.png`, fullPage: true });
  await page.goto('http://127.0.0.1:4174/#/settings', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Настройки' }).waitFor();
  await page.screenshot({ path: `${output}/settings-after.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${output}/archive-mobile-after.png`, fullPage: true });
} finally {
  await browser.close();
  server.kill();
}
