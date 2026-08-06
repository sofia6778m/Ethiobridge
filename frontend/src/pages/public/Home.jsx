import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FaHeart } from 'react-icons/fa';
import { publicAPI, newsAPI } from '../../services/api';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AlertBanner from '../../components/common/AlertBanner';

const REGIONS = ['Addis Ababa','Oromia','Amhara','Tigray','Somali','Afar','Sidama','Central Ethiopia','South Ethiopia','Southwest Ethiopia','Gambella','Benishangul-Gumuz','Harari','Dire Dawa'];

export default function Home() {
  const { t } = useTranslation();
  const [stats, setStats]           = useState(null);
  const [latestNews, setLatestNews] = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, n] = await Promise.all([
          publicAPI.getStats(),
          newsAPI.getPublic({ limit: 4 }),
        ]);
        setStats(s.data.stats);
        setLatestNews(n.data.news || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const statItems = stats ? [
    { icon:'📋', label:t('home.totalReports'),       value: stats.totalReports,       color:'bg-blue-100 dark:bg-blue-900/30',   iconColor:'text-blue-600 dark:text-blue-400' },
    { icon:'⚡', label:t('home.activeReports'),      value: stats.activeReports,      color:'bg-orange-100 dark:bg-orange-900/30', iconColor:'text-orange-600 dark:text-orange-400' },
    { icon:'✅', label:t('home.resolvedReports'),    value: stats.resolvedReports,    color:'bg-green-100 dark:bg-green-900/20',  iconColor:'text-green-600 dark:text-green-400' },
    { icon:'📢', label:'Public Complaints',          value: stats.publicComplaints ?? 0, color:'bg-amber-100 dark:bg-amber-900/30', iconColor:'text-amber-600 dark:text-amber-400' },
    { icon:'👥', label:t('home.registeredCitizens'), value: stats.registeredCitizens, color:'bg-purple-100 dark:bg-purple-900/30', iconColor:'text-purple-600 dark:text-purple-400' },
    { icon:'🏛️', label:t('home.govOrgs'),            value: stats.govOrgs,            color:'bg-yellow-100 dark:bg-yellow-900/30', iconColor:'text-yellow-600 dark:text-yellow-400' },
    { icon:'🤝', label:t('home.ngoOrgs'),            value: stats.ngoOrgs,            color:'bg-pink-100 dark:bg-pink-900/30',   iconColor:'text-pink-600 dark:text-pink-400' },
    { icon:'🙋', label:t('home.volunteers'),         value: stats.volunteers,         color:'bg-teal-100 dark:bg-teal-900/30',   iconColor:'text-teal-600 dark:text-teal-400' },
    { icon:'🗺️', label:t('home.regionsCovered'),     value: stats.regionsCovered,     color:'bg-indigo-100 dark:bg-indigo-900/30', iconColor:'text-indigo-600 dark:text-indigo-400' },
  ] : [];

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[600px] flex items-center justify-center overflow-hidden">
        {/* Background Image - Community Working Together */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/images/community-teamwork.jpg')" }}
        />
        {/* Dark Overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary-900/80 via-primary-800/70 to-primary-900/80" />
        {/* Additional gradient for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        
        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-4 py-2 rounded-full text-sm mb-8 tracking-wide border border-white/20">
            <span>🇪🇹</span>
            <span>{t('hero.badge')}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6 text-white drop-shadow-lg">
            {t('hero.heading')} <span className="text-yellow-300">{t('hero.headingHighlight')}</span> {t('hero.headingEnd')}
          </h1>
          <p className="text-lg sm:text-xl text-white/90 mb-10 leading-relaxed max-w-2xl mx-auto drop-shadow">
            {t('hero.description')}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/report"
              className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors shadow-lg"
            >
              Create Report
            </Link>
            <Link
              to="/track-complaint"
              className="bg-white/10 backdrop-blur-sm border border-white/30 hover:bg-white/20 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Check Status
            </Link>
            <Link to="/about" className="bg-white/10 backdrop-blur-sm border border-white/30 hover:bg-white/20 text-white font-semibold py-3 px-8 rounded-xl transition-colors">
              {t('hero.learnMore')}
            </Link>

          </div>
        </div>
      </section>

      {/* Live Public Alerts Banner */}
      <AlertBanner />

      {/* Quick Report Cards */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">{t('home.reportTitle')}</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">{t('home.reportDesc')}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon:'🏗️', title:'Infrastructure Report', desc:'Report damaged roads, bridges, water supply, electricity, drainage, schools, hospitals, and other public infrastructure.', btnText:'Create Infrastructure Report', to:'/report/infrastructure', color:'bg-blue-600', light:'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
              { icon:'⚖️', title:'Governance Complaint', desc:'Report corruption, service delays, staff misconduct, poor government service, lack of transparency, office-related complaints, and other governance issues.', btnText:'Create Governance Complaint', to:'/report/governance-complaint', color:'bg-emerald-600', light:'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' },
              { icon:'📢', title:'Public Alerts & Broadcasts', desc:'Receive real-time weather updates and public service advisories directly from government authorities.', btnText:'View Active Alerts', to:'/alerts', color:'bg-red-600', light:'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400', badge: true },
            ].map((c, i) => (
              <div key={i} className="card hover:shadow-lg transition-shadow group">
                <div className={`w-14 h-14 rounded-xl ${c.light} flex items-center justify-center text-2xl mb-4`}>{c.icon}</div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">{c.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">{c.desc}</p>
                {c.badge && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {['🌊 Flood','🌧️ Rainfall','🚧 Road','🏥 Health','⚡ Power'].map(tag => (
                      <span key={tag} className="text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
                <Link to={c.to} className={`${c.color} hover:opacity-90 text-white text-sm font-semibold py-2.5 px-5 rounded-lg transition-opacity inline-block ${c.badge ? 'mt-auto' : ''}`}>
                  {c.btnText}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fundraising Card - Glassmorphism Hero Card */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-500 to-primary-700" />
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5L35 20H50L38 30L42 45L30 36L18 45L22 30L10 20H25Z' fill='white' fill-opacity='0.15'/%3E%3C/svg%3E')" }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="grid lg:grid-cols-2 gap-0">
              {/* Left Content */}
              <div className="p-8 sm:p-10 lg:p-12 flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-medium text-white/90 border border-white/20 mb-5 w-fit">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Active Fundraising Campaigns
                </div>

                <h3 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-3">
                  ❤️ Emergency & Infrastructure Fundraising
                </h3>
                <p className="text-base sm:text-lg text-white/80 mb-2 font-medium">
                  የአደጋና የመሠረተ ልማት የገንዘብ ማሰባሰቢያ
                </p>
                <p className="text-sm text-white/70 mb-6 max-w-lg">
                  Support emergency response and infrastructure development across Ethiopia. Your donation builds roads, schools, hospitals, and provides critical aid.
                </p>

                {/* Progress Ring - SVG */}
                <div className="flex items-center gap-6 mb-6">
                  <div className="relative w-24 h-24 shrink-0">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
                      <motion.circle
                        cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 42}`}
                        initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                        whileInView={{ strokeDashoffset: 2 * Math.PI * 42 * 0.35 }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.5, ease: 'easeOut' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-white font-bold text-lg">65%</p>
                        <p className="text-white/60 text-[10px]">Funded</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {[
                      { label: 'Active Campaigns', value: '12', color: 'text-green-300' },
                      { label: 'Total Raised', value: '₿ 2.7M', color: 'text-yellow-300' },
                      { label: 'Total Donors', value: '1,847', color: 'text-blue-300' },
                      { label: 'Success Rate', value: '94%', color: 'text-emerald-300' },
                    ].map((s, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                      >
                        <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-white/60">{s.label}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/fundraising"
                    className="inline-flex items-center gap-2 bg-white text-red-600 hover:bg-red-50 font-bold py-3 px-7 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <FaHeart /> Donate Now
                  </Link>
                  <Link
                    to="/fundraising"
                    className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/30 hover:bg-white/20 text-white font-semibold py-3 px-7 rounded-xl transition-all"
                  >
                    View Campaigns
                  </Link>
                </div>
              </div>

              {/* Right Image */}
              <div className="relative min-h-[300px] lg:min-h-full overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=800&q=80"
                  alt="Fundraising"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-red-600/60 via-transparent to-transparent lg:bg-gradient-to-l" />
                <div className="absolute bottom-6 left-6 right-6 backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {[1,2,3,4].map((_, i) => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-primary-500 flex items-center justify-center text-white text-xs font-bold">
                          {String.fromCharCode(65 + i)}
                        </div>
                      ))}
                      <div className="w-8 h-8 rounded-full border-2 border-white bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                        +42
                      </div>
                    </div>
                    <div>
                      <p className="text-white text-sm font-semibold">Recent Donors</p>
                      <p className="text-white/60 text-xs">Join them in making a difference</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Statistics */}
      {loading ? <LoadingSpinner /> : stats && (
        <section className="py-16 bg-white dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">{t('home.statsTitle')}</h2>
              <p className="text-gray-500 dark:text-gray-400">{t('home.statsDesc')}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {statItems.map((s, i) => (
                <div key={i} className="card text-center">
                  <div className={`w-12 h-12 rounded-xl ${s.color} ${s.iconColor} flex items-center justify-center text-2xl mx-auto mb-3`}>{s.icon}</div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{s.value?.toLocaleString() ?? 0}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Interactive Map, Risk Level Map, Latest Reports, and Success Stories removed */}

      {/* News */}
      {latestNews.length > 0 && (
        <section className="py-16 bg-gray-50 dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('home.newsTitle')}</h2>
              <Link to="/news" className="text-primary-600 hover:underline text-sm font-medium">{t('home.allNews')}</Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {latestNews.map((n) => (
                <Link key={n._id} to={`/news/${n._id}`} className="card hover:shadow-md transition-shadow group">
                  {n.featuredImage && <img src={n.featuredImage} alt="" className="w-full h-36 object-cover rounded-lg mb-3" />}
                  <span className="text-xs font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded-full">{n.category}</span>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-2 group-hover:text-primary-600 transition-colors line-clamp-2">{n.title}</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{new Date(n.publishedAt || n.createdAt).toLocaleDateString()}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Partners */}
      <section className="py-12 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-6 font-medium">{t('home.partners')}</p>
          <div className="flex flex-wrap justify-center gap-6">
            {['Ministry of Infrastructure','FDRE Government','Ethiopian Red Cross','UNICEF Ethiopia','WFP Ethiopia','Volunteer Ethiopia'].map((p) => (
              <div key={p} className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-3 text-sm text-gray-600 dark:text-gray-400 font-medium shadow-sm">{p}</div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary-700 text-white text-center">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-4">{t('home.ctaTitle')}</h2>
          <p className="text-primary-100 mb-8">{t('home.ctaDesc')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/register" className="bg-white text-primary-700 hover:bg-primary-50 font-semibold py-3 px-8 rounded-xl transition-colors">{t('home.registerNow')}</Link>
            <Link to="/about" className="border border-white/40 hover:bg-white/10 text-white font-semibold py-3 px-8 rounded-xl transition-colors">{t('hero.learnMore')}</Link>
          </div>
        </div>
      </section>

    </div>
  );
}
