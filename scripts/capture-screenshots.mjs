import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const basePath = process.env.VITE_BASE_PATH ?? '/wenwu-docs/';
const baseUrl = `${origin}${basePath.endsWith('/') ? basePath : `${basePath}/`}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  stdio: 'ignore', windowsHide: true,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(baseUrl)).ok) return; } catch { /* Vite preview is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Preview server did not become available at ${baseUrl}`);
}

try {
  await waitForServer();
  const manifest = JSON.parse(await readFile('public/data/manifest.json', 'utf8'));
  const byId = new Map(manifest.nodes.map((node) => [node.id, node]));
  const task = manifest.nodes
    .filter((node) => node.type === 'file' && node.contentFile && ['.py', '.cpp', '.cs', '.sql'].includes(node.ext))
    .sort((a, b) => {
      return (byId.get(b.parentId)?.lastCommit.date ?? '').localeCompare(byId.get(a.parentId)?.lastCommit.date ?? '');
    })[0];
  if (!task) throw new Error('No previewable dated homework/classwork file was found.');
  await mkdir('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('console', (message) => { if (message.type() === 'error') console.error('[browser]', message.text()); });
    page.on('pageerror', (error) => console.error('[pageerror]', error.message));
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Периоды' }).waitFor();
      await page.screenshot({ path: path.join('docs/screenshots', `archive-${width}.png`), fullPage: true });
      await page.goto(`${baseUrl}#/file/${task.id}`, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: task.title }).waitFor();
      await page.screenshot({ path: path.join('docs/screenshots', `assignment-${width}.png`), fullPage: true });
      console.log(`Captured archive and assignment at ${width}px.`);
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
