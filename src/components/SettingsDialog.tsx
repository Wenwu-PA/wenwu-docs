import { useEffect, useRef, useState } from 'react';
import { clearVisitHistory } from '../utils/visitHistory';

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="dialog-head"><div><p className="eyebrow">WENWU / ПАРАМЕТРЫ</p><h2 id="settings-title">Настройки</h2></div><button ref={closeButton} className="button" onClick={onClose}>Закрыть</button></div>
      <p>Личная история открытых заданий хранится в этом браузере.</p>
      <button className="button" onClick={() => { clearVisitHistory(); setNotice('История посещений очищена.'); }}>Очистить историю посещений</button>
      {notice && <p className="message-success" role="status">{notice}</p>}
    </section>
  </div>;
}
