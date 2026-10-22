import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8')) as {
  nodes: { id: string; name: string; title: string; path: string; type: string; ext: string; contentFile: string | null; previewHtml?: string | null }[];
};
const sourceFile = manifest.nodes.find((node) => node.type === 'file' && node.ext === '.py' && node.contentFile);
const otherSourceFile = manifest.nodes.find((node) => node.type === 'file' && node.ext === '.py' && node.contentFile && node.id !== sourceFile?.id);
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

test('recently opened work appears on the home page and can be cleared in settings', async ({ page }) => {
  test.skip(!sourceFile, 'No previewable Python source file in the content repository.');
  await page.goto('/');
  await page.goto(`/#/file/${sourceFile!.id}`);
  await expect(page.getByRole('heading', { name: sourceFile!.name.replace(/\.py$/, '') })).toBeVisible();
  await page.goBack();
  await expect(page.locator(`.recent-section a[href$="/file/${sourceFile!.id}"]`)).toBeVisible();
  await expect(page.locator(`.recent-sidebar a[href$="/file/${sourceFile!.id}"]`)).toBeVisible();
  await page.getByRole('link', { name: 'Настройки' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Очистить историю посещений/ }).click();
  await page.getByRole('link', { name: '← Вернуться в архив' }).click();
  await expect(page.locator('.recent-section')).toContainText('Открытые страницы заданий появятся здесь.');
  await expect(page.locator('.recent-sidebar')).toContainText('Открытых работ пока нет');
});

test('visit history synchronizes across tabs through the storage event', async ({ page, context }) => {
  test.skip(!otherSourceFile, 'No second Python source file in the content repository.');
  await page.goto('/');
  const otherTab = await context.newPage();
  await otherTab.goto('/');
  const visit = { id: otherSourceFile!.id, path: otherSourceFile!.path, title: otherSourceFile!.title, visitedAt: Date.now() };
  await otherTab.evaluate((entry) => localStorage.setItem('wenwu-recent-visits-v1', JSON.stringify([entry])), visit);
  await expect(page.locator(`.recent-section a[href$="/file/${otherSourceFile!.id}"]`)).toBeVisible();
  await expect(page.locator(`.recent-sidebar a[href$="/file/${otherSourceFile!.id}"]`)).toBeVisible();
  await otherTab.close();
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
  for (const { width, height } of [{ width: 1440, height: 844 }, { width: 1080, height: 1920 }, { width: 1024, height: 844 }, { width: 768, height: 844 }, { width: 390, height: 844 }]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Периоды' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.goto(`/#/file/${sourceFile!.id}`);
    await expect(page.getByRole('heading', { name: sourceFile!.name.replace(/\.py$/, '') })).toBeVisible();
    if (width <= 850) await page.locator('.solution-toolbar button').first().waitFor();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test('periods open subjects and real CW/HW folders', async ({ page }) => {
  await page.goto('/#/y/2026');
  await expect(page.getByRole('heading', { name: 'Период 2026' })).toBeVisible();
  await page.getByRole('link', { name: 'Алгоритмы' }).click();
  await expect(page.getByRole('heading', { name: 'Алгоритмы' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Классная работа 2026 год/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Домашняя работа 2026 год/ })).toBeVisible();
  await expect(page.getByText('classwork-2026/base alg')).toBeVisible();
});

test('course number is 03 and year-specific subject pages label the work year', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero-count')).toHaveText('[ 03 ]');
  await page.goto('/#/y/2025/discrete-math');
  await expect(page.getByRole('heading', { name: /Классная работа 2025 год/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Домашняя работа 2025 год/ })).toBeVisible();
  await expect(page.locator('.assignment-path')).not.toContainText('2026');
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

test('settings page exposes appearance, local data, diary and project sections', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  for (const title of ['Внешний вид', 'Навигация и история', 'Дневник', 'Данные', 'О проекте'])
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByLabel('Тема')).toHaveValue('system');
  await page.getByLabel('Размер текста').selectOption('large');
  await expect.poll(() => page.locator('html').evaluate((el) => getComputedStyle(el).getPropertyValue('--text-scale').trim())).toBe('1.125');
  await expect(page.getByLabel('Шаблон записи')).toHaveValue(/\{githubUrl\}/);
});

test('settings exports and imports local data as one JSON file', async ({ page }) => {
  await page.goto('/#/settings');
  await page.evaluate(() => {
    localStorage.setItem('wenwu-draft:export-check', 'saved draft');
    localStorage.setItem('wenwu-diary-log-v1', JSON.stringify([{ id: 'one', status: 'prepared' }]));
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать JSON' }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path() ?? '', 'utf8')) as { format: string; data: Record<string, string> };
  expect(exported.format).toBe('wenwu-local-data');
  expect(exported.data['wenwu-draft:export-check']).toBe('saved draft');
  expect(exported.data['wenwu-diary-log-v1']).toContain('prepared');

  const settings = { version: 1, theme: 'dark', historyLimit: 50, textSize: 'normal', codeSize: 14, wrapCode: false, lineNumbers: true, highlightTheme: 'auto', diaryUrl: '', diaryTemplate: 'Imported {title}', zipFileName: '{title}.zip' };
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('input[type="file"]').setInputFiles({
    name: 'archive-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'wenwu-local-data', version: 1, data: { 'wenwu-settings-v1': JSON.stringify(settings), 'wenwu-draft:restored': 'restored draft', 'wenwu-diary-log-v1': '[]' } })),
  });
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('wenwu-draft:restored'))).toBe('restored draft');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('wenwu-settings-v1') ?? '{}').historyLimit)).toBe(50);
});

