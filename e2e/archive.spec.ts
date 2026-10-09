import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8')) as {
  nodes: { id: string; name: string; path: string; type: string; ext: string; contentFile: string | null; previewHtml?: string | null }[];
};
const sourceFile = manifest.nodes.find((node) => node.type === 'file' && node.ext === '.py' && node.contentFile);
const docxFile = manifest.nodes.find((node) => node.type === 'file' && node.ext === '.docx' && node.previewHtml);
const csharpFile = manifest.nodes.find((node) => node.type === 'file' && node.ext === '.cs' && node.path.includes('c#') && node.contentFile);

test('home page, search shortcut and topic tree', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Периоды' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const search = page.getByRole('textbox', { name: 'Поиск по названию или пути' });
  await expect(search).toBeFocused();
  await search.fill('matrix.py');
  await expect(page.getByRole('heading', { name: 'Результаты поиска' })).toBeVisible();
  await expect(page.getByRole('link', { name: /matrix/ }).first()).toBeVisible();
  await search.clear();
  await page.getByRole('link', { name: 'Открыть дерево файлов →' }).click();
  await expect(page.getByRole('heading', { name: 'Дерево файлов / IT-TOP_academy' })).toBeVisible();
  await expect(page.getByRole('tree')).toBeVisible();
});

test('file preview has a permanent line link and supports diary export', async ({ page }) => {
  test.skip(!sourceFile, 'No previewable Python source file in the content repository.');
  await page.goto(`/#/file/${sourceFile!.id}`);
  await expect(page.getByRole('heading', { name: sourceFile!.name.replace(/\.py$/, '') })).toBeVisible();
  const line = page.locator('.solution-code .line').first();
  await expect(line).toBeVisible();
  await line.click();
  await expect(page).toHaveURL(/line=1/);
  await page.reload();
  await expect(page.locator('.solution-code .line.is-line-target')).toBeVisible();
  await page.getByRole('button', { name: 'В дневник' }).first().click();
  await expect(page.getByRole('dialog', { name: 'В дневник' })).toBeVisible();
  await expect(page.locator('#diary-preview')).toContainText(sourceFile!.name.replace(/\.py$/, ''));
  await page.getByRole('button', { name: 'Отметить отправленной' }).click();
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.locator('.status-label')).toHaveText('ОТПРАВЛЕНО');
  await page.reload();
  await expect(page.locator('.status-label')).toHaveText('ОТПРАВЛЕНО');
});

test('local editor loads and keeps a downloadable draft', async ({ page }) => {
  test.skip(!sourceFile, 'No previewable Python source file in the content repository.');
  await page.goto(`/#/edit/${sourceFile!.id}`);
  await expect(page.locator('.cm-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Показать diff' }).click();
  await expect(page.getByRole('heading', { name: 'Изменения' })).toBeVisible();
});

test('archive and file page stay within target viewports', async ({ page }) => {
  test.skip(!sourceFile, 'No previewable Python source file in the content repository.');
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Периоды' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.goto(`/#/file/${sourceFile!.id}`);
    await expect(page.getByRole('heading', { name: sourceFile!.name.replace(/\.py$/, '') })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test('periods open subjects and real CW/HW folders', async ({ page }) => {
  await page.goto('/#/y/2026');
  await expect(page.getByRole('heading', { name: 'Период 2026' })).toBeVisible();
  await page.getByRole('link', { name: 'Алгоритмы' }).click();
  await expect(page.getByRole('heading', { name: 'Алгоритмы' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Классная работа' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Домашняя работа' })).toBeVisible();
  await expect(page.getByText('classwork-2026/base alg')).toBeVisible();
});

test('DOCX preview is converted at build time and has the original download', async ({ page }) => {
  test.skip(!docxFile, 'No convertible DOCX in the content repository.');
  await page.goto(`/#/file/${docxFile!.id}`);
  await expect(page.locator('.office-preview')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Скачать оригинал ↗' })).toHaveAttribute('href', /raw\.githubusercontent\.com/);
});

test('preview assets work for repository paths containing #', async ({ page }) => {
  test.skip(!csharpFile, 'No C# file under a # path in the content repository.');
  await page.goto(`/#/file/${csharpFile!.id}`);
  await expect(page.locator('.solution-code')).toContainText('using System');
});
