import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { manifestSchema } from '../scripts/manifest-schema.mjs';
import { classifyTopic, classifyWorkPath, githubPathUrl, latestTaskActivityDate, normalizePath, normalizeTopic, stableId } from '../scripts/manifest-utils.mjs';
import { renderDiaryTemplate } from '../src/utils/diaryTemplate';
import type { ArchiveNode } from '../src/types';
import { clearVisitHistory, readVisitHistory, recordVisit, VISIT_HISTORY_KEY, type StorageLike } from '../src/utils/visitHistory';
import { sortLatestTasks } from '../src/utils/latestTasks';
import { DEFAULT_SETTINGS, readSettings, SETTINGS_KEY, writeSettings } from '../src/utils/settings';
import { highlightMarkdown } from '../src/utils/highlightCode';
import { detectTaskUnits } from '../scripts/lib/task-detection.mjs';

const topics = YAML.parse(readFileSync('topics.config.yml', 'utf8')).topics.map((topic: { id: string; title: string; aliases: string[] }) => ({
  ...topic,
  tokens: [topic.title, ...topic.aliases].map(normalizeTopic),
}));

describe('manifest', () => {
  it('validates generated structure and rejects unknown node types', () => {
    const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
    expect(manifestSchema.parse(manifest).nodes.length).toBeGreaterThan(0);
    const invalid = structuredClone(manifest);
    invalid.nodes[0].type = 'unknown';
    expect(manifestSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('subject work counts', () => {
  function pathsUnder(relative: string) {
    const directories: string[] = [];
    const files: string[] = [];
    const walk = (folder: string) => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const child = path.posix.join(folder.replaceAll('\\', '/'), entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) { directories.push(child); walk(child); }
        else if (entry.isFile()) files.push(child);
      }
    };
    walk(relative);
    return { directories, files };
  }

  it.each([
    ['classwork-2025/дискретная', 1],
    ['homework-2025/комп сети', 3],
    ['classwork-2026/base alg', 6],
    ['homework-2026/system programming', 1],
  ])('counts real work units for %s', (subject, expected) => {
    const sourcePath = path.posix.join('content-src', subject);
    expect(statSync(sourcePath).isDirectory()).toBe(true);
    const paths = pathsUnder(sourcePath);
    expect(detectTaskUnits(sourcePath, paths.directories, paths.files)).toHaveLength(expected);
  });

  it('keeps the generated subject totals equal to the manifest total', () => {
    const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
    const sum = manifest.topics.reduce((total: number, topic: { total?: number }) => total + (topic.total ?? 0), 0);
    expect(manifest.taskSummary.total).toBe(sum);
  });
});

describe('archive paths and topics', () => {
  it('normalizes separators and preserves stable IDs for Cyrillic paths', () => {
    const path = normalizePath('homework-2026\\base alg\\14-09-2026\\HW');
    expect(path).toBe('homework-2026/base alg/14-09-2026/HW');
    expect(stableId(path)).toBe(stableId(`/${path}/`));
    expect(stableId('домашняя работа/урок.py')).not.toBe(stableId('homework/урок.py'));
  });

  it('maps aliases across case and separators', () => {
    expect(classifyTopic('homework-2025/C#/date/file.cs', topics)).toBe('csharp');
    expect(classifyTopic('classwork-2025/числ методы/date/main.py', topics)).toBe('numerical-methods');
    expect(classifyTopic('classwork-2026/system programming/date/main.c', topics)).toBe('system-programming');
    expect(classifyTopic('classwork-2025/supp_and_test_PO/task/main.cpp', topics)).toBe('software-engineering');
    expect(classifyTopic('homework-2026/manegment/14-09-2026', topics)).toBe('management');
  });

  it('encodes spaces and Cyrillic URL path segments independently', () => {
    expect(githubPathUrl('https://github.com/Wenwu-PA/IT-TOP_academy', 'homework-2026/английский язык/a b.py'))
      .toBe('https://github.com/Wenwu-PA/IT-TOP_academy/blob/main/homework-2026/%D0%B0%D0%BD%D0%B3%D0%BB%D0%B8%D0%B9%D1%81%D0%BA%D0%B8%D0%B9%20%D1%8F%D0%B7%D1%8B%D0%BA/a%20b.py');
  });

  it('detects homework and classwork on year-named roots', () => {
    expect(classifyWorkPath('homework-2026/base alg/14-09-2026')).toEqual({ date: '14.09.2026', kind: 'HW' });
    expect(classifyWorkPath('classwork-2026/english/19.09.2026')).toEqual({ date: '19.09.2026', kind: 'CW' });
    expect(classifyWorkPath('homework-2026/base alg/solution/obj')).toEqual({ date: null, kind: 'HW' });
  });

  it('uses the later of the assignment folder date and the last full commit date', () => {
    expect(latestTaskActivityDate('03.03.2025', '2026-09-29T12:34:56+03:00')).toBe('2026-09-29T09:34:56.000Z');
    expect(latestTaskActivityDate('01.10.2026', '2026-09-29T12:34:56+03:00')).toBe('2026-10-01T00:00:00.000Z');
  });
});

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const visitNodes = Array.from({ length: 25 }, (_, index) => ({
  id: `id-${index}`, path: `homework-2026/topic/${String(index).padStart(2, '0')}`, name: `task-${index}`, type: 'dir', ext: '', language: '', size: 0,
  lines: null, lastCommit: { date: '2026-09-14', hash: null, message: null }, firstCommit: { date: null, hash: null, message: null }, activityDate: '2026-09-14T00:00:00.000Z',
  githubUrl: 'https://example.com/a', rawUrl: null, editUrl: 'https://example.com/a', githubDevUrl: 'https://example.com/a', topic: 'algorithms', tags: [], title: `Task ${index}`, status: null,
  contentFile: null, parentId: null, statement: null, method: null, date: '14.09.2026', workType: 'HW',
} satisfies ArchiveNode));

describe('visit history', () => {
  it('writes, reads, deduplicates, sorts by visit time, and keeps only the newest 20', () => {
    const storage = new MemoryStorage();
    for (let index = 0; index < 25; index++) recordVisit(visitNodes[index], visitNodes, 1_000 + index, storage);
    let history = readVisitHistory(visitNodes, storage);
    expect(history).toHaveLength(20);
    expect(history[0].id).toBe('id-24');
    recordVisit(visitNodes[10], visitNodes, 2_000, storage);
    history = readVisitHistory(visitNodes, storage);
    expect(history).toHaveLength(20);
    expect(history[0].id).toBe('id-10');
    expect(history.filter((entry) => entry.id === 'id-10')).toHaveLength(1);
    expect(JSON.parse(storage.getItem(VISIT_HISTORY_KEY) ?? '[]')).toHaveLength(20);
    clearVisitHistory(storage);
    expect(readVisitHistory(visitNodes, storage)).toEqual([]);
  });

  it('migrates older path and openedAt entries to current stable IDs and drops unknown paths', () => {
    const storage = new MemoryStorage();
    storage.setItem('wenwu-recently-opened', JSON.stringify([
      { id: 'old-id-after-rename', path: visitNodes[3].path, title: 'Old title', openedAt: '2026-10-01T12:00:00.000Z' },
      { id: 'gone', path: 'removed/path', openedAt: '2026-10-01T11:00:00.000Z' },
    ]));
    const history = readVisitHistory(visitNodes, storage);
    expect(history).toEqual([{ id: visitNodes[3].id, path: visitNodes[3].path, title: visitNodes[3].title, visitedAt: Date.parse('2026-10-01T12:00:00.000Z') }]);
    expect(storage.getItem('wenwu-recently-opened')).toBeNull();
    expect(JSON.parse(storage.getItem(VISIT_HISTORY_KEY) ?? '[]')[0].id).toBe(visitNodes[3].id);
  });

  it('keeps an in-memory history when browser storage is unavailable', () => {
    clearVisitHistory(null);
    const blocked: StorageLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    recordVisit(visitNodes[0], visitNodes, 5_000, blocked);
    expect(readVisitHistory(visitNodes, blocked)[0].id).toBe(visitNodes[0].id);
    clearVisitHistory(blocked);
    expect(readVisitHistory(visitNodes, null)).toEqual([]);
  });
});

describe('latest task ordering', () => {
  it('sorts by effective update date and uses path as a deterministic tie-breaker', () => {
    const oldFolderUpdatedRecently = { ...visitNodes[0], path: 'homework-2025/a/01.01', date: '01.01.2025', activityDate: '2026-10-01T12:00:00.000Z' };
    const sameDateLaterPath = { ...visitNodes[1], path: 'homework-2026/z/02.02', activityDate: '2026-10-01T12:00:00.000Z' };
    const sameDateEarlierPath = { ...visitNodes[2], path: 'homework-2026/a/02.02', activityDate: '2026-10-01T12:00:00.000Z' };
    const older = { ...visitNodes[3], activityDate: '2026-09-30T12:00:00.000Z' };
    expect(sortLatestTasks([older, sameDateLaterPath, sameDateEarlierPath, oldFolderUpdatedRecently]).map((node) => node.path))
      .toEqual(['homework-2025/a/01.01', 'homework-2026/a/02.02', 'homework-2026/z/02.02', older.path]);
  });
});

describe('diary template', () => {
  it('substitutes all supported values from a real node', () => {
    const node = {
      id: 'p_test', path: 'homework-2026/base alg/14-09-2026/HW', name: 'main.py', type: 'file', ext: '.py', language: 'Python', size: 15,
      lines: 1, lastCommit: { date: '2026-09-14', hash: null, message: null }, firstCommit: { date: null, hash: null, message: null }, activityDate: null, githubUrl: 'https://example.com/a',
      rawUrl: null, editUrl: 'https://example.com/a', githubDevUrl: 'https://example.com/a', topic: 'algorithms', tags: [], title: 'Поиск', status: null,
      contentFile: null, parentId: null, statement: null, method: null, date: '14-09-2026', workType: 'HW',
    } satisfies ArchiveNode;
    expect(renderDiaryTemplate('{{title}} | {{topic}} | {{type}} | {{date}} | {{path}}', node, 'Алгоритмы'))
      .toBe('Поиск | Алгоритмы | Домашняя работа | 14-09-2026 | homework-2026/base alg/14-09-2026/HW');
    expect(renderDiaryTemplate('{title} {githubUrl} {siteUrl}', node, 'Алгоритмы', 'https://github.com/a', 'https://site.test'))
      .toBe('Поиск https://github.com/a https://site.test');
  });
});

describe('settings storage', () => {
  it('writes a versioned record and fills defaults when migrating an older record', () => {
    const storage = new MemoryStorage();
    writeSettings({ ...DEFAULT_SETTINGS, theme: 'dark', historyLimit: 50 }, storage);
    expect(JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}').version).toBe(1);
    expect(readSettings(storage)).toMatchObject({ theme: 'dark', historyLimit: 50, wrapCode: false });
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 0, theme: 'light', diaryUrl: 'https://example.test' }));
    expect(readSettings(storage)).toMatchObject({ version: 1, theme: 'light', diaryUrl: 'https://example.test', historyLimit: 20 });
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 0 }));
    storage.setItem('wenwu-diary-template-v1', 'legacy {title}');
    expect(readSettings(storage).diaryTemplate).toBe('legacy {title}');
  });

  it('recovers from malformed and inaccessible settings', () => {
    const storage = new MemoryStorage(); storage.setItem(SETTINGS_KEY, '{broken');
    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS);
    const blocked: Pick<Storage, 'getItem'> = { getItem: () => { throw new Error('blocked'); } };
    expect(readSettings(blocked)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('markdown source preview', () => {
  it('renders fenced language blocks with Shiki token spans', async () => {
    const html = await highlightMarkdown('```python\nprint("ready")\n```');
    expect(html).toContain('<pre class="shiki');
    expect(html).toContain('<span class="line">');
    expect(html).toMatch(/<span style="color:/);
  });

  it('keeps unknown fence languages as safe plain text', async () => {
    const html = await highlightMarkdown('```unknown-wenwu\n<plain & safe>\n```');
    expect(html).toContain('&lt;plain &amp; safe&gt;');
  });
});
