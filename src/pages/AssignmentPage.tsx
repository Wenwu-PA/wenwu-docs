import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ArchiveManifest, ArchiveNode } from '../types';
import DiaryDialog from '../components/DiaryDialog';
import { highlightCode } from '../utils/highlightCode';
import PdfPreview from './PdfPreview';
import { recordVisit } from '../utils/visitHistory';

const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });
markdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  const token = tokens[index];
  const href = String(token.attrGet('href') ?? '');
  if (/^https?:\/\//i.test(href)) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
  }
  return renderer.renderToken(tokens, index, options);
};
const codeLanguages: Record<string, string> = {
  '.c': 'c', '.h': 'cpp', '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.cs': 'csharp',
  '.py': 'python', '.js': 'javascript', '.jsx': 'jsx', '.ts': 'typescript', '.tsx': 'tsx', '.html': 'html',
  '.css': 'css', '.scss': 'scss', '.sql': 'sql', '.json': 'json', '.xml': 'xml', '.yml': 'yaml', '.yaml': 'yaml',
  '.java': 'java', '.rs': 'rust', '.php': 'php', '.sh': 'bash', '.md': 'markdown', '.markdown': 'markdown',
};
const sortableDate = (value: string | null) => {
  if (!value) return '';
  const [day, month, year] = value.split(/[.-]/);
  return year ? `${year.padStart(4, '0')}${month.padStart(2, '0')}${day.padStart(2, '0')}` : `${month.padStart(2, '0')}${day.padStart(2, '0')}`;
};

function previewUrl(node: ArchiveNode) {
  return node.contentFile ? `${import.meta.env.BASE_URL}${node.contentFile.replace(/^\//, '')}` : null;
}

