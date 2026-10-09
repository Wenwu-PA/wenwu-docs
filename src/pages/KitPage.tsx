export default function KitPage({ topics }: { topics: { id: string; title: string }[] }) {
  return <main id="main" className="kit-page"><p className="breadcrumbs">WENWU / UI KIT</p><h1 className="assignment-heading">Архив, который можно читать.</h1><p className="eyebrow">IBM PLEX SANS / IBM PLEX MONO · 8 PX · УГЛЫ 0 · БЕЗ ТЕНЕЙ</p>
    <section className="kit-grid" aria-label="Цветовые токены"><div className="kit-swatch kit-swatch--red">#D52A27<br />red</div><div className="kit-swatch kit-swatch--paper">#FAFAF6<br />paper</div><div className="kit-swatch kit-swatch--ink">#242421<br />ink</div><div className="kit-swatch"><span className="brand-mark">[W]</span><br /><span className="brand-title">WENWU / УЧЕБНЫЙ АРХИВ</span></div></section>
    <h2>Предметы</h2><div className="kit-grid">{topics.map((topic, index) => <div className="subject-card" key={topic.id}><span className="subject-number">{String(index + 1).padStart(2, '0')}</span><strong>{topic.title}</strong></div>)}</div>
  </main>;
}
