import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function About() {
  const { t } = useTranslation();
  return (
    <div>
      {/* Header */}
      <section className="bg-gradient-to-r from-primary-700 to-primary-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">{t('about.headerTitle')}</h1>
          <p className="text-primary-100 text-lg">{t('about.headerDesc')}</p>
        </div>
      </section>

      {/* About */}
      <section className="py-16 bg-white dark:bg-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">{t('about.whatIs')}</h2>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                {t('about.para1')}
              </p>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                {t('about.para2')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key:'infra', icon:'🏗️', label:'about.featureInfra', color:'bg-blue-50 dark:bg-blue-900/20' },
                { key:'analytics', icon:'📊', label:'about.featureAnalytics', color:'bg-green-50 dark:bg-green-900/20' },
              ].map((f) => (
                <div key={f.key} className={`${f.color} rounded-xl p-5 text-center`}>
                  <div className="text-3xl mb-2">{f.icon}</div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t(f.label)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-8">
          <div className="card border-l-4 border-primary-600">
            <div className="text-3xl mb-3">🎯</div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-3">{t('about.missionTitle')}</h3>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{t('about.missionDesc')}</p>
          </div>
          <div className="card border-l-4 border-green-500">
            <div className="text-3xl mb-3">🔭</div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-3">{t('about.visionTitle')}</h3>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{t('about.visionDesc')}</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-white dark:bg-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">{t('about.howItWorks')}</h2>
          </div>
          <div className="space-y-4">
            {[
              { step:1, titleKey:'about.step1Title',   descKey:'about.step1Desc' },
              { step:2, titleKey:'about.step2Title',  descKey:'about.step2Desc' },
              { step:3, titleKey:'about.step3Title',             descKey:'about.step3Desc' },
              { step:4, titleKey:'about.step4Title',  descKey:'about.step4Desc' },
              { step:5, titleKey:'about.step5Title',  descKey:'about.step5Desc' },
              { step:6, titleKey:'about.step6Title',       descKey:'about.step6Desc' },
              { step:7, titleKey:'about.step7Title',           descKey:'about.step7Desc' },
              { step:8, titleKey:'about.step8Title',           descKey:'about.step8Desc' },
            ].map((s) => (
              <div key={s.step} className="flex gap-4 items-start">
                <div className="w-9 h-9 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-sm shrink-0">{s.step}</div>
                <div className="card flex-1 py-3 px-4">
                  <p className="font-semibold text-gray-800 dark:text-gray-200">{t(s.titleKey)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t(s.descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">{t('about.valuesTitle')}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { key:'transparency', icon:'🔍', titleKey:'about.valueTransparency',           descKey:'about.valueTransparencyDesc' },
              { key:'accountability', icon:'⚖️', titleKey:'about.valueAccountability',         descKey:'about.valueAccountabilityDesc' },
              { key:'collaboration', icon:'🤝', titleKey:'about.valueCollaboration',          descKey:'about.valueCollaborationDesc' },
              { key:'integrity', icon:'💎', titleKey:'about.valueIntegrity',              descKey:'about.valueIntegrityDesc' },
              { key:'innovation', icon:'💡', titleKey:'about.valueInnovation',             descKey:'about.valueInnovationDesc' },
              { key:'empowerment', icon:'🌱', titleKey:'about.valueEmpowerment',  descKey:'about.valueEmpowermentDesc' },
            ].map((v) => (
              <div key={v.key} className="card hover:shadow-md transition-shadow">
                <div className="text-3xl mb-3">{v.icon}</div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{t(v.titleKey)}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{t(v.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* User Roles */}
      <section className="py-16 bg-white dark:bg-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">{t('about.usersTitle')}</h2>
            <p className="text-gray-500 dark:text-gray-400">{t('about.usersDesc')}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">{t('about.userType')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">{t('about.userPurpose')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {[
                  ['citizen', '👤', 'about.roleCitizen', 'about.roleCitizenDesc'],
                  ['government', '🏛️', 'about.roleGovernment', 'about.roleGovernmentDesc'],
                  ['ngo', '🤝', 'about.roleNgo', 'about.roleNgoDesc'],
                  ['volunteer', '🙋', 'about.roleVolunteer', 'about.roleVolunteerDesc'],
                  ['admin', '⚙️', 'about.roleAdmin', 'about.roleAdminDesc'],
                ].map(([id, emoji, typeKey, descKey]) => (
                  <tr key={id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{emoji} {t(typeKey)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t(descKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 bg-primary-700 text-white text-center">
        <div className="max-w-xl mx-auto px-4">
          <h2 className="text-2xl font-bold mb-3">{t('about.ctaTitle')}</h2>
          <p className="text-primary-100 mb-6">{t('about.ctaDesc')}</p>
          <Link to="/register" className="bg-white text-primary-700 hover:bg-primary-50 font-semibold py-3 px-8 rounded-xl transition-colors inline-block">{t('hero.getStarted')}</Link>
        </div>
      </section>
    </div>
  );
}