export default function AssignmentPage({ manifest }: { manifest: ArchiveManifest }) {
  const { nodeId = '' } = useParams();
  const navigate = useNavigate();
  const node = useMemo(() => manifest.nodes.find((item) => item.id === nodeId), [manifest.nodes, nodeId]);
  const children = useMemo(() => manifest.nodes.filter((item) => item.parentId === nodeId).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, 'ru') : a.type === 'dir' ? -1 : 1), [manifest.nodes, nodeId]);
  const parent = node?.parentId ? manifest.nodes.find((item) => item.id === node.parentId) : undefined;
  const siblings = useMemo(() => node?.type === 'dir' && node.workType ? manifest.nodes.filter((item) => item.type === 'dir' && item.parentId === node.parentId && item.workType === node.workType).sort((a, b) => sortableDate(a.date).localeCompare(sortableDate(b.date))) : [], [manifest.nodes, node]);
  const siblingIndex = siblings.findIndex((item) => item.id === nodeId);
  const previous = siblingIndex > 0 ? siblings[siblingIndex - 1] : undefined;
  const next = siblingIndex >= 0 ? siblings[siblingIndex + 1] : undefined;
  const [preview, setPreview] = useState({ nodeId: '', source: '', error: false });
  const source = preview.nodeId === nodeId ? preview.source : '';
  const error = preview.nodeId === nodeId && preview.error;
  const [highlight, setHighlight] = useState({ nodeId: '', source: '', html: '' });
  const highlighted = highlight.nodeId === nodeId && highlight.source === source ? highlight.html : '';
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('wenwu-status-v1') ?? '{}') as Record<string, string>; }
    catch { return {}; }
  });
  const submitted = localStatuses[nodeId] === 'submitted';

  useEffect(() => {
    if (!node || node.id !== nodeId) return;
    recordVisit(node, manifest.nodes);
  }, [manifest.nodes, node, nodeId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return;
      if ((event.altKey && event.key === 'ArrowLeft') || (event.key === 'Backspace' && !event.altKey && !event.ctrlKey && !event.metaKey)) {
        event.preventDefault();
        if (parent) navigate(`/file/${parent.id}`, { state: { restore: true } });
      } else if (['j', 'ArrowRight'].includes(event.key) && next) navigate(`/file/${next.id}`);
      else if (['k', 'ArrowLeft'].includes(event.key) && previous) navigate(`/file/${previous.id}`);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate, next, parent, previous]);

  useEffect(() => {
    if (!node || node.type !== 'file' || (!node.previewHtml && (!node.contentFile || node.ext === '.pdf'))) return;
    let active = true;
    const url = node.previewHtml ? `${import.meta.env.BASE_URL}${node.previewHtml.replace(/^\//, '')}` : previewUrl(node)!;
    fetch(url).then((response) => { if (!response.ok) throw new Error('File unavailable'); return response.text(); })
      .then((content) => { if (active) setPreview({ nodeId: node.id, source: content, error: false }); })
      .catch(() => { if (active) setPreview({ nodeId: node.id, source: '', error: true }); });
    return () => { active = false; };
  }, [node]);

  useEffect(() => {
    if (!node || node.type !== 'file' || !source || !codeLanguages[node.ext]) return;
    let active = true;
    highlightCode(source, codeLanguages[node.ext])
      .then((html) => {
        if (!active) return;
        let line = 0;
        const numbered = html.replace(/<span class="line">/g, () => `<span class="line" tabindex="0" id="L${++line}">`);
        setHighlight({ nodeId: node.id, source, html: DOMPurify.sanitize(numbered, { USE_PROFILES: { html: true }, ADD_ATTR: ['id', 'class', 'style'] }) });
      })
      .catch(() => { if (active) setHighlight({ nodeId: node.id, source, html: '' }); });
    return () => { active = false; };
  }, [node, source]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    const range = params.get('lines')?.split('-');
    const line = Number(range?.[0] ?? params.get('line'));
    if (line) window.setTimeout(() => {
      const target = document.getElementById(`L${line}`);
      target?.classList.add('is-line-target');
      target?.scrollIntoView({ block: 'center' });
    }, 80);
  }, [highlighted]);

  if (!node) return <main id="main" className="assignment-page"><h1>Материал не найден</h1><Link className="text-link" to="/">Вернуться в архив</Link></main>;

  const title = node.title || node.name;
  const workLabel = node.workType === 'HW' ? 'Домашняя работа' : node.workType === 'CW' ? 'Классная работа' : 'Материал архива';
  const directoryFiles = children.filter((item) => item.type === 'file');
  const solutionFile = directoryFiles.find((item) => item.ext !== '.md' && item.ext !== '.txt') ?? directoryFiles[0];
  const statementNode = node.type === 'file' ? parent : node;
  const statement = statementNode?.statement;
  const contentUrl = node.type === 'file' ? previewUrl(node) : null;
  const isMarkdown = node.ext === '.md' || node.ext === '.markdown';
  const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(node.ext);
  const isPdf = node.ext === '.pdf';
  const isOfficePreview = Boolean(node.previewHtml);
  const isText = Boolean(codeLanguages[node.ext]) || ['.txt', '.csv', '.log', '.xml', '.yml', '.yaml'].includes(node.ext);
  const canEdit = node.type === 'file'
    ? Boolean(node.contentFile && !isImage && !isPdf)
    : Boolean(solutionFile?.contentFile && !['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(solutionFile.ext));
  const statusLabel = submitted ? 'ОТПРАВЛЕНО' : node.status ? node.status.toLocaleUpperCase('ru') : '';
  const pathSegments = node.path.split('/').filter(Boolean);
  const breadcrumbItems = pathSegments.map((segment, index) => {
    const path = pathSegments.slice(0, index + 1).join('/');
    const partNode = manifest.nodes.find((item) => item.path === path);
    const year = pathSegments[0]?.match(/^(?:classwork|homework)-(\d{4})$/)?.[1];
    const to = index === 0 && year ? `/y/${year}` : index === 1 && year && node.topic ? `/y/${year}/${encodeURIComponent(node.topic)}` : partNode?.type === 'dir' ? `/file/${partNode.id}` : null;
    return <span key={`${path}-${index}`}> / {to && path !== node.path ? <Link to={to}>{segment}</Link> : segment}</span>;
  });

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const setLineLink = (event: { target: EventTarget | null; shiftKey: boolean }) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.line[id]') : null;
    if (!target || !node || node.type !== 'file') return;
    const line = Number(target.id.slice(1));
    const route = window.location.hash.split('?')[0];
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    if (event.shiftKey && params.has('line')) {
      const start = Number(params.get('line'));
      params.delete('line');
      params.set('lines', `${Math.min(start, line)}-${Math.max(start, line)}`);
    } else {
      params.delete('lines');
      params.set('line', String(line));
    }
    document.querySelector('.is-line-target')?.classList.remove('is-line-target');
    target.classList.add('is-line-target');
    window.location.hash = `${route}?${params.toString()}`;
  };

  return <main id="main" className="assignment-page">
    <p className="breadcrumbs"><Link to="/">АРХИВ</Link>{breadcrumbItems}{node.workType ? ` / ${node.workType}` : ''}</p>
    <Link className="back-link" to={parent ? `/file/${parent.id}` : '/'} state={{ restore: true }}>← {parent?.title ?? 'Архив'}</Link>
    <h1 className="assignment-heading">{title}</h1>
    <div className="assignment-meta">
      <span className="assignment-language">{node.language || node.workType || (node.type === 'dir' ? 'ПАПКА' : node.ext.slice(1).toUpperCase())}</span>
      {statusLabel && <span className="status-label">{statusLabel}</span>}
      <span>{workLabel}</span>
      <span className="assignment-path">{node.path || 'IT-TOP_academy'}</span>
      <button className="text-link plain-button" onClick={copyLink}>{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</button>
      <a className="text-link" href={node.githubUrl} target="_blank" rel="noopener noreferrer">Открыть в GitHub ↗</a>
      {node.rawUrl && <a className="text-link" href={node.rawUrl} target="_blank" rel="noopener noreferrer">Скачать оригинал ↗</a>}
    </div>
    <hr className="assignment-rule" />
    {node.type === 'dir' ? <>
      <div className="assignment-columns">
        <section className="statement-panel"><span className="section-label">01 / {statement ? 'УСЛОВИЕ' : 'ПАПКА'}</span><h2>{statement ? title : 'Материалы раздела'}</h2>{statement && <div className="markdown-view" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(markdown.render(statement)) }} />}{node.method && <><span className="eyebrow">МЕТОД</span><p>{node.method}</p></>}</section>
        <section className="solution-panel"><div className="solution-header"><span className="section-label">02 / ФАЙЛЫ</span><div className="solution-toolbar">{canEdit && <Link to={`/edit/${solutionFile?.id ?? node.id}`}>Редактировать</Link>}<button onClick={() => setDiaryOpen(true)}>В дневник</button></div></div><DirectoryListing items={children} /></section>
      </div>
    </> : <>
      <div className="assignment-columns">
        <section className="statement-panel"><span className="section-label">01 / {statement ? 'УСЛОВИЕ' : 'АРХИВ'}</span>{statement && <><h2>{statementNode?.title ?? title}</h2><div className="markdown-view" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(markdown.render(statement)) }} /></>}{node.method && <><span className="eyebrow">МЕТОД</span><p>{node.method}</p></>}<span className="eyebrow">ФАЙЛ / {node.size.toLocaleString('ru-RU')} Б · {node.lines ?? '—'} СТРОК</span></section>
        <section className="solution-panel" aria-label="Содержимое файла">
          <div className="solution-header"><span className="section-label">02 / РЕШЕНИЕ</span><span className="solution-name">{node.name}</span><div className="solution-toolbar"><button onClick={copyLink}>Ссылка</button><Link to={`/edit/${node.id}`}>Редактировать</Link><button onClick={() => setDiaryOpen(true)}>В дневник</button></div></div>
          {node.conversionError ? <p className="message-error">Не удалось преобразовать файл для просмотра. <a href={node.rawUrl ?? node.githubUrl}>Скачать оригинал ↗</a></p> : isPdf ? <PdfPreview url={contentUrl ?? node.rawUrl ?? node.githubUrl} /> : !node.contentFile && !node.previewHtml ? <p>Просмотр недоступен для этого формата или размера файла. <a href={node.rawUrl ?? node.githubUrl}>Скачать оригинал ↗</a></p> : error ? <p role="alert">Не удалось загрузить файл. <a href={node.githubUrl}>Открыть на GitHub ↗</a></p> : !source ? <p>Загружаю файл…</p> : isOfficePreview ? <div className="markdown-view office-preview" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(source, { USE_PROFILES: { html: true } }) }} /> : isMarkdown ? <div className="markdown-view" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(markdown.render(source)) }} /> : isImage ? <img className="solution-image" src={contentUrl ?? ''} alt={node.name} /> : isText ? <pre className="solution-code" tabIndex={0} aria-label={`Код файла ${node.name}`} onClick={setLineLink} onKeyDown={(event) => { if (event.key === 'Enter') setLineLink(event); }} title="Нажмите на строку, Shift + нажатие задаёт диапазон ссылки">{highlighted ? <code dangerouslySetInnerHTML={{ __html: highlighted }} /> : <code>{source}</code>}</pre> : <p>Просмотр недоступен для этого формата. Скачайте файл или откройте его на GitHub.</p>}
        </section>
      </div>
      {solutionFile && <Link className="next-assignment" to={`/file/${solutionFile.id}`}>Открыть файл решения → {solutionFile.name}</Link>}
    </>}
    <div className="assignment-actions"><button className="button" onClick={() => setDiaryOpen(true)}>В дневник</button>{canEdit && <Link className="button" to={`/edit/${solutionFile?.id ?? node.id}`}>Открыть редактор</Link>}{node.githubDevUrl && <a className="button" href={node.githubDevUrl} target="_blank" rel="noopener noreferrer">github.dev ↗</a>}</div>
    {diaryOpen && <DiaryDialog node={node} source={source} files={node.type === 'dir' ? manifest.nodes.filter((item) => item.type === 'file' && item.path.startsWith(`${node.path}/`)) : [node]} onClose={() => { setDiaryOpen(false); try { setLocalStatuses(JSON.parse(localStorage.getItem('wenwu-status-v1') ?? '{}') as Record<string, string>); } catch { setLocalStatuses({}); } }} />}
    {parent && <Link className="next-assignment" to={`/file/${parent.id}`} state={{ restore: true }}>← К списку заданий: {parent.title}</Link>}
    {(previous || next) && <nav className="assignment-pager" aria-label="Предыдущее и следующее задание">{previous ? <Link to={`/file/${previous.id}`}>← Предыдущее · {previous.title}</Link> : <span />} {next ? <Link to={`/file/${next.id}`}>Следующее · {next.title} →</Link> : <span />}</nav>}
  </main>;
}

function DirectoryListing({ items }: { items: ArchiveNode[] }) {
  return <div className="directory-view">{items.map((item) => <Link className="result-row" key={item.id} to={`/file/${item.id}`}><span className="result-kind">{item.type === 'dir' ? 'DIR' : item.language || item.ext.slice(1).toUpperCase()}</span><strong>{item.title || item.name}</strong><span className="path-label">{item.name}</span></Link>)}</div>;
}
