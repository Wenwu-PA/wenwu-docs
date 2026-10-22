import { describe, expect, it } from 'vitest';
import { convertNotebook } from '../scripts/lib/notebook-convert.mjs';

describe('Jupyter conversion', () => {
  it('converts markdown, Python code, stdout, error, HTML, and image outputs', () => {
    const converted = convertNotebook(JSON.stringify({
      nbformat: 4,
      metadata: { kernelspec: { language: 'python' } },
      cells: [
        { cell_type: 'markdown', source: '# Заголовок\n\n```python\nprint(1)\n```' },
        { cell_type: 'code', execution_count: 3, source: 'print("ok")', outputs: [
          { output_type: 'stream', name: 'stdout', text: '\u001b[31mошибка\u001b[0m' },
          { output_type: 'error', ename: 'ValueError', evalue: 'bad', traceback: ['ValueError: bad'] },
          { output_type: 'execute_result', data: { 'text/html': '<b>Вывод</b>', 'text/plain': 'Вывод' } },
          { output_type: 'display_data', data: { 'image/png': 'aGVsbG8=' } },
        ] },
      ],
    }));
    expect(converted.cells[0].html).toContain('<h1>Заголовок</h1>');
    expect(converted.cells[0].html).toContain('language-python');
    expect(converted.cells[1].outputs.map((output) => output.type)).toEqual(['stream', 'error', 'html', 'image']);
    expect(converted.cells[1].outputs[0].html).toContain('ansi-color-31');
    expect(converted.searchText).toContain('print("ok")');
  });

  it('soft-converts nbformat 3 worksheet cells and escapes hostile HTML', () => {
    const converted = convertNotebook(JSON.stringify({ nbformat: 3, worksheets: [{ cells: [
      { cell_type: 'heading', source: '<script>alert(1)</script>' },
      { cell_type: 'code', input: 'x = 1', prompt_number: 2 },
    ] }] }));
    expect(converted.cells[0].html).not.toContain('<script>');
    expect(converted.cells[0].html).toContain('&lt;script&gt;');
    expect(converted.cells[1]).toMatchObject({ type: 'code', executionCount: 2, source: 'x = 1' });
  });

  it('rejects corrupt JSON for a safe viewer fallback', () => {
    expect(() => convertNotebook('{broken')).toThrow();
  });
});
