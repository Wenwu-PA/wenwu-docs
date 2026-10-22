import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { highlightCode } from '../utils/highlightCode';
import { escapeHtml } from '../utils/highlightCode';

export interface NotebookOutput {
  type: 'stream' | 'error' | 'text' | 'html' | 'image';
  name?: string;
  mime?: string;
  text?: string;
  html?: string;
  source?: string;
}
export interface NotebookCell {
  index: number;
  type: 'markdown' | 'code' | 'raw';
  source: string;
  html?: string;
  executionCount?: number | null;
  outputs: NotebookOutput[];
}
export interface NotebookDocument {
  format: 'wenwu-notebook';
  nbformat: number;
  language: string;
  cellCount: number;
  cells: NotebookCell[];
}

const sanitize = (markup: string) => DOMPurify.sanitize(markup, { USE_PROFILES: { html: true }, ADD_ATTR: ['class', 'style', 'href', 'src', 'target', 'rel', 'id'] });

async function highlightMarkup(markup: string, theme: string) {
  const doc = new DOMParser().parseFromString(sanitize(markup), 'text/html');
  await Promise.all([...doc.querySelectorAll('pre code')].map(async (code) => {
    const language = [...code.classList].find((item) => item.startsWith('language-'))?.slice(9) ?? 'text';
    const plain = code.textContent ?? '';
    const highlighted = await highlightCode(plain, language, theme).catch(() => `<pre><code>${escapeHtml(plain)}</code></pre>`);
    const replacement = new DOMParser().parseFromString(highlighted, 'text/html').body.firstElementChild;
    if (replacement) code.parentElement?.replaceWith(replacement);
  }));
  return sanitize(doc.body.innerHTML);
}

function replaceMath(markup: string, katex: typeof import('katex') | null) {
  if (!katex) return markup;
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const textNode of textNodes) {
    if (!textNode.parentElement || textNode.parentElement.closest('pre,code,script,style')) continue;
    const value = textNode.nodeValue ?? '';
    const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    if (!pattern.test(value)) continue;
    pattern.lastIndex = 0;
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const match of value.matchAll(pattern)) {
      fragment.append(doc.createTextNode(value.slice(cursor, match.index)));
      const display = Boolean(match[1]);
      const formula = match[1] ?? match[2] ?? '';
      const span = doc.createElement(display ? 'div' : 'span');
      span.className = display ? 'notebook-math notebook-math--display' : 'notebook-math';
      try { span.innerHTML = katex.renderToString(formula, { displayMode: display, throwOnError: false, strict: 'ignore' }); }
      catch { span.textContent = match[0]; }
      fragment.append(span);
      cursor = match.index + match[0].length;
    }
    fragment.append(doc.createTextNode(value.slice(cursor)));
    textNode.replaceWith(fragment);
  }
  return sanitize(doc.body.innerHTML);
}

