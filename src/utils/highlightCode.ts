import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

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
};

const highlighter = createHighlighterCore({
  themes: [import('@shikijs/themes/github-light')],
  langs: [],
  engine: createJavaScriptRegexEngine(),
});

const loadedLanguages = new Set<string>();

export async function highlightCode(source: string, language: string) {
  const load = imports[language as keyof typeof imports];
  if (!load) throw new Error(`Unsupported language: ${language}`);
  const instance = await highlighter;
  if (!loadedLanguages.has(language)) {
    const grammar = await load() as Parameters<typeof instance.loadLanguage>[0];
    await instance.loadLanguage(grammar);
    loadedLanguages.add(language);
  }
  return instance.codeToHtml(source, { lang: language, theme: 'github-light' });
}
