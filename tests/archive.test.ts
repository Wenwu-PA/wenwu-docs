import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { readFileSync } from 'node:fs';
import { manifestSchema } from '../scripts/manifest-schema.mjs';
import { classifyTopic, classifyWorkPath, githubPathUrl, normalizePath, normalizeTopic, stableId } from '../scripts/manifest-utils.mjs';
import { renderDiaryTemplate } from '../src/utils/diaryTemplate';
import type { ArchiveNode } from '../src/types';

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
});

describe('diary template', () => {
  it('substitutes all supported values from a real node', () => {
    const node = {
      id: 'p_test', path: 'homework-2026/base alg/14-09-2026/HW', name: 'main.py', type: 'file', ext: '.py', language: 'Python', size: 15,
      lines: 1, lastCommit: { date: '2026-09-14', hash: null, message: null }, firstCommit: { date: null, hash: null, message: null }, githubUrl: 'https://example.com/a',
      rawUrl: null, editUrl: 'https://example.com/a', githubDevUrl: 'https://example.com/a', topic: 'algorithms', tags: [], title: 'Поиск', status: null,
      contentFile: null, parentId: null, statement: null, method: null, date: '14-09-2026', workType: 'HW',
    } satisfies ArchiveNode;
    expect(renderDiaryTemplate('{{title}} | {{topic}} | {{type}} | {{date}} | {{path}}', node, 'Алгоритмы'))
      .toBe('Поиск | Алгоритмы | Домашняя работа | 14-09-2026 | homework-2026/base alg/14-09-2026/HW');
  });
});
