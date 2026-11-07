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

  it('previews notebooks over 5 MiB without truncating markdown or code', () => {
    const markdown = `# Полный текст\n${'текст '.repeat(15_000)}`;
    const code = `print('${'x'.repeat(80_000)}')`;
    const converted = convertNotebook(JSON.stringify({ nbformat: 4, cells: [
      { cell_type: 'markdown', source: markdown },
      { cell_type: 'code', source: code, outputs: [
        { output_type: 'display_data', data: { 'image/png': 'A'.repeat(6 * 1024 * 1024), 'text/plain': 'image' } },
        { output_type: 'stream', text: 'я'.repeat(40_000) },
        { output_type: 'display_data', data: { 'text/html': '<p>'.repeat(30_000) } },
        { output_type: 'error', traceback: ['Error'.repeat(20_000)] },
        { output_type: 'stream', text: 'small output' },
      ] },
    ] }));
    expect(converted.cells[0].source).toBe(markdown);
    expect(converted.cells[1].source).toBe(code);
    expect(converted.cells[1].outputs.map((output) => output.type)).toEqual(['hidden', 'hidden', 'hidden', 'hidden', 'stream']);
    expect(JSON.stringify(converted).length).toBeLessThan(1024 * 1024);
  });

  it('bounds the total output size across cells, even for many small outputs', () => {
    const converted = convertNotebook(JSON.stringify({ nbformat: 4, cells: Array.from({ length: 40 }, (_, index) => ({
      cell_type: 'code', source: `print(${index})`, outputs: [{ output_type: 'stream', text: 'x'.repeat(40_000) }],
    })) }));
    expect(converted.cellCount).toBe(40);
    expect(converted.cells.at(-1).source).toBe('print(39)');
    expect(converted.cells.at(-1).outputs).toEqual([{ type: 'hidden' }]);
    expect(converted.cells.flatMap((cell) => cell.outputs).filter((output) => output.type === 'stream').length).toBeLessThan(27);
  });
});
