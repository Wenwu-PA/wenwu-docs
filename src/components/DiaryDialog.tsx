import { useEffect, useMemo, useRef, useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import type { ArchiveNode } from '../types';
import { renderDiaryTemplate } from '../utils/diaryTemplate';

const defaultTemplate = `Работа: {{title}}\nПредмет: {{topic}}\nТип: {{type}}\nДата: {{date}}\nПуть: {{path}}\n\nРешение приложено в ZIP-архиве.`;
const templateKey = 'wenwu-diary-template-v1';
const logKey = 'wenwu-diary-log-v1';
type JournalEntry = { id: string; path: string; submittedAt: string; message: string; status: string };

function readJournal(): JournalEntry[] {
  try { return JSON.parse(localStorage.getItem(logKey) ?? '[]') as JournalEntry[]; }
  catch { return []; }
}

function readStatus(id: string) {
  try { return (JSON.parse(localStorage.getItem('wenwu-status-v1') ?? '{}') as Record<string, string>)[id] ?? ''; }
  catch { return ''; }
}

export default function DiaryDialog({ node, source, files, onClose }: { node: ArchiveNode; source: string; files: ArchiveNode[]; onClose: () => void }) {
  const [template, setTemplate] = useState(() => localStorage.getItem(templateKey) ?? defaultTemplate);
  const [notice, setNotice] = useState('');
  const [journal, setJournal] = useState(readJournal);
  const [status, setStatus] = useState(() => readStatus(node.id));
  const closeButton = useRef<HTMLButtonElement>(null);
  const topic = node.topic ?? 'Учебный архив';
  const message = useMemo(() => renderDiaryTemplate(template, node, topic), [node, template, topic]);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveJournal = () => {
    const entries = [{ id: node.id, path: node.path, submittedAt: new Date().toISOString(), message, status: 'prepared' }, ...journal];
    localStorage.setItem(logKey, JSON.stringify(entries.slice(0, 100)));
    setJournal(entries.slice(0, 100));
    const statuses = JSON.parse(localStorage.getItem('wenwu-status-v1') ?? '{}') as Record<string, string>;
    statuses[node.id] = status || 'prepared';
    localStorage.setItem('wenwu-status-v1', JSON.stringify(statuses));
  };

  const markSubmitted = () => {
    const nextStatus = 'submitted';
    const existing = journal.some((entry) => entry.id === node.id);
    const entries = existing
      ? journal.map((entry) => entry.id === node.id ? { ...entry, submittedAt: new Date().toISOString(), status: nextStatus } : entry)
      : [{ id: node.id, path: node.path, submittedAt: new Date().toISOString(), message, status: nextStatus }, ...journal];
    localStorage.setItem(logKey, JSON.stringify(entries.slice(0, 100)));
    const statuses = JSON.parse(localStorage.getItem('wenwu-status-v1') ?? '{}') as Record<string, string>;
    statuses[node.id] = nextStatus;
    localStorage.setItem('wenwu-status-v1', JSON.stringify(statuses));
    setJournal(entries.slice(0, 100));
    setStatus(nextStatus);
    setNotice('Статус сохранён как «отправлено».');
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    setNotice('Текст записи скопирован.');
    saveJournal();
  };

  const downloadZip = async () => {
    const entries: Record<string, Uint8Array> = { 'diary-entry.txt': strToU8(message) };
    let skipped = 0;
    let total = 0;
    for (const file of node.type === 'file' && source ? [] : files) {
      if (!file.contentFile) { skipped++; continue; }
      const url = `${import.meta.env.BASE_URL}${file.contentFile.replace(/^\//, '')}`;
      try {
        const response = await fetch(url);
        if (!response.ok) { skipped++; continue; }
        const content = new Uint8Array(await response.arrayBuffer());
        if (content.byteLength > 10 * 1024 * 1024 || total + content.byteLength > 10 * 1024 * 1024) { skipped++; continue; }
        total += content.byteLength;
        const relative = node.type === 'file' ? file.name : file.path.slice(node.path ? node.path.length + 1 : 0);
        entries[`work/${relative}`] = content;
      } catch { skipped++; }
    }
    if (node.type === 'file' && source) entries[`work/${node.name}`] = strToU8(source);
    const archive = zipSync(entries, { level: 6 });
    const objectUrl = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${(node.title || node.name || 'work').replace(/[<>:"/\\|?*]/g, '-')}.zip`;
    link.click();
    URL.revokeObjectURL(objectUrl);
    saveJournal();
    setNotice(`Архив скачан, запись добавлена в локальный журнал.${skipped ? ` Файлов пропущено: ${skipped}.` : ''}`);
  };

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="diary-title">
      <div className="dialog-head"><div><p className="section-label">АРХИВ / ЭКСПОРТ</p><h2 id="diary-title">В дневник</h2></div><button ref={closeButton} className="button" onClick={onClose} aria-label="Закрыть">Закрыть</button></div>
      <p>Текст можно скопировать в дневник вручную. ZIP содержит запись и доступные файлы из выбранной папки (до 10 MiB). Секреты и пароли не нужны.</p>
      {status && <p className="message-success" role="status">Статус: {status === 'submitted' ? 'отправлено' : 'подготовлено'}</p>}
      <label className="template-label" htmlFor="diary-template">Шаблон записи</label>
      <textarea id="diary-template" value={template} onChange={(event) => setTemplate(event.target.value)} />
      <p className="eyebrow">Поля: {'{{title}}'} · {'{{topic}}'} · {'{{type}}'} · {'{{date}}'} · {'{{path}}'}</p>
      <label className="template-label" htmlFor="diary-preview">Предпросмотр</label>
      <pre id="diary-preview" className="diary-preview">{message}</pre>
      {notice && <p className="message-success" role="status">{notice}</p>}
      <div className="dialog-actions">
        <button className="button button--primary" onClick={copyMessage}>Скопировать запись</button>
        <button className="button" onClick={downloadZip}>Скачать ZIP</button>
        <button className="button" onClick={() => { localStorage.setItem(templateKey, template); setNotice('Шаблон сохранён на этом устройстве.'); }}>Сохранить шаблон</button>
        <button className="button" onClick={markSubmitted}>Отметить отправленной</button>
      </div>
      <details className="journal-history"><summary>Журнал отправок ({journal.length})</summary>{journal.length ? <ol>{journal.slice(0, 10).map((entry, index) => <li key={`${entry.id}-${entry.submittedAt}-${index}`}><span>{entry.status === 'submitted' ? 'Отправлено' : 'Подготовлено'}</span><span className="path-label">{entry.path}</span><time dateTime={entry.submittedAt}>{new Date(entry.submittedAt).toLocaleDateString('ru-RU')}</time></li>)}</ol> : <p>Записей пока нет.</p>}</details>
    </section>
  </div>;
}
