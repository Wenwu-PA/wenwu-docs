import { useEffect, useRef, useState } from 'react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export default function PdfPreview({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const render = async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const document = await pdfjs.getDocument({ url }).promise;
        const container = host.current;
        if (!container || !active) return;
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
          const page = await document.getPage(pageNumber);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(1.5, Math.max(0.5, (container.clientWidth || 720) / base.width));
          const viewport = page.getViewport({ scale });
          const canvas = window.document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context || !active) return;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.setAttribute('aria-label', `Страница ${pageNumber}`);
          container.append(canvas);
          await page.render({ canvas, canvasContext: context, viewport }).promise;
        }
      } catch { if (active) setError(true); }
    };
    void render();
    return () => { active = false; };
  }, [url]);
  return <div className="pdf-preview"><div className="pdf-pages" ref={host} aria-label="Страницы PDF" />{error && <p role="alert">Не удалось показать PDF. <a href={url}>Скачать файл ↗</a></p>}</div>;
}
