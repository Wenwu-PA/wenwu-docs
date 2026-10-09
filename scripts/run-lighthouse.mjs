import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const port = 4174;
const origin = `http://127.0.0.1:${port}`;
const basePath = process.env.VITE_BASE_PATH ?? '/wenwu-docs/';
const baseUrl = `${origin}${basePath.endsWith('/') ? basePath : `${basePath}/`}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore', windowsHide: true });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(baseUrl)).ok) return; } catch { /* Vite preview is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Preview server did not become available at ${baseUrl}`);
}

try {
  await waitForServer();
  await mkdir('node_modules/.tmp', { recursive: true });
  const reportPath = path.resolve('node_modules/.tmp/lighthouse.json');
  const cli = spawn(process.execPath, [
    'node_modules/lighthouse/cli/index.js', baseUrl,
    '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
    '--preset=desktop', '--only-categories=performance,accessibility,best-practices,seo',
    '--output=json', `--output-path=${reportPath}`, '--quiet',
  ], { stdio: 'inherit', windowsHide: true, env: { ...process.env, CHROME_PATH: process.env.CHROME_PATH ?? chromium.executablePath() } });
  const exitCode = await new Promise((resolve, reject) => {
    cli.once('error', reject);
    cli.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Lighthouse exited with code ${exitCode}`);

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const percent = (id) => Math.round((report.categories[id]?.score ?? 0) * 100);
  const metrics = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift']
    .map((id) => `- ${report.audits[id].title}: ${report.audits[id].displayValue ?? '—'}`);
  const summary = [
    '# Lighthouse', '',
    `Проверено: ${new Date(report.fetchTime).toLocaleString('ru-RU')}`, '',
    '| Категория | Оценка |', '|---|---:|',
    `| Производительность | ${percent('performance')} |`,
    `| Доступность | ${percent('accessibility')} |`,
    `| Лучшие практики | ${percent('best-practices')} |`,
    `| SEO | ${percent('seo')} |`, '', '## Основные метрики', '', ...metrics, '',
    'Сгенерировано `npm run lighthouse` на локальном production-превью. Оценки Lighthouse зависят от оборудования и версии Chromium.',
  ].join('\n');
  await writeFile('docs/LIGHTHOUSE.md', `${summary}\n`);
  console.log('Wrote docs/LIGHTHOUSE.md');
} finally {
  server.kill();
}
