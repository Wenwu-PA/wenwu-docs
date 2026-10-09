import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="site-header">
      <Link to="/" className="brand" aria-label="Wenwu — Учебный архив, главная"><span className="brand-mark">[W]</span><span className="brand-title">WENWU / УЧЕБНЫЙ АРХИВ</span></Link>
      <nav className="header-nav" aria-label="Главная навигация">
        <Link to="/?section=subjects">Предметы</Link>
        <Link to="/?section=assignments">Задания</Link>
        <Link to="/?section=about">О репозитории</Link>
        <a className="icon-text" href="https://github.com/Wenwu-PA/IT-TOP_academy" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </nav>
    </header>
  );
}
