import { useMemo, useRef, useState } from 'react';
import type { ArchiveManifest } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { clearVisitHistory, readVisitHistory, notifyVisitHistoryChange } from '../utils/visitHistory';

const EXAMPLE = { title: 'Расстояние между деревьями', topic: 'Алгоритмы', date: '29.09.2026', path: 'homework-2026/algorithms/task', githubUrl: 'https://github.com/Wenwu-PA/IT-TOP_academy', siteUrl: window.location.origin };

export default function SettingsPage({ manifest }: { manifest: ArchiveManifest }) {
  const { settings, update } = useSettings();
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const historyCount = readVisitHistory(manifest.nodes).length;
  const preview = useMemo(() => settings.diaryTemplate.replace(/\{(title|topic|date|path|githubUrl|siteUrl)\}/g, (_, key: keyof typeof EXAMPLE) => EXAMPLE[key]), [settings.diaryTemplate]);
  const localKeys = () => { try { return Object.keys(localStorage).filter((key) => key.startsWith('wenwu-')); } catch { return []; } };
  const clearDrafts = () => {
    const keys = localKeys().filter((key) => key.startsWith('wenwu-draft:'));
    if (window.confirm(`Удалить черновики (${keys.length})?`)) {
      try { keys.forEach((key) => localStorage.removeItem(key)); setNotice(`Черновики удалены: ${keys.length}.`); }
      catch { setNotice('Хранилище браузера недоступно; черновики не изменены.'); }
    }
  };
  const resetLocal = () => {
    const count = localKeys().length;
    if (!window.confirm(`Сбросить все локальные данные архива (${count} записей)? Это действие нельзя отменить.`)) return;
    try { localKeys().forEach((key) => localStorage.removeItem(key)); clearVisitHistory(); window.location.reload(); }
    catch { setNotice('Хранилище браузера недоступно; данные не были сброшены.'); }
  };
  const exportData = () => {
    try {
      const data = Object.fromEntries(localKeys().map((key) => [key, localStorage.getItem(key)]));
      const blob = new Blob([JSON.stringify({ format: 'wenwu-local-data', version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'wenwu-local-data.json'; link.click(); URL.revokeObjectURL(url);
    } catch { setNotice('Хранилище браузера недоступно; экспортировать данные не удалось.'); }
  };
  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as { format?: string; data?: Record<string, string | null> };
      if (payload.format !== 'wenwu-local-data' || !payload.data || typeof payload.data !== 'object') throw new Error('Неверный формат файла.');
      if (!window.confirm('Импортировать историю, черновики, журнал и настройки? Текущие значения будут заменены.')) return;
      Object.entries(payload.data).forEach(([key, value]) => { if (key.startsWith('wenwu-') && typeof value === 'string') localStorage.setItem(key, value); });
      notifyVisitHistoryChange();
      window.location.reload();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Не удалось импортировать файл.'); }
  };

  return <main id="main" className="settings-page">
    <p className="breadcrumbs"><a href="#/">АРХИВ</a> / НАСТРОЙКИ</p><h1>Настройки</h1>
    <p className="settings-intro">Параметры применяются сразу и хранятся в этом браузере.</p>
    {notice && <p className="message-success" role="status">{notice}</p>}
    <section className="settings-section" aria-labelledby="settings-appearance"><h2 id="settings-appearance">Внешний вид</h2><div className="settings-grid">
      <label>Тема<select value={settings.theme} onChange={(e) => update('theme', e.target.value as typeof settings.theme)}><option value="light">Светлая</option><option value="dark">Тёмная</option><option value="system">Системная</option></select></label>
      <label>Размер текста<select value={settings.textSize} onChange={(e) => update('textSize', e.target.value as typeof settings.textSize)}><option value="small">Маленький</option><option value="normal">Обычный</option><option value="large">Крупный</option></select></label>
      <label>Размер кода<select value={settings.codeSize} onChange={(e) => update('codeSize', Number(e.target.value) as typeof settings.codeSize)}><option value="12">12 px</option><option value="14">14 px</option><option value="16">16 px</option></select></label>
      <label>Подсветка кода<select value={settings.highlightTheme} onChange={(e) => update('highlightTheme', e.target.value as typeof settings.highlightTheme)}><option value="auto">Авто</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label>
      <label className="settings-check"><input type="checkbox" checked={settings.wrapCode} onChange={(e) => update('wrapCode', e.target.checked)} /> Переносить строки кода</label>
      <label className="settings-check"><input type="checkbox" checked={settings.lineNumbers} onChange={(e) => update('lineNumbers', e.target.checked)} /> Показывать номера строк</label>
    </div></section>
    <section className="settings-section"><h2>Навигация и история</h2><div className="settings-grid"><label>Лимит истории<select value={settings.historyLimit} onChange={(e) => update('historyLimit', Number(e.target.value) as typeof settings.historyLimit)}><option value="10">10 посещений</option><option value="20">20 посещений</option><option value="50">50 посещений</option></select></label><p>Сохранено посещений: <strong>{historyCount}</strong></p></div><div className="settings-actions"><button className="button" onClick={() => { if (window.confirm(`Очистить историю посещений (${historyCount} записей)?`)) { clearVisitHistory(); setNotice(`История очищена: ${historyCount}.`); } }}>Очистить историю посещений ({historyCount})</button><button className="button" onClick={clearDrafts}>Очистить черновики</button><button className="button button--danger" onClick={resetLocal}>Сбросить все локальные данные</button></div></section>
    <section className="settings-section"><h2>Дневник</h2><div className="settings-grid"><label>URL дневника<input type="url" value={settings.diaryUrl} onChange={(e) => update('diaryUrl', e.target.value)} placeholder="https://…" /></label><label>Имя ZIP-файла<input value={settings.zipFileName} onChange={(e) => update('zipFileName', e.target.value)} /></label></div><label className="settings-field">Шаблон записи<textarea value={settings.diaryTemplate} onChange={(e) => update('diaryTemplate', e.target.value)} /></label><p className="settings-caption">Поля: {'{title}'} · {'{topic}'} · {'{date}'} · {'{path}'} · {'{githubUrl}'} · {'{siteUrl}'}</p><h3>Предпросмотр</h3><pre className="diary-preview">{preview}</pre></section>
    <section className="settings-section"><h2>Данные</h2><p>Экспорт включает историю, черновики, журнал отправок и настройки.</p><div className="settings-actions"><button className="button" onClick={exportData}>Экспортировать JSON</button><button className="button" onClick={() => fileInput.current?.click()}>Импортировать JSON</button><input ref={fileInput} className="sr-only" type="file" accept="application/json,.json" onChange={(e) => { void importData(e.target.files?.[0]); e.currentTarget.value = ''; }} /></div></section>
    <section className="settings-section"><h2>О проекте</h2><dl className="settings-about"><dt>Версия сборки</dt><dd>{manifest.buildId ?? 'локальная сборка'}</dd><dt>SHA контента</dt><dd><a href={`${manifest.source}/commit/${manifest.commit}`}>{manifest.commit}</a></dd><dt>Синхронизация</dt><dd>{new Date(manifest.generatedAt).toLocaleString('ru-RU')}</dd><dt>Сайт</dt><dd><a href="https://wenwu-pa.github.io/wenwu-docs/">wenwu-pa.github.io/wenwu-docs</a></dd><dt>Сайт и контент</dt><dd><a href="https://github.com/Wenwu-PA/wenwu-docs">wenwu-docs</a> · <a href={manifest.source}>IT-TOP_academy</a></dd><dt>Горячие клавиши</dt><dd>Ctrl/⌘ + K — поиск · J/K — следующее/предыдущее задание · Esc — закрыть окно</dd></dl></section>
    <a className="settings-back" href="#/">← Вернуться в архив</a>
  </main>;
}
