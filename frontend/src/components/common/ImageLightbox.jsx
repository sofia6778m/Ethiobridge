import { useState, useEffect, useCallback } from 'react';

export default function ImageLightbox({ images = [], videos = [], startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const total = images.length + videos.length;

  const allMedia = [
    ...images.map(src => ({ type: 'image', src })),
    ...videos.map(src => ({ type: 'video', src })),
  ];

  const prev = useCallback(() => setIndex(i => (i > 0 ? i - 1 : total - 1)), [total]);
  const next = useCallback(() => setIndex(i => (i < total - 1 ? i + 1 : 0)), [total]);

  useEffect(() => {
    if (!onClose) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, prev, next]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!allMedia.length || !onClose) return null;
  const current = allMedia[index];

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl z-10" aria-label="Close">×</button>

      {total > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white text-2xl w-10 h-10 rounded-full flex items-center justify-center z-10">‹</button>
          <button onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white text-2xl w-10 h-10 rounded-full flex items-center justify-center z-10">›</button>
        </>
      )}

      <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {current.type === 'image' ? (
          <img src={current.src} alt="" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
        ) : (
          <video src={current.src} controls className="max-w-full max-h-[85vh] rounded-lg" />
        )}
      </div>

      {total > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <span className="text-white/70 text-sm">{index + 1} / {total}</span>
          <div className="flex gap-1">
            {allMedia.map((m, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                className={`w-2 h-2 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/30 hover:bg-white/50'}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
