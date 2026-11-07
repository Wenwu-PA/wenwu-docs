import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { ArchiveManifest } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/utils/settings';

const manifest: ArchiveManifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
const files = manifest.nodes.filter((node) => node.type === 'file');
const pdf = files.find((node) => node.path === 'classwork-2026/english/07.11.2026/Python_A1_Practical_Converted.pdf');
const code = files.find((node) => node.ext === '.py' && node.contentFile);

async function expectNoPageOverflow(page: Page, width: number) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).overflowX)).not.toBe('hidden');
}

for (const theme of ['light', 'dark'] as const) for (const width of [390, 360]) {
  test.describe(`${theme} ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((settings) => localStorage.setItem('wenwu-settings-v1', JSON.stringify(settings)), { ...DEFAULT_SETTINGS, theme });
    });

    test('PDF has no horizontal page scroll after rendering', async ({ page }) => {
      expect(pdf, 'The reported PDF must be present').toBeTruthy();
      await page.goto(`/#/file/${pdf!.id}`);
      await expect(page.locator('.pdf-pages canvas').first()).toBeVisible();
      await expectNoPageOverflow(page, width);
      await expect(page.locator('.assignment-path')).toHaveAttribute('title', pdf!.path);
    });

    test('very long filename with spaces, Cyrillic and # has no horizontal page scroll', async ({ page }) => {
      expect(code).toBeTruthy();
      const name = `Очень длинное имя # ${'Практическая_работа-по-программированию_'.repeat(8)}${'filename'.repeat(20)}.py`;
      const changed = structuredClone(manifest);
      const node = changed.nodes.find((item) => item.id === code!.id)!;
      node.name = name;
      node.title = name.slice(0, -3);
      node.path = `${node.path.slice(0, node.path.lastIndexOf('/') + 1)}${name}`;
      await page.route('**/data/manifest.json?*', (route) => route.fulfill({ json: changed }));
      await page.goto(`/#/file/${node.id}`);
      await expect(page.locator('.solution-code .line').first()).toBeVisible();
      await expect(page.locator('.assignment-heading')).toHaveText(node.title);
      await expect(page.locator('.solution-name')).toHaveAttribute('title', name);
      await expectNoPageOverflow(page, width);
    });

    test('all preview types and unavailable preview fit the page', async ({ page }) => {
      const samples = [
        { name: 'DOCX', file: files.find((node) => node.ext === '.docx' && node.previewHtml), selector: '.office-preview' },
        { name: 'Jupyter', file: files.find((node) => node.ext === '.ipynb' && node.notebookFile), selector: '.notebook-code pre.shiki' },
        { name: 'code', file: code, selector: '.solution-code .line' },
        { name: 'markdown', file: files.find((node) => node.ext === '.md' && node.contentFile), selector: '.markdown-view' },
        { name: 'image', file: files.find((node) => ['.png', '.jpg', '.jpeg'].includes(node.ext) && node.contentFile), selector: '.solution-image' },
        { name: 'no preview', file: files.find((node) => !node.contentFile && !node.previewHtml && !node.notebookFile && !node.conversionError && !['.pdf', '.ipynb'].includes(node.ext)), selector: '.solution-panel > p' },
      ];
      for (const sample of samples) await test.step(sample.name, async () => {
        expect(sample.file, `Missing ${sample.name} sample`).toBeTruthy();
        await page.goto(`/#/file/${sample.file!.id}`);
        await expect(page.locator(sample.selector).first()).toBeVisible();
        if (sample.name === 'image') await expect.poll(() => page.locator('.solution-image').evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        await expectNoPageOverflow(page, width);
      });
    });
  });
}

test('large notebook keeps all cells and offers original downloads for hidden outputs', async ({ page }) => {
  const notebook = files.find((node) => node.path === 'classwork-2026/base alg/08-10-2026/index.ipynb');
  expect(notebook?.notebookFile).toBeTruthy();
  const preview = JSON.parse(readFileSync(`public${notebook!.notebookFile}`, 'utf8'));
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto(`/#/file/${notebook!.id}`);
  await expect(page.locator('.notebook-cell')).toHaveCount(preview.cellCount);
  await expect(page.locator('.notebook-output--hidden').first()).toContainText('вывод скрыт: слишком большой');
  await expect(page.locator('.notebook-output--hidden a').first()).toHaveAttribute('href', notebook!.rawUrl!);
  await expectNoPageOverflow(page, 360);
});
