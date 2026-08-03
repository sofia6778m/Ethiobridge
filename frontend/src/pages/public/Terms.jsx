import { useTranslation } from 'react-i18next';

export default function Terms() {
  const { t } = useTranslation();

  return (
    <div>
      <section className="bg-gradient-to-r from-primary-700 to-primary-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">{t('terms.title')}</h1>
          <p className="text-primary-100">{t('terms.lastUpdated')}</p>
        </div>
      </section>
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-8">
          {[
            { title: t('terms.s1Title'), content: t('terms.s1Content') },
            { title: t('terms.s2Title'), content: t('terms.s2Content') },
            { title: t('terms.s3Title'), content: t('terms.s3Content') },
            { title: t('terms.s4Title'), content: t('terms.s4Content') },
            { title: t('terms.s5Title'), content: t('terms.s5Content') },
            { title: t('terms.s6Title'), content: t('terms.s6Content') },
            { title: t('terms.s7Title'), content: t('terms.s7Content') },
            { title: t('terms.s8Title'), content: t('terms.s8Content') },
            { title: t('terms.s9Title'), content: t('terms.s9Content') },
            { title: t('terms.s10Title'), content: t('terms.s10Content') },
            { title: t('terms.s11Title'), content: t('terms.s11Content') },
            { title: t('terms.s12Title'), content: t('terms.s12Content') },
          ].map((s) => (
            <div key={s.title}>
              <h2 className="text-lg font-bold text-gray-900 mb-2">{s.title}</h2>
              <p className="text-gray-600 leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
