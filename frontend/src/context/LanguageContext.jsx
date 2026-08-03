import { createContext, useContext, useState, useCallback } from 'react';
import i18n from 'i18next';

// ── Language definitions ──────────────────────────────────────────────────────
// To add a new language later, just append one object to this array.
export const LANGUAGES = [
  { code: 'en',  label: 'English',      nativeLabel: 'English'       },
  { code: 'am',  label: 'Amharic',      nativeLabel: 'አማርኛ'          },
  { code: 'om',  label: 'Afaan Oromoo', nativeLabel: 'Afaan Oromoo'  },
  { code: 'ti',  label: 'Tigrinya',     nativeLabel: 'ትግርኛ'          },
  { code: 'so',  label: 'Somali',       nativeLabel: 'Somali'        },
  { code: 'aa',  label: 'Afar',         nativeLabel: 'Afar'          },
  { code: 'sid', label: 'Sidamu Afoo',  nativeLabel: 'Sidamu Afoo'   },
];

const STORAGE_KEY = 'zda_language';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.find(l => l.code === saved) || LANGUAGES[0];
  });

  const setLanguage = useCallback((code) => {
    const lang = LANGUAGES.find(l => l.code === code);
    if (!lang) return;
    localStorage.setItem(STORAGE_KEY, code);
    setLanguageState(lang);
    i18n.changeLanguage(code);
    document.documentElement.lang = code;
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
