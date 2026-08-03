import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function FAQ() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(null);

  const faqs = [
    { q: t('faq.q1'), a: t('faq.a1') },
    { q: t('faq.q2'), a: t('faq.a2') },
    { q: t('faq.q3'), a: t('faq.a3') },
    { q: t('faq.q4'), a: t('faq.a4') },
    { q: t('faq.q5'), a: t('faq.a5') },
    { q: t('faq.q6'), a: t('faq.a6') },
    { q: t('faq.q7'), a: t('faq.a7') },
    { q: t('faq.q8'), a: t('faq.a8') },
    { q: t('faq.q9'), a: t('faq.a9') },
    { q: t('faq.q10'), a: t('faq.a10') },
    { q: t('faq.q11'), a: t('faq.a11') },
    { q: t('faq.q12'), a: t('faq.a12') },
  ];

  return (
    <div>
      <section className="bg-gradient-to-r from-primary-700 to-primary-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">{t('faq.headerTitle')}</h1>
          <p className="text-primary-100 text-lg">{t('faq.headerDesc')}</p>
        </div>
      </section>

      <section className="py-16 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="font-medium text-gray-800 dark:text-gray-200 pr-4">{f.q}</span>
                <span className={`text-gray-400 dark:text-gray-500 transition-transform shrink-0 ${open === i ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {open === i && (
                <div className="px-5 pb-5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-gray-700 pt-3">
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 bg-primary-50 dark:bg-primary-900/20 rounded-xl p-6 text-center">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('faq.stillHaveQuestions')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('faq.supportDesc')}</p>
          <Link to="/contact" className="btn-primary py-2.5 px-6 inline-block">{t('faq.contactUs')}</Link>
        </div>
      </section>
    </div>
  );
}