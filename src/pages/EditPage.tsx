import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { ArchiveManifest } from '../types';

async function getLanguage(ext: string): Promise<Extension | undefined> {
  switch (ext) {
    case '.py': return (await import('@codemirror/lang-python')).python();
    case '.cpp': case '.cc': case '.cxx': case '.h': case '.hpp': case '.c': return (await import('@codemirror/lang-cpp')).cpp();
    case '.cs': return (await import('@replit/codemirror-lang-csharp')).csharp();
    case '.sql': return (await import('@codemirror/lang-sql')).sql();
    case '.html': case '.htm': return (await import('@codemirror/lang-html')).html();
    case '.css': case '.scss': return (await import('@codemirror/lang-css')).css();
    case '.js': case '.jsx': case '.ts': case '.tsx': return (await import('@codemirror/lang-javascript')).javascript({ jsx: ext === '.jsx' || ext === '.tsx', typescript: ext === '.ts' || ext === '.tsx' });
    case '.json': return (await import('@codemirror/lang-json')).json();
    case '.md': case '.markdown': return (await import('@codemirror/lang-markdown')).markdown();
    case '.java': return (await import('@codemirror/lang-java')).java();
    case '.xml': return (await import('@codemirror/lang-xml')).xml();
    case '.yml': case '.yaml': return (await import('@codemirror/lang-yaml')).yaml();
    default: return undefined;
  }
}

function lcsDiff(before: string, after: string) {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  if (oldLines.length * newLines.length > 900_000) return newLines.map((line) => ({ type: before.includes(line) ? 'same' : 'add', line }));
  const matrix = Array.from({ length: oldLines.length + 1 }, () => new Uint32Array(newLines.length + 1));
  for (let i = oldLines.length - 1; i >= 0; i--) for (let j = newLines.length - 1; j >= 0; j--) {
    matrix[i][j] = oldLines[i] === newLines[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  }
  const result: { type: 'same' | 'add' | 'remove'; line: string }[] = [];
  let i = 0; let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) { result.push({ type: 'same', line: oldLines[i++] }); j++; }
    else if (i < oldLines.length && (j === newLines.length || matrix[i + 1][j] >= matrix[i][j + 1])) result.push({ type: 'remove', line: oldLines[i++] });
    else result.push({ type: 'add', line: newLines[j++] });
  }
  return result;
}

export default function EditPage({ manifest }: { manifest: ArchiveManifest }) {
  const { nodeId = '' } = useParams();
  const node = useMemo(() => manifest.nodes.find((item) => item.id === nodeId), [manifest.nodes, nodeId]);
  const [original, setOriginal] = useState('');
  const [value, setValue] = useState('');
  const [loadedId, setLoadedId] = useState('');
  const loading = loadedId !== (node?.id ?? '');
  const [message, setMessage] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const changeHandler = useRef<(value: string) => void>(() => {});
  const editorValue = useRef(value);

  useEffect(() => {
    if (!node?.contentFile) return;
    let active = true;
    fetch(`${import.meta.env.BASE_URL}${node.contentFile.replace(/^\//, '')}`)
      .then((response) => { if (!response.ok) throw new Error('File unavailable'); return response.text(); })
      .then((text) => {
        if (!active) return;
        setOriginal(text);
        setValue(localStorage.getItem(`wenwu-draft:${node.id}`) ?? text);
        setLoadedId(node.id);
      }).catch(() => { if (active) { setLoadedId(node.id); setMessage('Предпросмотр недоступен. Откройте оригинал в GitHub.'); } });
    return () => { active = false; };
  }, [node]);

  useEffect(() => { editorValue.current = value; }, [value]);

  useEffect(() => {
    if (!host.current || loading || !node || node.type !== 'file') return;
    let active = true;
    let view: EditorView | null = null;
    Promise.all([import('codemirror'), import('@codemirror/state'), import('@codemirror/view'), getLanguage(node.ext)])
      .then(([cm, state, viewModule, language]) => {
        if (!active || !host.current) return;
        const extensions: Extension[] = [cm.basicSetup, viewModule.EditorView.updateListener.of((update) => {
          if (update.docChanged) changeHandler.current(update.state.doc.toString());
        }), viewModule.EditorView.theme({ '&': { backgroundColor: '#FFFFFF', color: '#242421' }, '.cm-gutters': { backgroundColor: '#FAFAF6', color: '#73736C', border: 'none' } })];
        if (language) extensions.push(language);
        view = new viewModule.EditorView({
          parent: host.current,
          state: state.EditorState.create({ doc: editorValue.current, extensions }),
        });
        editor.current = view;
      }).catch(() => setMessage('Редактор не загрузился. Скачайте файл или откройте его в github.dev.'));
    return () => { active = false; view?.destroy(); editor.current = null; };
  }, [loading, node]);

  useEffect(() => { changeHandler.current = setValue; }, []);

  const saveDraft = () => {
    if (!node) return;
    localStorage.setItem(`wenwu-draft:${node.id}`, value);
    setMessage('Черновик сохранён в этом браузере.');
  };
  const download = () => {
    if (!node) return;
    const url = URL.createObjectURL(new Blob([new TextEncoder().encode(value)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = node.name; link.click(); URL.revokeObjectURL(url);
  };

  if (!node) return <main id="main" className="edit-page"><h1>Материал не найден</h1><Link to="/">В архив</Link></main>;
  if (node.type !== 'file' || !node.contentFile || ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(node.ext)) return <main id="main" className="edit-page"><h1>Этот файл нельзя редактировать в браузере</h1><p>Откройте его в GitHub или сохраните оригинал.</p><a className="button" href={node.githubUrl} target="_blank" rel="noopener noreferrer">GitHub ↗</a></main>;
  const diff = showDiff ? lcsDiff(original, value) : [];

  return <main id="main" className="edit-page"><p className="breadcrumbs">АРХИВ / РЕДАКТОР / {node.path}</p><h1 className="assignment-heading">Черновик: {node.name}</h1><p className="assignment-path">Изменения хранятся только в этом браузере, исходный репозиторий не меняется.</p>
    <div className="edit-toolbar"><button className="button button--primary" onClick={saveDraft}>Сохранить черновик</button><button className="button" onClick={() => setShowDiff((current) => !current)}>{showDiff ? 'Скрыть diff' : 'Показать diff'}</button><button className="button" onClick={download}>Скачать файл</button><a className="button" href={node.editUrl} target="_blank" rel="noopener noreferrer">GitHub ↗</a><a className="button" href={node.githubDevUrl} target="_blank" rel="noopener noreferrer">github.dev ↗</a></div>
    {message && <p className="message-success" role="status">{message}</p>}{loading ? <p>Загружаю исходник…</p> : <div className="editor-shell" ref={host} aria-label="Редактор текста" />}
    {showDiff && <section><h2>Изменения</h2><pre className="diff-view">{diff.map((part, index) => part.type === 'remove' ? <del key={index}>− {part.line}{'\n'}</del> : part.type === 'add' ? <ins key={index}>+ {part.line}{'\n'}</ins> : <span key={index}>  {part.line}{'\n'}</span>)}</pre></section>}
  </main>;
}
