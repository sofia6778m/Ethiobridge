import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en  from './locales/en.json';
import am  from './locales/am.json';
import om  from './locales/om.json';
import ti  from './locales/ti.json';
import so  from './locales/so.json';
import aa  from './locales/aa.json';
import sid from './locales/sid.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en:  { translation: en  },
      am:  { translation: am  },
      om:  { translation: om  },
      ti:  { translation: ti  },
      so:  { translation: so  },
      aa:  { translation: aa  },
      sid: { translation: sid },
    },
    fallbackLng: 'en',
    lng: localStorage.getItem('zda_language') || 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'zda_language',
      caches: ['localStorage'],
    },
  });

export default i18n;
