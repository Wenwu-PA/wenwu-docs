import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type MiniSearch from 'minisearch';
import type { ArchiveManifest, ArchiveNode } from '../types';

type SearchResult = { id: string; score: number };
let indexPromise: Promise<InstanceType<typeof MiniSearch>> | null = null;
const codeLanguages = new Set(['C', 'C/C++', 'C++', 'C#', 'Python', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'SQL', 'Java', 'Kotlin', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift']);
const sourceLanguages = new Set(['C', 'C/C++', 'C++', 'C#', 'Python', 'JavaScript', 'TypeScript', 'SQL', 'Java', 'Kotlin', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift']);

function nodeLabel(node: ArchiveNode, nodes: ArchiveNode[]) {
  if (!node.date) return node.title;
  const children = nodes.filter((candidate) => candidate.type === 'file' && candidate.path.startsWith(`${node.path}/`));
  const candidate = children.find((item) => !['main', 'index', 'readme'].includes(item.title.toLowerCase())) ?? children[0];
  if (node.title !== node.name) return node.title;
  if (candidate && !['main', 'index', 'readme'].includes(candidate.title.toLowerCase())) return candidate.title;
  const statementTitle = node.statement?.match(/^#\s+(.+)$/m)?.[1];
  return statementTitle || 'Задание';
}

function displayDate(date: string | null) {
  if (!date) return '—';
  const parts = date.split(/[.-]/);
  return parts.length === 3 ? `${parts[0].padStart(2, '0')}.${parts[1].padStart(2, '0')}.${parts[2].slice(-2)}` : date;
}

function sortableDate(date: string | null) {
  if (!date) return '';
  const [day, month, year] = date.split(/[.-]/);
  return year ? `${year.padStart(4, '0')}${month.padStart(2, '0')}${day.padStart(2, '0')}` : date;
}

function semesterFor(date: string | null) {
  if (!date) return null;
  const parts = date.split(/[.-]/);
  const month = Number(parts[1]);
  return month >= 9 || month === 1 ? 'autumn' : month >= 2 && month <= 6 ? 'spring' : null;
}

export default function ArchivePage({ manifest }: { manifest: ArchiveManifest }) {
  const [params, setParams] = useSearchParams();
  const selectedTopic = params.get('topic') ?? '';
  const query = params.get('q') ?? '';
  const type = params.get('type') ?? 'all';
  const period = params.get('period') ?? 'all';
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const data = useMemo(() => new Map(manifest.nodes.map((node) => [node.id, node])), [manifest.nodes]);
  const periods = [...new Set(manifest.nodes.map((node) => node.path.match(/^(?:classwork|homework)-(\d{4})\//)?.[1]).filter((year): year is string => Boolean(year)))].sort();
  const periodParts = period.split('-');
  const activeYear = period === 'all' ? null : periodParts[0];
  const activeSemester = periodParts[1];
  const inPeriod = useCallback((node: ArchiveNode) => (!activeYear || node.path.startsWith(`classwork-${activeYear}/`) || node.path.startsWith(`homework-${activeYear}/`)) && (!activeSemester || semesterFor(node.date) === activeSemester), [activeYear, activeSemester]);
  const availableTopics = manifest.topics.filter((topic) => manifest.nodes.some((node) => node.topic === topic.id && (!activeYear || inPeriod(node))));
  const visibleTopics = selectedTopic ? availableTopics.filter((topic) => topic.id === selectedTopic) : availableTopics;
  const latest = useMemo(() => manifest.nodes
    .filter((node) => node.type === 'dir' && node.date && node.workType)
    .filter(inPeriod)
    .sort((a, b) => sortableDate(b.date).localeCompare(sortableDate(a.date)))
    .slice(0, 3), [manifest.nodes, inPeriod]);

  const search = useCallback(async (term: string) => {
    if (!term.trim()) { setSearchResults(null); return; }
    try {
      indexPromise ??= (async () => {
        const response = await fetch(`${import.meta.env.BASE_URL}data/search-index.json`);
        if (!response.ok) throw new Error('Search index unavailable');
        const index = await response.json();
        const MiniSearchModule: typeof MiniSearch = (await import('minisearch')).default;
        return MiniSearchModule.loadJSON(JSON.stringify(index), { fields: ['name', 'path', 'topic', 'tags', 'content'], storeFields: ['name', 'path', 'topic'] });
      })();
      const mini = await indexPromise;
      setSearchResults(mini.search(term).slice(0, 30).map((result) => ({ id: String(result.id), score: result.score })));
      setSearchError(false);
    } catch {
      indexPromise = null;
      setSearchError(true);
      setSearchResults([]);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void search(query), 180);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const section = params.get('section');
    if (section) document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [params]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const searchNodes = searchResults?.map((result) => data.get(result.id)).filter((node): node is ArchiveNode => Boolean(node)) ?? [];
  const filteredResults = searchNodes.filter((node) => {
    if (selectedTopic && node.topic !== selectedTopic) return false;
    if (type === 'files' && node.type !== 'file') return false;
    if (type === 'folders' && node.type !== 'dir') return false;
    return true;
  });

  return <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy"><p className="eyebrow hero-eyebrow">IT-TOP_ACADEMY / WENWU-PA</p><h1 id="hero-title">{manifest.site?.heroTitle ?? 'Код. Практика.'}<br />{manifest.site?.heroTitleSecond ?? 'Всё по порядку.'}</h1><p>{manifest.site?.tagline ?? 'Учебные задания, решения и проекты по разработке ПО.'}</p></div>
      <div className="hero-stamp" aria-label={`Курс ${manifest.site?.course ?? 3}, ${manifest.site?.courseLabel ?? 'разработка программного обеспечения'}`}><span className="hero-count">[ {String(manifest.site?.course ?? 3).padStart(2, '0')} ]</span><span className="eyebrow">КУРС / {(manifest.site?.courseLabel ?? 'РАЗРАБОТКА ПО').toLocaleUpperCase('ru')}</span><p>{manifest.site?.heroNote ?? 'От первой строки\nдо рабочего проекта.'}</p></div>
    </section>
    <main id="main" className="archive-layout">
      <aside className="archive-sidebar" aria-label="Навигация по архиву">
        <p className="eyebrow">01 / НАВИГАЦИЯ</p>
        <button className={`sidebar-all ${!selectedTopic ? 'is-active' : ''}`} onClick={() => updateParam('topic', '')}>Все материалы</button>
        <div className="sidebar-divider" />
        <nav className="topic-nav" aria-label="Периоды">
          {periods.map((year) => <details key={year}><summary><Link to={`/y/${year}`}>{year}</Link></summary><div className="period-topic-nav">{manifest.topics.filter((topic) => manifest.nodes.some((node) => node.topic === topic.id && node.path.startsWith(`classwork-${year}/`) || node.topic === topic.id && node.path.startsWith(`homework-${year}/`))).map((topic) => <Link key={topic.id} to={`/y/${year}/${encodeURIComponent(topic.id)}`}>{topic.title}</Link>)}</div></details>)}
        </nav>
        <div className="sidebar-divider" />
        <p className="eyebrow">ПЕРИОД</p>
        <label className="sr-only" htmlFor="period-filter">Фильтр по периоду</label><select id="period-filter" className="period-filter" value={period} onChange={(event) => updateParam('period', event.target.value)}><option value="all">Все периоды</option>{periods.flatMap((year) => [<option key={`${year}-autumn`} value={`${year}-autumn`}>{year} / Осенний семестр</option>, <option key={`${year}-spring`} value={`${year}-spring`}>{year} / Весенний семестр</option>])}</select>
        <p className="legend mono">CW — классная работа<br />HW — домашняя работа</p>
      </aside>

      <section className="archive-content" aria-label="Материалы">
        <div className="search-row">
          <label className="search-box"><span className="sr-only">Поиск по названию или пути</span><input ref={inputRef} value={query} onChange={(event) => updateParam('q', event.target.value)} placeholder="Поиск по названию или пути…" /><span className="search-shortcut">⌘ K</span></label>
          <label className="type-filter"><span className="sr-only">Тип материала</span><select value={type} onChange={(event) => updateParam('type', event.target.value)}><option value="all">Все типы ↓</option><option value="files">Файлы</option><option value="folders">Папки</option></select></label>
        </div>
        {query ? <section className="search-results" aria-live="polite"><h2>Результаты поиска</h2>{searchError ? <p role="alert">Индекс поиска не загрузился. Обновите страницу и попробуйте снова.</p> : searchResults === null ? <p>Ищу материалы…</p> : filteredResults.length ? filteredResults.map((node) => <SearchRow key={node.id} node={node} />) : <p>По запросу ничего не найдено.</p>}</section> : type !== 'all' ? <section className="search-results"><h2>{type === 'files' ? 'Файлы' : 'Папки'}</h2>{manifest.nodes.filter((node) => node.type === (type === 'files' ? 'file' : 'dir') && (!selectedTopic || node.topic === selectedTopic)).slice(0, 160).map((node) => <SearchRow key={node.id} node={node} />)}<Link className="tree-link" to="/tree">Все материалы в дереве файлов →</Link></section> : <>
          <section id="periods" className="subjects-section"><h2>Периоды</h2><div className="period-list">{periods.map((year) => {
            const yearNodes = manifest.nodes.filter((node) => node.path.startsWith(`classwork-${year}/`) || node.path.startsWith(`homework-${year}/`));
            const subjects = new Set(yearNodes.map((node) => node.topic).filter((topic): topic is string => Boolean(topic)));
            const tasks = yearNodes.filter((node) => node.type === 'dir' && node.date && node.workType);
            const latestDate = yearNodes.map((node) => node.lastCommit.date).filter((date): date is string => Boolean(date)).sort().at(-1);
            return <Link key={year} className="period-card" to={`/y/${year}`}><span className="subject-number">{year}</span><strong>{subjects.size} предметов</strong><span>{tasks.length} заданий · {yearNodes.filter((node) => node.type === 'file').length} файлов</span><span className="path-label">Обновлено {latestDate ?? '—'}</span></Link>;
          })}</div></section>
          <section id="subjects" className="subjects-section"><h2>Все предметы</h2><div className="subject-list">{visibleTopics.map((topic, index) => {
            const topicNodes = manifest.nodes.filter((node) => node.topic === topic.id && node.type === 'file');
            const sources = manifest.nodes.filter((node) => node.type === 'dir' && node.topic === topic.id && /^(?:classwork|homework)-\d{4}\/[^/]+$/.test(node.path));
            const count = topicNodes.length;
            const languages = topicNodes.filter((node) => sourceLanguages.has(node.language)).reduce((map, node) => map.set(node.language, (map.get(node.language) ?? 0) + 1), new Map<string, number>());
            const commonLanguage = [...languages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
            const docOnlyLabel = ['english', 'management', 'statistics'].includes(topic.id) ? 'Документы' : commonLanguage ?? (count ? 'Конспекты' : 'Документы');
            const language = commonLanguage ?? docOnlyLabel;
            return <div className="subject-card" key={topic.id}>
              <Link className="subject-main" to={`/subject/${encodeURIComponent(topic.id)}`}><span className="subject-number">{String(index + 1).padStart(2, '0')}</span><strong>{topic.title}<span className="sr-only">, {count} файлов</span></strong><span className="path-label" title={sources.map((node) => node.path).join(' · ')}>{sources.map((node) => node.path).join(' · ') || `${count} файлов`}</span></Link>
              {sources[0] && <a className="language-link" href={sources[0].githubUrl} title="Открыть на GitHub" target="_blank" rel="noreferrer">{language} ↗</a>}
            </div>;
          })}</div></section>
          <Link className="tree-link" to="/tree">Открыть дерево файлов →</Link>
          <section id="assignments" className="latest-section"><h2>Последние задания</h2><div className="latest-list">{latest.map((node) => <Link className="latest-row" key={node.id} to={`/file/${node.id}`}><span className="date-label">{displayDate(node.date)}</span><span className="latest-title">{nodeLabel(node, manifest.nodes)}</span><span className="work-label">{node.workType}</span><span className="latest-language">{manifest.nodes.find((item) => item.type === 'file' && item.path.startsWith(`${node.path}/`) && codeLanguages.has(item.language))?.language ?? 'Документы'}</span></Link>)}</div></section>
          {selectedTopic && <section className="all-topic-files"><h2>{manifest.topics.find((item) => item.id === selectedTopic)?.title}</h2>{manifest.nodes.filter((node) => node.topic === selectedTopic && node.type === 'file').slice(0, 40).map((node) => <SearchRow key={node.id} node={node} />)}</section>}
        </>}
      </section>
    </main>
  </>;
}

function SearchRow({ node }: { node: ArchiveNode }) {
  const path = node.type === 'file' ? `/file/${node.id}` : `/tree/${node.id}`;
  return <Link className="result-row" to={path}><span className="result-kind">{node.type === 'dir' ? 'DIR' : node.language || node.ext.slice(1).toUpperCase()}</span><strong>{node.title}</strong><span className="path-label">{node.path || 'IT-TOP_academy'}</span></Link>;
}
