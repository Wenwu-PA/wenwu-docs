import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import MarkdownIt from 'markdown-it';

const imports = {
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  python: () => import('@shikijs/langs/python'),
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  scss: () => import('@shikijs/langs/scss'),
  sql: () => import('@shikijs/langs/sql'),
  json: () => import('@shikijs/langs/json'),
  xml: () => import('@shikijs/langs/xml'),
  yaml: () => import('@shikijs/langs/yaml'),
  java: () => import('@shikijs/langs/java'),
  rust: () => import('@shikijs/langs/rust'),
  php: () => import('@shikijs/langs/php'),
  bash: () => import('@shikijs/langs/bash'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  lua: () => import('@shikijs/langs/lua'),
  powershell: () => import('@shikijs/langs/powershell'),
  batch: () => import('@shikijs/langs/batch'),
  markdown: () => import('@shikijs/langs/markdown'),
};

const redIndexLight = {
  name: 'red-index-light', type: 'light' as const,
  colors: { 'editor.background': '#FFFFFF', 'editor.foreground': '#15232C', 'editorLineNumber.foreground': '#526775' },
  tokenColors: [
    { scope: ['keyword', 'storage', 'storage.type'], settings: { foreground: '#8F2725', fontStyle: 'bold' } },
    { scope: ['string', 'string.quoted'], settings: { foreground: '#375E4A' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#4A5680' } },
    { scope: ['comment'], settings: { foreground: '#526775', fontStyle: 'italic' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#15232C' } },
  ],
};
const redIndexDark = {
  name: 'red-index-dark', type: 'dark' as const,
  colors: { 'editor.background': '#11171D', 'editor.foreground': '#EDF2F5', 'editorLineNumber.foreground': '#A0AFBA' },
  tokenColors: [
    { scope: ['keyword', 'storage', 'storage.type'], settings: { foreground: '#E99591', fontStyle: 'bold' } },
    { scope: ['string', 'string.quoted'], settings: { foreground: '#E8E8DE' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#E8E8DE' } },
    { scope: ['comment'], settings: { foreground: '#C1C1B8', fontStyle: 'italic' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#FAFAF6' } },
  ],
};

const highlighter = createHighlighterCore({
  themes: [redIndexLight, redIndexDark],
  langs: [],
  engine: createJavaScriptRegexEngine(),
});

const loadedLanguages = new Set<string>();

export async function highlightCode(source: string, language: string, theme = 'red-index-light') {
  const load = imports[language as keyof typeof imports];
  if (!load) return `<pre class="shiki"><code>${escapeHtml(source)}</code></pre>`;
  const instance = await highlighter;
  if (!loadedLanguages.has(language)) {
    const grammar = await load() as Parameters<typeof instance.loadLanguage>[0];
    await instance.loadLanguage(grammar);
    loadedLanguages.add(language);
  }
  return instance.codeToHtml(source, { lang: language, theme });
}

export async function highlightMarkdown(source: string, theme = 'red-index-light') {
  const parser = new MarkdownIt({ html: false, linkify: true, typographer: true });
  parser.renderer.rules.link_open = (items, index, options, _env, renderer) => {
    const token = items[index];
    if (/^https?:\/\//i.test(String(token.attrGet('href') ?? ''))) { token.attrSet('target', '_blank'); token.attrSet('rel', 'noopener noreferrer'); }
    return renderer.renderToken(items, index, options);
  };
  const tokens = parser.parse(source, {});
  const rendered = await Promise.all(tokens.map(async (token) => token.type === 'fence'
    ? highlightCode(token.content, token.info.trim().split(/\s+/)[0] || 'text', theme).catch(() => `<pre class="shiki"><code>${escapeHtml(token.content)}</code></pre>`)
    : Promise.resolve('')));
  const oldFence = parser.renderer.rules.fence;
  parser.renderer.rules.fence = (items, index, options, env, renderer) => rendered[index] || oldFence?.(items, index, options, env, renderer) || '';
  return parser.renderer.render(tokens, parser.options, {});
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function languageForExtension(extension: string): string | undefined {
  const map: Record<string, string> = {
    '.c': 'c', '.h': 'cpp', '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.cs': 'csharp',
    '.py': 'python', '.js': 'javascript', '.jsx': 'jsx', '.ts': 'typescript', '.tsx': 'tsx', '.html': 'html',
    '.css': 'css', '.sql': 'sql', '.kt': 'kotlin', '.java': 'java', '.lua': 'lua', '.json': 'json',
    '.yaml': 'yaml', '.yml': 'yaml', '.md': 'markdown', '.markdown': 'markdown', '.sh': 'bash', '.bat': 'batch', '.ps1': 'powershell', '.xml': 'xml',
  };
  return map[extension.toLowerCase()];
}
