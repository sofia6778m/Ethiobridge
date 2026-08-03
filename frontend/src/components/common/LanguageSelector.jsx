import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en',  nativeLabel: 'English',       englishLabel: 'English'     },
  { code: 'am',  nativeLabel: 'አማርኛ',          englishLabel: 'Amharic'     },
  { code: 'om',  nativeLabel: 'Afaan Oromoo',  englishLabel: 'Afaan Oromoo'},
  { code: 'ti',  nativeLabel: 'ትግርኛ',          englishLabel: 'Tigrinya'    },
  { code: 'so',  nativeLabel: 'Somali',         englishLabel: 'Somali'      },
  { code: 'aa',  nativeLabel: 'Afar',           englishLabel: 'Afar'        },
  { code: 'sid', nativeLabel: 'Sidamu Afoo',    englishLabel: 'Sidamu Afoo' },
];

export default function LanguageSelector({ variant = 'navbar' }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem('zda_language', code);
    document.documentElement.lang = code;
    setOpen(false);
  };

  const triggerBase = 'flex items-center gap-1.5 rounded-lg text-sm font-medium transition-colors select-none cursor-pointer';
  const triggerStyle = variant === 'dashboard'
    ? `${triggerBase} px-3 py-1.5 text-gray-600 hover:bg-gray-100`
    : `${triggerBase} px-3 py-1.5 text-gray-600 hover:bg-gray-50 border border-gray-200 hover:border-gray-300`;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={triggerStyle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select language"
      >
        <svg className="w-4 h-4 text-primary-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
        </svg>
        <span className="hidden sm:inline max-w-[80px] truncate">{current.nativeLabel}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-fade-in" role="listbox">
          {LANGUAGES.map(lang => {
            const isActive = lang.code === i18n.language;
            return (
              <button
                key={lang.code}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(lang.code)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${isActive ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <div className="flex flex-col text-left">
                  <span className={isActive ? 'font-semibold' : 'font-medium'}>{lang.nativeLabel}</span>
                  {lang.nativeLabel !== lang.englishLabel && (
                    <span className="text-xs text-gray-400 font-normal">{lang.englishLabel}</span>
                  )}
                </div>
                {isActive && (
                  <svg className="w-4 h-4 text-primary-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
