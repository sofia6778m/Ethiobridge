import { useTranslation } from 'react-i18next';

export default function PrivacyPolicy() {
  const { t } = useTranslation();

  return (
    <div>
      <section className="bg-gradient-to-r from-primary-700 to-primary-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">{t('privacy.title')}</h1>
          <p className="text-primary-100">{t('privacy.lastUpdated')}</p>
        </div>
      </section>
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="prose prose-gray max-w-none space-y-8">
          {[
            { title: t('privacy.s1Title'), content: t('privacy.s1Content') },
            { title: t('privacy.s2Title'), content: t('privacy.s2Content') },
            { title: t('privacy.s3Title'), content: t('privacy.s3Content') },
            { title: t('privacy.s4Title'), content: t('privacy.s4Content') },
            { title: t('privacy.s5Title'), content: t('privacy.s5Content') },
            { title: t('privacy.s6Title'), content: t('privacy.s6Content') },
            { title: t('privacy.s7Title'), content: t('privacy.s7Content') },
            { title: t('privacy.s8Title'), content: t('privacy.s8Content') },
            { title: t('privacy.s9Title'), content: t('privacy.s9Content') },
            { title: t('privacy.s10Title'), content: t('privacy.s10Content') },
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
