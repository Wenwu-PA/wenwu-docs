import type { ArchiveManifest } from '../types';
import { Link } from 'react-router-dom';

export default function Footer({ manifest }: { manifest: ArchiveManifest }) {
  const updated = new Date(manifest.generatedAt).toLocaleDateString('ru-RU');
  const commitUrl = `${manifest.source}/commit/${manifest.commit}`;
  return <footer id="about" className="site-footer"><span>[W] / Учусь, пишу, сохраняю.</span><span className="footer-update">Обновлено {updated} · <a href={commitUrl} target="_blank" rel="noreferrer" title="Открыть коммит источника">{manifest.commit.slice(0, 7)} ↗</a></span><Link className="settings-link" to="/settings">Настройки</Link><a className="icon-text" href="https://github.com/Wenwu-PA" target="_blank" rel="noreferrer">Wenwu-PA / GitHub ↗</a></footer>;
}
