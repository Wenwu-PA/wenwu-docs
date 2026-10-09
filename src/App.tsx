import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import type { ArchiveManifest } from './types';
import Header from './components/Header';
import ArchivePage from './pages/ArchivePage';
import AssignmentPage from './pages/AssignmentPage';
import EditPage from './pages/EditPage';
import KitPage from './pages/KitPage';
import TreePage from './pages/TreePage';
import Footer from './components/Footer';
import HierarchyPage from './pages/HierarchyPage';
import SettingsDialog from './components/SettingsDialog';

interface ErrorBoundaryState { failed: boolean }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };
  static getDerivedStateFromError(): ErrorBoundaryState { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Archive UI error', error, info); }
  render() {
    if (this.state.failed) return <main className="load-state" role="alert"><h1>Не удалось открыть архив</h1><p>Обновите страницу или вернитесь к материалам.</p><a className="button" href={import.meta.env.BASE_URL}>На главную</a></main>;
    return this.props.children;
  }
}

export default function App() {
  const [manifest, setManifest] = useState<ArchiveManifest | null>(null);
  const [error, setError] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const load = useCallback(async () => {
    let buildId = 'local';
    try {
      const versionResponse = await fetch(`${import.meta.env.BASE_URL}data/version.json`, { cache: 'no-store' });
      if (versionResponse.ok) {
        const version = await versionResponse.json() as { buildId?: string };
        if (version.buildId) {
          buildId = version.buildId;
          try {
            const previous = localStorage.getItem('wenwu-build-id');
            if (previous && previous !== buildId) setNewVersion(buildId);
            localStorage.setItem('wenwu-build-id', buildId);
          } catch { /* Storage can be disabled in private browsing. */ }
        }
      }
    } catch { /* Load the manifest without a version key if version.json is unavailable. */ }
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/manifest.json?v=${encodeURIComponent(buildId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Manifest unavailable');
      setManifest(await response.json() as ArchiveManifest);
      setError(false);
    } catch { setError(true); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    const skip = document.querySelector<HTMLAnchorElement>('.skip-link');
    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      const main = document.getElementById('main');
      if (main) { main.tabIndex = -1; main.focus(); main.scrollIntoView(); }
    };
    skip?.addEventListener('click', onClick);
    return () => skip?.removeEventListener('click', onClick);
  }, []);

  if (!manifest) return <main className="load-state" aria-live="polite">{error ? <><h1>Архив пока недоступен</h1><p>Не удалось загрузить список материалов.</p><button className="button" onClick={() => { setError(false); load(); }}>Повторить</button></> : <p>Загружаю архив…</p>}</main>;

  return (
    <ErrorBoundary>
      <Header />
      <ScrollManager />
      {newVersion && <div className="version-banner" role="status">Доступна новая версия <button className="text-link plain-button" onClick={() => { try { localStorage.setItem('wenwu-build-id', newVersion); } catch { /* Storage can be disabled in private browsing. */ } window.location.reload(); }}>Обновить</button><button className="plain-button" aria-label="Скрыть уведомление" onClick={() => setNewVersion('')}>×</button></div>}
      <Routes>
        <Route path="/" element={<ArchivePage manifest={manifest} />} />
        <Route path="/y/:year" element={<HierarchyPage manifest={manifest} />} />
        <Route path="/y/:year/:topicId" element={<HierarchyPage manifest={manifest} />} />
        <Route path="/subject/:topicId" element={<HierarchyPage manifest={manifest} />} />
        <Route path="/file/:nodeId" element={<AssignmentPage manifest={manifest} />} />
        <Route path="/edit/:nodeId" element={<EditPage manifest={manifest} />} />
        <Route path="/tree" element={<TreePage manifest={manifest} />} />
        <Route path="/tree/:nodeId" element={<TreePage manifest={manifest} />} />
        <Route path="/_kit" element={<KitPage topics={manifest.topics} />} />
        <Route path="*" element={<ArchivePage manifest={manifest} />} />
      </Routes>
      <Footer manifest={manifest} onOpenSettings={() => setSettingsOpen(true)} />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </ErrorBoundary>
  );
}

function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    window.history.scrollRestoration = 'manual';
    const key = `wenwu-scroll:${location.pathname}`;
    if (navigationType === 'POP' || (location.state as { restore?: boolean } | null)?.restore) {
      let saved = 0;
      try { saved = Number(sessionStorage.getItem(key)); } catch { /* Session storage may be unavailable. */ }
      requestAnimationFrame(() => window.scrollTo(0, Number.isFinite(saved) ? saved : 0));
    } else window.scrollTo(0, 0);
    return () => { try { sessionStorage.setItem(key, String(window.scrollY)); } catch { /* Navigation still works without session storage. */ } };
  }, [location.pathname, location.state, navigationType]);
  return null;
}
