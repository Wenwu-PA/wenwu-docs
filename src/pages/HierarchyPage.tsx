import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ArchiveManifest, ArchiveNode } from '../types';

const yearFrom = (node: ArchiveNode) => node.path.match(/^(?:classwork|homework)-(\d{4})\//)?.[1] ?? null;
const kindFrom = (node: ArchiveNode) => node.path.startsWith('classwork-') ? 'CW' : node.path.startsWith('homework-') ? 'HW' : null;
const isTask = (node: ArchiveNode) => node.type === 'dir' && node.date && node.workType;
const titleFor = (manifest: ArchiveManifest, id: string) => manifest.topics.find((topic) => topic.id === id)?.title ?? id;
const pluralTasks = (count: number) => `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'задание' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'задания' : 'заданий'}`;
const taskCountLabel = (cwCount: number, hwCount: number, total: number) => [cwCount ? `CW ${cwCount}` : '', hwCount ? `HW ${hwCount}` : '', `всего ${pluralTasks(total)}`].filter(Boolean).join(' · ');

export default function HierarchyPage({ manifest }: { manifest: ArchiveManifest }) {
  const { year, topicId } = useParams();
  const nodes = useMemo(() => manifest.nodes.filter((node) => yearFrom(node) === year), [manifest.nodes, year]);
  const topicIds = [...new Set(nodes.map((node) => node.topic).filter((id): id is string => Boolean(id)))];
  const allSubjectNodes = manifest.nodes.filter((node) => node.topic === topicId && (!year || yearFrom(node) === year));
  const sources = allSubjectNodes.filter((node) => node.type === 'dir' && node.path.match(/^(?:classwork|homework)-\d{4}\/[^/]+$/));
  const children = useMemo(() => {
    const map = new Map<string | null, ArchiveNode[]>();
    for (const node of manifest.nodes) { const list = map.get(node.parentId) ?? []; list.push(node); map.set(node.parentId, list); }
    return map;
  }, [manifest.nodes]);

  if (topicId) return <main id="main" className="hierarchy-page">
    <p className="breadcrumbs"><Link to="/">АРХИВ</Link> / {year ? <Link to={`/y/${year}`}>{year}</Link> : <Link to="/">Все годы</Link>} / {titleFor(manifest, topicId).toLocaleUpperCase('ru')}</p>
    <Link className="back-link" to={year ? `/y/${year}` : '/'}>← {year ?? 'Архив'}</Link>
    <h1>{titleFor(manifest, topicId)}</h1>
    <p className="assignment-path">{sources.map((node) => node.path).join(' · ') || 'Папки источников пока не найдены'}</p>
    {(['CW', 'HW'] as const).flatMap((kind) => {
      const roots = sources.filter((node) => kindFrom(node) === kind);
      const years = [...new Set(roots.map(yearFrom).filter((value): value is string => Boolean(value)))].sort((a, b) => b.localeCompare(a));
      if (!years.length) return [<section className="hierarchy-section" key={`${kind}-empty`}>
        <h2>{kind === 'CW' ? 'Классная работа' : 'Домашняя работа'} <span className="path-label">без указанного года</span></h2>
        <p>Материалов пока нет.</p>
      </section>];
      return years.map((sourceYear) => {
        const yearRoots = roots.filter((node) => yearFrom(node) === sourceYear);
        return <section className="hierarchy-section" key={`${kind}-${sourceYear}`}>
          <h2>{kind === 'CW' ? 'Классная работа' : 'Домашняя работа'} <span className="hierarchy-year">{sourceYear} год</span><span className="path-label">{yearRoots.length} источников</span></h2>
          <div className="hierarchy-tree">{yearRoots.map((root) => <TreeFolder key={root.id} node={root} children={children} depth={0} />)}</div>
        </section>;
      });
    })}
  </main>;

  return <main id="main" className="hierarchy-page">
    <p className="breadcrumbs"><Link to="/">АРХИВ</Link> / {year}</p>
    <Link className="back-link" to="/">← Архив</Link>
    <h1>Период {year}</h1>
    <p className="assignment-path">{nodes.filter(isTask).length} заданий · {nodes.filter((node) => node.type === 'file').length} файлов</p>
    <div className="hierarchy-list">{topicIds.map((id, index) => {
      const subject = nodes.filter((node) => node.topic === id);
      const roots = subject.filter((node) => node.type === 'dir' && node.path.match(/^(?:classwork|homework)-\d{4}\/[^/]+$/));
      const counts = manifest.topics.find((topic) => topic.id === id)?.periodCounts?.find((item) => item.year === year) ?? { cwCount: 0, hwCount: 0, total: 0 };
      const langs = new Map<string, number>();
      subject.filter((node) => node.type === 'file' && node.language && !['HTML', 'Markdown', 'PDF', 'Image'].includes(node.language)).forEach((node) => langs.set(node.language, (langs.get(node.language) ?? 0) + 1));
      const lang = [...langs].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Документы';
      return <div key={id} className="hierarchy-row">
        <span className="subject-number">{String(index + 1).padStart(2, '0')}</span><Link to={`/y/${year}/${encodeURIComponent(id)}`}><strong>{titleFor(manifest, id)}</strong></Link>
        <span className="path-label" title={roots.map((node) => node.path).join(' · ')}>{roots.map((node) => node.path).join(' · ')}</span>
        <span>{taskCountLabel(counts.cwCount, counts.hwCount, counts.total)}</span>
        {roots[0] ? <a className="language-link" href={roots[0].githubUrl} title="Открыть на GitHub" target="_blank" rel="noreferrer">{lang} ↗</a> : <span>{lang}</span>}
      </div>;
    })}</div>
  </main>;
}

function TreeFolder({ node, children, depth }: { node: ArchiveNode; children: Map<string | null, ArchiveNode[]>; depth: number }) {
  const items = children.get(node.id) ?? [];
  const [open, setOpen] = useState(() => {
    try { const stored = JSON.parse(sessionStorage.getItem('wenwu-open-folders') ?? '[]') as string[]; return stored.includes(node.id) || depth === 0; }
    catch { return depth === 0; }
  });
  return <details className="hierarchy-folder" open={open} onToggle={(event) => {
    const isOpen = event.currentTarget.open;
    setOpen(isOpen);
    try { const stored = new Set(JSON.parse(sessionStorage.getItem('wenwu-open-folders') ?? '[]') as string[]); if (isOpen) stored.add(node.id); else stored.delete(node.id); sessionStorage.setItem('wenwu-open-folders', JSON.stringify([...stored])); } catch { /* Storage may be unavailable. */ }
  }}>
    <summary><span className="date-label">{node.date ?? yearFrom(node)}</span><Link to={`/file/${node.id}`} onClick={(event) => event.stopPropagation()}>{node.title || node.name}</Link><span className="path-label">{node.workType}</span><a href={node.githubUrl} title="Открыть на GitHub" aria-label={`Открыть ${node.name} на GitHub`} target="_blank" rel="noreferrer">↗</a></summary>
    {items.map((item) => item.type === 'dir' ? <TreeFolder key={item.id} node={item} children={children} depth={depth + 1} /> : <div className="hierarchy-file" key={item.id}><span className="tree-type">{item.language || item.ext.slice(1).toUpperCase()}</span><Link to={`/file/${item.id}`}>{item.name}</Link><a href={item.githubUrl} title="Открыть на GitHub" target="_blank" rel="noreferrer">↗</a></div>)}
  </details>;
}