export default function NotebookView({ notebook, theme, nodeId, contentUrl, githubUrl, rawUrl }: {
  notebook: NotebookDocument;
  theme: string;
  nodeId: string;
  contentUrl: string;
  githubUrl: string;
  rawUrl: string | null;
}) {
  const location = useLocation();
  const [rendered, setRendered] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<number | 'all' | null>(null);
  const allCode = useMemo(() => notebook.cells.filter((cell) => cell.type === 'code').map((cell) => cell.source).join('\n\n'), [notebook.cells]);

  useEffect(() => {
    let active = true;
    const render = async () => {
      const next: Record<string, string> = {};
      let katex: typeof import('katex') | null = null;
      if (notebook.cells.some((cell) => cell.type === 'markdown' && /\$\$?[\s\S]+?\$\$?/.test(cell.source))) {
        try {
          const [module] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
          katex = module;
        } catch { /* Formula source remains readable if the optional renderer fails. */ }
      }
      for (const cell of notebook.cells) {
        if (cell.type === 'markdown') {
          next[cell.index] = await highlightMarkup(replaceMath(cell.html ?? '', katex), theme);
        } else if (cell.type === 'code') {
          next[cell.index] = await highlightCode(cell.source, notebook.language, theme).catch(() => `<pre><code>${escapeHtml(cell.source)}</code></pre>`);
        }
        for (const [outputIndex, output] of cell.outputs.entries()) {
          if (output.type === 'html' && output.html) next[`${cell.index}-output-${outputIndex}`] = await highlightMarkup(output.html, theme);
        }
      }
      if (active) setRendered(next);
    };
    void render();
    return () => { active = false; };
  }, [notebook, theme]);

  useEffect(() => {
    const cell = new URLSearchParams(location.search).get('cell');
    if (!cell) return;
    window.requestAnimationFrame(() => document.getElementById(`notebook-cell-${cell}`)?.scrollIntoView({ block: 'start' }));
  }, [location.search, rendered]);

  const copy = async (value: string, marker: number | 'all') => {
    try { await navigator.clipboard.writeText(value); setCopied(marker); window.setTimeout(() => setCopied(null), 1300); }
    catch { setCopied(null); }
  };
  return <section className="notebook-view" aria-label="Ячейки Jupyter-ноутбука">
    <header className="notebook-toolbar"><span>{notebook.language.toUpperCase()} · {notebook.cellCount} ячеек · nbformat {notebook.nbformat}</span><button type="button" onClick={() => void copy(allCode, 'all')}>{copied === 'all' ? 'Скопировано' : 'Копировать весь код'}</button><a href={contentUrl} download>Скачать .ipynb</a><a href={githubUrl} target="_blank" rel="noopener noreferrer">Открыть в GitHub ↗</a>{rawUrl && <a className="notebook-raw-link" href={rawUrl} target="_blank" rel="noopener noreferrer">Оригинал ↗</a>}</header>
    {notebook.cells.map((cell) => <article className={`notebook-cell notebook-cell--${cell.type}`} id={`notebook-cell-${cell.index}`} key={cell.index}>
      <div className="notebook-cell-heading"><Link to={`/file/${nodeId}?cell=${cell.index}`} aria-label={`Ссылка на ячейку ${cell.index}`}>In [{cell.executionCount ?? ' '} ]</Link><span>{cell.type === 'markdown' ? 'MARKDOWN' : cell.type === 'raw' ? 'RAW' : notebook.language.toUpperCase()}</span>{cell.type === 'code' && <button type="button" onClick={() => void copy(cell.source, cell.index)}>{copied === cell.index ? 'Скопировано' : 'Копировать ячейку'}</button>}</div>
          {cell.type === 'markdown' ? <div className="notebook-markdown markdown-view" dangerouslySetInnerHTML={{ __html: rendered[String(cell.index)] ?? sanitize(cell.html ?? '') }} /> : cell.type === 'raw' ? <pre className="notebook-raw">{cell.source}</pre> : <>
        <div className="notebook-code" dangerouslySetInnerHTML={{ __html: rendered[String(cell.index)] ?? `<pre><code>${escapeHtml(cell.source)}</code></pre>` }} />
        {cell.outputs.map((output, outputIndex) => <NotebookOutputView output={output} key={`${cell.index}-${outputIndex}`} html={rendered[`${cell.index}-output-${outputIndex}`]} />)}
      </>}
    </article>)}
  </section>;
}

function NotebookOutputView({ output, html }: { output: NotebookOutput; html?: string }) {
  const text = output.text ?? '';
  const long = text.length > 5000;
  if (output.type === 'image' && output.source) return <figure className="notebook-output notebook-output--image"><img src={output.source} alt={`Вывод ${output.mime ?? 'image'}`} loading="lazy" /></figure>;
  if (output.type === 'html' && output.html) return <div className="notebook-output notebook-output--html" dangerouslySetInnerHTML={{ __html: html ?? sanitize(output.html) }} />;
  const body = output.html ? <div className="notebook-output-ansi" dangerouslySetInnerHTML={{ __html: sanitize(output.html) }} /> : <pre className={output.type === 'error' ? 'notebook-output-error' : 'notebook-output-text'}>{text}</pre>;
  return <div className={`notebook-output notebook-output--${output.type}`}><span className="notebook-output-label">{output.name ?? (output.type === 'error' ? 'ERROR' : 'OUTPUT')}</span>{long ? <details><summary>Показать полностью ({text.length.toLocaleString('ru-RU')} символов)</summary>{body}</details> : body}</div>;
}
