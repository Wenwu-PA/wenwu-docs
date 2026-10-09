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
  const load = useCallback(() => {
    fetch(`${import.meta.env.BASE_URL}data/manifest.json`, { cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new Error('Manifest unavailable'); return response.json() as Promise<ArchiveManifest>; })
      .then(setManifest).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/version.json`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ buildId: string }> : Promise.reject())
      .then(({ buildId }) => {
        const previous = localStorage.getItem('wenwu-build-id');
        if (previous && previous !== buildId) setNewVersion(buildId);
        localStorage.setItem('wenwu-build-id', buildId);
      }).catch(() => undefined);
  }, []);
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
      {newVersion && <div className="version-banner" role="status">Доступна новая версия <button className="text-link plain-button" onClick={() => { localStorage.setItem('wenwu-build-id', newVersion); window.location.reload(); }}>Обновить</button><button className="plain-button" aria-label="Скрыть уведомление" onClick={() => setNewVersion('')}>×</button></div>}
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
      <Footer manifest={manifest} />
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
      const saved = Number(sessionStorage.getItem(key));
      requestAnimationFrame(() => window.scrollTo(0, Number.isFinite(saved) ? saved : 0));
    } else window.scrollTo(0, 0);
    return () => sessionStorage.setItem(key, String(window.scrollY));
  }, [location.pathname, location.state, navigationType]);
  return null;
}
