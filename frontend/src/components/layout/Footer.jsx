import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();

  const quickLinks = [
    { to: '/',                       label: t('nav.home') },
    { to: '/about',                  label: t('nav.about') },
    { to: '/infrastructure-reports', label: t('nav.infrastructure') },
    { to: '/emergency-requests',     label: t('nav.emergency') },
    { to: '/track-report',           label: t('nav.trackReport') || 'Track Report' },
    { to: '/news',                   label: t('nav.news') },
  ];

  const serviceLinks = [
    { to: '/faq',            label: t('nav.faq') },
    { to: '/contact',        label: t('nav.contact') },
    { to: '/register',       label: t('nav.register') },
    { to: '/login',          label: t('nav.login') },
    { to: '/privacy-policy', label: t('footer.privacyPolicy') },
    { to: '/terms',          label: t('footer.terms') },
  ];

  return (
    <footer className="bg-gray-900 text-gray-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">

          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center text-white font-bold text-lg">E</div>
              <span className="font-bold text-xl text-white">EthioBridge</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mb-4">{t('footer.tagline')}</p>
            <div className="flex gap-3">
              {['f', 't', 'in', 'yt'].map((s) => (
                <a key={s} href="#" className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-xs text-gray-400 hover:bg-primary-600 hover:text-white transition-colors uppercase font-bold">{s}</a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-semibold mb-4">{t('footer.quickLinks')}</h4>
            <ul className="space-y-2 text-sm">
              {quickLinks.map((l) => (
                <li key={l.to}><Link to={l.to} className="hover:text-white transition-colors">{l.label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-white font-semibold mb-4">{t('footer.services')}</h4>
            <ul className="space-y-2 text-sm">
              {serviceLinks.map((l) => (
                <li key={l.to}><Link to={l.to} className="hover:text-white transition-colors">{l.label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-semibold mb-4">{t('footer.contactInfo')}</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li className="flex items-start gap-2"><span>📍</span><span>{t('footer.address')}</span></li>
              <li className="flex items-start gap-2"><span>📞</span><span>{t('footer.phone')}</span></li>
              <li className="flex items-start gap-2"><span>✉️</span><span>{t('footer.email')}</span></li>
              <li className="flex items-start gap-2"><span>🕒</span><span>{t('footer.hours')}</span></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500">
          <span>© {t('footer.copyright')}</span>
          <div className="flex gap-4">
            <Link to="/privacy-policy" className="hover:text-gray-300 transition-colors">{t('footer.privacyPolicy')}</Link>
            <Link to="/terms" className="hover:text-gray-300 transition-colors">{t('footer.terms')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
