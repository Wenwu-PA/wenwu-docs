import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true });
const maxEmbeddedImageBase64 = 400_000;
// eslint-disable-next-line no-control-regex
const stripAnsi = (value) => value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
const asText = (value) => Array.isArray(value) ? value.join('') : String(value ?? '');
const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function ansiHtml(value) {
  const palette = new Set([30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97]);
  let current = null;
  let html = '';
  let cursor = 0;
  // eslint-disable-next-line no-control-regex
  for (const match of value.matchAll(/\x1B\[([0-9;]*)m/g)) {
    html += `${current ? '</span>' : ''}${escapeHtml(value.slice(cursor, match.index))}`;
    const code = Number(match[1].split(';').at(-1) ?? 0);
    current = code === 0 || !palette.has(code) ? null : code;
    if (current) html += `<span class="ansi-color ansi-color-${current}">`;
    cursor = match.index + match[0].length;
  }
  return `${html}${current ? '</span>' : ''}${escapeHtml(value.slice(cursor))}`;
}

function attachmentData(cell) {
  const result = new Map();
  for (const [name, representations] of Object.entries(cell.attachments ?? {})) {
    for (const [mime, raw] of Object.entries(representations ?? {})) {
      if (!mime.startsWith('image/')) continue;
      const encoded = asText(raw).replace(/\s+/g, '');
      if (encoded.length <= maxEmbeddedImageBase64) result.set(name, `data:${mime};base64,${encoded}`);
    }
  }
  return result;
}

function outputsFor(cell) {
  return (cell.outputs ?? []).map((output) => {
    if (output.output_type === 'stream') {
      const text = asText(output.text);
      return { type: 'stream', name: output.name ?? 'stdout', text: stripAnsi(text), html: ansiHtml(text) };
    }
    if (output.output_type === 'error') return { type: 'error', name: output.ename ?? 'Error', text: stripAnsi([...(output.traceback ?? [])].join('\n') || `${output.ename ?? 'Error'}: ${output.evalue ?? ''}`) };
    const data = output.data ?? {};
    const image = ['image/png', 'image/jpeg', 'image/svg+xml'].find((mime) => data[mime] && asText(data[mime]).length <= maxEmbeddedImageBase64);
    if (image) {
      const value = asText(data[image]);
      return { type: 'image', mime: image, source: image === 'image/svg+xml' ? `data:${image},${encodeURIComponent(value)}` : `data:${image};base64,${value.replace(/\s+/g, '')}` };
    }
    return data['text/html'] ? { type: 'html', html: asText(data['text/html']) } : { type: 'text', text: asText(data['text/plain'] ?? output.text ?? '') };
  });
}

function normalizeCells(notebook) {
  if (Array.isArray(notebook.cells)) return notebook.cells;
  if (Array.isArray(notebook.worksheets)) return notebook.worksheets.flatMap((sheet) => sheet.cells ?? []).map((cell) => ({
    ...cell,
    cell_type: cell.cell_type === 'code' || cell.cell_type === 'codecell' ? 'code' : cell.cell_type === 'raw' ? 'raw' : 'markdown',
    source: cell.source ?? cell.input ?? cell.text ?? '',
    execution_count: cell.execution_count ?? cell.prompt_number ?? null,
  }));
  return [];
}

function getLanguage(notebook) {
  return String(notebook.metadata?.language_info?.name ?? notebook.metadata?.kernelspec?.language ?? 'python').toLowerCase();
}

export function convertNotebook(source) {
  const notebook = JSON.parse(source);
  const formatVersion = Number(notebook.nbformat ?? 3);
  const language = getLanguage(notebook);
  const cells = normalizeCells(notebook).map((cell, index) => {
    const text = asText(cell.source);
    if (cell.cell_type === 'markdown' || cell.cell_type === 'heading') {
      let markdownSource = text;
      for (const [name, data] of attachmentData(cell)) markdownSource = markdownSource.replaceAll(`attachment:${name}`, data);
      return { index: index + 1, type: 'markdown', source: markdownSource, html: markdown.render(markdownSource), outputs: [] };
    }
    if (cell.cell_type === 'raw') return { index: index + 1, type: 'raw', source: text, outputs: [] };
    return { index: index + 1, type: 'code', source: text, executionCount: cell.execution_count ?? null, outputs: outputsFor(cell) };
  });
  const searchText = cells.map((cell) => cell.source).join('\n').slice(0, 32 * 1024);
  return { format: 'wenwu-notebook', nbformat: formatVersion, language, cells, cellCount: cells.length, searchText };
}