test('source previews highlight Python, C#, C++ and SQL with Shiki tokens', async ({ page }) => {
  const samples = ['.py', '.cs', '.cpp', '.sql'].map((ext) => manifest.nodes.find((node) => node.type === 'file' && node.ext === ext && node.contentFile)).filter(Boolean);
  test.skip(samples.length !== 4, 'All four source languages are needed for this check.');
  for (const file of samples) {
    await page.goto(`/#/file/${file!.id}`);
    await expect(page.locator('.solution-code .line').first()).toBeVisible();
    await expect(page.locator('.solution-code span[style*="color"]').first()).toBeVisible();
  }
});

test('contrast meets WCAG text thresholds on all archive pages, viewport sizes and themes', async ({ context }) => {
  test.setTimeout(120_000);
  const year = manifest.nodes.find((node) => node.path.match(/^(?:classwork|homework)-(\d{4})\//))?.path.match(/^(?:classwork|homework)-(\d{4})\//)?.[1] ?? '2026';
  const topic = manifest.nodes.find((node) => node.topic)?.topic ?? 'algorithms';
  const py = manifest.nodes.find((node) => node.type === 'file' && node.ext === '.py' && node.contentFile);
  const docx = manifest.nodes.find((node) => node.type === 'file' && node.ext === '.docx' && node.previewHtml);
  test.skip(!py || !docx, 'A Python file and converted DOCX preview are needed for the contrast audit.');
  const viewports = [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }];
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const pages = [
    '/', `/#/y/${year}`, `/#/subject/${encodeURIComponent(topic)}`, `/#/file/${py!.id}`, `/#/file/${docx!.id}`, '/#/?q=algorithm', '/#/settings',
  ];
  for (const theme of ['light', 'dark']) for (const path of pages) {
    const auditPage = await context.newPage();
    await auditPage.setViewportSize(viewports[0]);
    await auditPage.addInitScript((selectedTheme) => {
      localStorage.setItem('wenwu-settings-v1', JSON.stringify({ version: 1, theme: selectedTheme, textSize: 'normal', codeSize: 14, wrapCode: false, lineNumbers: true, highlightTheme: 'auto', historyLimit: 20, diaryUrl: '', diaryTemplate: 'Работа: {title}', zipFileName: '{title}.zip' }));
    }, theme);
    await auditPage.goto(path);
    if (path === '/') await auditPage.getByRole('heading', { name: 'Периоды' }).waitFor();
    if (path.includes('?q=')) await auditPage.getByRole('heading', { name: 'Результаты поиска' }).waitFor();
    if (path.includes(docx!.id)) await auditPage.locator('.office-preview').waitFor();
    if (path.includes(py!.id)) await auditPage.locator('.solution-code .line').first().waitFor();
    const result = await new AxeBuilder({ page: auditPage }).withRules(['color-contrast']).analyze();
    expect(result.violations, `${theme} ${path}`).toEqual([]);
    for (const viewport of viewports.slice(1)) {
      await auditPage.setViewportSize(viewport);
      await expect.poll(() => auditPage.evaluate(() => document.documentElement.scrollWidth), { message: `${theme} ${viewport.width}px ${path}` }).toBeLessThanOrEqual(viewport.width);
    }
    await auditPage.close();
  }
});
